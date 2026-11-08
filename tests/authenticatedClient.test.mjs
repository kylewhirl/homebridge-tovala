import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { AxiosError } from 'axios';
import { AuthenticatedClient, requestErrorSummary } from '../dist/authenticatedClient.js';
import { TovalaOvenDoneSensor } from '../dist/ovenSensor.js';
import { TovalaSmartOvenPlatform } from '../dist/platform.js';
import { TovalaOvenAccessory } from '../dist/platformAccessory.js';

const now = 1_800_000_000_000;
const token = (name, exp = now / 1000 + 3600) =>
  `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ name, exp })).toString('base64url')}.signature`;
const unauthorized = (status = 401) => new AxiosError('private request data', 'ERR_BAD_REQUEST',
  { headers: { Authorization: 'Bearer PRIVATE', password: 'PRIVATE' } }, undefined, { status });
function fixture({ login, get, post } = {}) {
  const calls = { login: 0, get: [], post: [] };
  const http = {
    get: async (url, config) => {
      calls.get.push({ url, config }); return get ? get(url, config, calls) : { data: { state: 'idle' } };
    },
    post: async (url, data, config) => {
      calls.post.push({ url, data, config }); return post ? post(url, data, config, calls) : { status: 200 };
    },
  };
  const client = new AuthenticatedClient(async () => {
    calls.login++;
    return login ? login(calls.login) : token('login-' + calls.login);
  }, http, () => now);
  return { client, calls };
}

test('fresh token is cached and used by both reads and commands', async () => {
  const { client, calls } = fixture();
  await client.get('/status'); await client.post('/cook/start', { barcode: 'fixture' });
  assert.equal(calls.login, 1);
  assert.equal(calls.get[0].config.headers.Authorization, calls.post[0].config.headers.Authorization);
  assert.equal(calls.get[0].config.timeout, 10_000);
});

test('JWT nearing expiration is renewed before sending a command', async () => {
  const { client, calls } = fixture({ login: n => token('login-' + n, now / 1000 + (n === 1 ? 30 : 3600)) });
  await client.getToken(); await client.post('/cook/start', {});
  assert.equal(calls.login, 2); assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0].config.headers.Authorization, 'Bearer ' + token('login-2'));
});

test('401 on read renews and replays exactly once with new credentials', async () => {
  const { client, calls } = fixture({ get: (_u, _c, c) => {
    if (c.get.length === 1) {
      throw unauthorized();
    } return { data: 'ok' };
  } });
  assert.equal((await client.get('/status')).data, 'ok');
  assert.equal(calls.login, 2); assert.equal(calls.get.length, 2);
  assert.notEqual(calls.get[0].config.headers.Authorization, calls.get[1].config.headers.Authorization);
});

test('a second 401 is surfaced, not retried indefinitely', async () => {
  const { client, calls } = fixture({ get: () => {
    throw unauthorized();
  } });
  await assert.rejects(client.get('/status'));
  assert.equal(calls.login, 2); assert.equal(calls.get.length, 2);
});

for (const status of [403, 429, 500]) {
  test(`HTTP ${status} does not cause reauthentication or replay`, async () => {
    const { client, calls } = fixture({ get: () => {
      throw unauthorized(status);
    } });
    await assert.rejects(client.get('/status'));
    assert.equal(calls.login, 1); assert.equal(calls.get.length, 1);
  });
}

test('timeout is not mistaken for token expiration', async () => {
  const { client, calls } = fixture({ get: () => {
    throw new AxiosError('secret', 'ECONNABORTED');
  } });
  await assert.rejects(client.get('/status'));
  assert.equal(calls.login, 1); assert.equal(calls.get.length, 1);
});

test('concurrent initial requests share one login', async () => {
  const { client, calls } = fixture();
  await Promise.all(Array.from({ length: 8 }, () => client.get('/status')));
  assert.equal(calls.login, 1); assert.equal(calls.get.length, 8);
});

test('concurrent rejected reads share one renewal', async () => {
  let finish;
  const old = token('old');
  const { client, calls } = fixture({
    login: n => n === 1 ? old : new Promise(resolve => {
      finish = resolve;
    }),
    get: (_u, c) => {
      if (c.headers.Authorization === 'Bearer ' + old) {
        throw unauthorized();
      } return { data: 'ok' };
    },
  });
  await client.getToken();
  const reads = Array.from({ length: 8 }, () => client.get('/status'));
  await setImmediate(); finish(token('new'));
  await Promise.all(reads);
  assert.equal(calls.login, 2); assert.equal(calls.get.length, 16);
});

test('late old-token rejection does not invalidate newly renewed credentials', async () => {
  let rejectLate;
  const { client, calls } = fixture({ get: (url, _c, c) => {
    if (url === '/late' && c.get.length === 1) {
      return new Promise((_resolve, reject) => {
        rejectLate = reject;
      });
    }
    if (url === '/refresh' && c.get.length === 2) {
      throw unauthorized();
    }
    return { data: 'ok' };
  } });
  const late = client.get('/late'); await setImmediate();
  await client.get('/refresh'); rejectLate(unauthorized()); await late;
  assert.equal(calls.login, 2);
});

test('failed login releases single-flight lock for a later normal poll', async () => {
  const { client, calls } = fixture({ login: n => {
    if (n === 1) {
      throw unauthorized();
    } return token('new');
  } });
  await assert.rejects(client.get('/status')); await client.get('/status');
  assert.equal(calls.login, 2); assert.equal(calls.get.length, 1);
});

