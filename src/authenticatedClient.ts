import axios, { AxiosRequestConfig, AxiosResponse, AxiosStatic } from 'axios';
import jwt from 'jsonwebtoken';

/** One credential owner for polling and both recipe accessory layouts. */
export class AuthenticatedClient {
  private token?: string;
  private expiresAt = 0;
  private loginInFlight?: Promise<string>;

  constructor(
    private readonly login: () => Promise<string>,
    private readonly http: Pick<AxiosStatic, 'get' | 'post'> = axios,
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && (!this.expiresAt || this.expiresAt > this.now() + 60_000)) {
      return this.token;
    }
    if (!this.loginInFlight) {
      this.loginInFlight = (async () => {
        const token = await this.login();
        if (typeof token !== 'string' || !token) {
          throw new Error('Tovala login returned no token');
        }
        const payload = jwt.decode(token);
        const exp = payload && typeof payload === 'object' ? payload.exp : undefined;
        const expiresAt = typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : 0;
        if (expiresAt && expiresAt <= this.now()) {
          throw new Error('Tovala login returned an expired token');
        }
        this.token = token;
        this.expiresAt = expiresAt;
        return token;
      })();
    }
    const pending = this.loginInFlight;
    try {
      return await pending;
    } finally {
      if (this.loginInFlight === pending) {
        this.loginInFlight = undefined;
      }
    }
  }

  private invalidate(rejected: string): void {
    // A delayed 401 must not discard a token another request just renewed.
    if (this.token === rejected) {
      this.token = undefined;
      this.expiresAt = 0;
    }
  }

  async get<T = unknown>(url: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    const token = await this.getToken();
    try {
      return await this.http.get<T>(url, this.config(token, config));
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401) {
        throw error;
      }
      this.invalidate(token);
      const renewed = await this.getToken();
      // Exactly one replay, for a read only; a second 401 remains a failure.
      return this.http.get<T>(url, this.config(renewed, config));
    }
  }

  async post<T = unknown>(url: string, data: unknown, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
    const token = await this.getToken();
    try {
      return await this.http.post<T>(url, data, this.config(token, config));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.invalidate(token);
      }
      // Never replay a cook/start command: its outcome may be uncertain.
      throw error;
    }
  }

  private config(token: string, config: AxiosRequestConfig): AxiosRequestConfig {
    return { timeout: 10_000, ...config, headers: { ...config.headers, Authorization: `Bearer ${token}` } };
  }
}

/** Axios errors include request headers/passwords; never log the raw object. */
export function requestErrorSummary(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status) {
      return `HTTP ${error.response.status}`;
    }
    if (error.code && /^[A-Z0-9_]{1,40}$/.test(error.code)) {
      return error.code;
    }
  }
  return 'request failed';
}