test('401 on command is never replayed; a later user command can renew', async () => {
  const { client, calls } = fixture({ post: (_u, _d, _c, c) => {
    if (c.post.length === 1) {
      throw unauthorized();
    } return { status: 200 };
  } });
  await assert.rejects(client.post('/cook/start', {}));
  assert.equal(calls.post.length, 1); assert.equal(calls.login, 1);
  await client.post('/cook/start', {});
  assert.equal(calls.post.length, 2); assert.equal(calls.login, 2);
});

test('ambiguous command timeout is never replayed', async () => {
  const { client, calls } = fixture({ post: () => {
    throw new AxiosError('private', 'ECONNABORTED');
  } });
  await assert.rejects(client.post('/cook/start', {}));
  assert.equal(calls.post.length, 1); assert.equal(calls.login, 1);
});

test('missing or expired login token cannot be sent to the oven API', async () => {
  for (const bad of ['', token('expired', now / 1000 - 1)]) {
    const { client, calls } = fixture({ login: () => bad });
    await assert.rejects(client.get('/status')); assert.equal(calls.get.length, 0);
  }
});

test('opaque tokens without exp can still recover on 401', async () => {
  const { client, calls } = fixture({ login: n => 'opaque-' + n,
    get: (_u, _c, c) => {
      if (c.get.length === 1) {
        throw unauthorized();
      } return { data: 'ok' };
    } });
  await client.get('/status'); assert.equal(calls.login, 2);
});

test('caller headers cannot accidentally restore a stale bearer token', async () => {
  const { client, calls } = fixture();
  await client.get('/status', { headers: { Authorization: 'stale', Accept: 'application/json' } });
  assert.equal(calls.get[0].config.headers.Authorization, 'Bearer ' + token('login-1'));
  assert.equal(calls.get[0].config.headers.Accept, 'application/json');
});

test('safe error summaries never expose request headers, passwords or response bodies', () => {
  assert.equal(requestErrorSummary(unauthorized()), 'HTTP 401');
  assert.equal(requestErrorSummary(new AxiosError('PRIVATE', 'ECONNABORTED')), 'ECONNABORTED');
  assert.equal(requestErrorSummary(new Error('PRIVATE')), 'request failed');
});

test('actual status watcher recovers a rejected read without triggering oven-done motion', async t => {
  const { client, calls } = fixture({ get: (_u, _c, c) => {
    if (c.get.length === 1) {
      throw unauthorized();
    } return { data: { state: 'idle' } };
  } });
  const updates = [], messages = [];
  const platform = { client, config: { userId: 'fixture' }, Service: { MotionSensor: 'sensor' },
    Characteristic: { MotionDetected: 'motion' },
    log: { debug() {}, info: (...v) => messages.push(v.join(' ')), warn: (...v) => messages.push(v.join(' ')) } };
  const accessory = { getService: () => ({ updateCharacteristic: (...v) => updates.push(v) }) };
  const watcher = new TovalaOvenDoneSensor(platform, accessory, 'fixture', 30);
  t.after(() => watcher.stop()); await watcher.watchCook();
  assert.equal(calls.login, 2); assert.equal(calls.post.length, 0);
  assert(!updates.some(update => update[1] === true));
  assert(messages.some(m => m.includes('polling connected (state=idle)')));
});

test('actual grouped-recipe path sends a rejected command only once', async () => {
  const { client, calls } = fixture({ post: () => {
    throw unauthorized();
  } });
  const platform = Object.create(TovalaSmartOvenPlatform.prototype);
  Object.assign(platform, { client, config: { userId: 'fixture' }, doneSensor: { watchCook: () => assert.fail('failed command cannot start watching') } });
  await assert.rejects(platform.startCooking('fixture', 'fixture'));
  assert.equal(calls.post.length, 1);
});

test('actual standalone-recipe path uses the shared client and never replays a command', async () => {
  const { client, calls } = fixture({ post: () => {
    throw unauthorized();
  } });
  const errors = [];
  const accessory = Object.create(TovalaOvenAccessory.prototype);
  Object.assign(accessory, { barcode: 'fixture', ovenId: 'fixture', accessory: { displayName: 'fixture' },
    platform: { client, config: { userId: 'fixture' }, log: { debug() {}, error: (...args) => errors.push(args.join(' ')) } } });
  await assert.rejects(accessory.startCooking());
  assert.equal(calls.post.length, 1);
  assert(errors.some(s => s.includes('HTTP 401')));
  assert(!errors.some(s => s.includes('PRIVATE')));
});

test('stopping the actual watcher during an in-flight read cannot schedule another poll', async () => {
  let finish;
  const { client } = fixture({ get: () => new Promise(resolve => {
    finish = resolve;
  }) });
  const watcher = new TovalaOvenDoneSensor({ client, config: { userId: 'fixture' },
    Service: { MotionSensor: 'sensor' }, Characteristic: { MotionDetected: 'motion' },
    log: { debug() {}, info() {
      assert.fail('stopped watcher must remain stopped');
    }, warn() {} } },
  { getService: () => ({ updateCharacteristic() {} }) }, 'fixture', 30);
  const pending = watcher.watchCook(); await setImmediate(); watcher.stop();
  finish({ data: { state: 'idle' } }); await pending;
  assert.equal(watcher.pollTimer, undefined);
});
