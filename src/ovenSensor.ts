// ==== ovenSensor.ts ==========================================================

import axios from 'axios';
import { Service, PlatformAccessory } from 'homebridge';
import { TovalaSmartOvenPlatform } from './platform.js';


/**
 * Date.parse cannot handle more than 3 fractional‑second digits.
 * Tovala returns timestamps like "2025-06-06T07:23:00.000002706Z".
 * This trims to millisecond precision so Date.parse works.
 */
function parseIsoMillis(iso: string): number {
  return Date.parse(iso.replace(/\.(\d{3})\d+Z$/, '.$1Z'));
}

export class TovalaOvenDoneSensor {
  private service: Service;
  private pollTimer?: NodeJS.Timeout;
  private timeoutTimer?: NodeJS.Timeout;
  private readonly pollIntervalSec: number;
  private endTimeMs?: number;            // current cook’s expected end (epoch ms)
  private triggerTimer?: NodeJS.Timeout; // fires motion exactly at end‑time
  private watching: boolean = false;

  constructor(
    private readonly platform: TovalaSmartOvenPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly ovenId: string,
    pollIntervalSec: number,
  ) {
    this.service = accessory.getService(platform.Service.MotionSensor)
      ?? accessory.addService(platform.Service.MotionSensor, 'Oven Done');

    this.pollIntervalSec = pollIntervalSec;

    // Ensure the characteristic exists and is off at boot
    this.service.updateCharacteristic(
      platform.Characteristic.MotionDetected, false);
  }

  /**
   * Called every time the user starts a cook.
   * Cancels any running watcher and starts a new one.
   */
  public async watchCook(token: string): Promise<void> {
    if (this.watching) {
      this.platform.log.debug('[OvenDoneSensor] Already watching; skipping new watchCook call');
      return;
    }
    this.watching = true;
    this.cleanup();

    this.endTimeMs = undefined;
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
    }
    this.triggerTimer = undefined;

    const poll = async () => {
      this.platform.log.debug(`[OvenDoneSensor] Polling cook status for oven ${this.ovenId}`);
      const statusUrl =
        `https://api.beta.tovala.com/v0/users/${this.platform.config.userId}` +
        `/ovens/${this.ovenId}/cook/status`;

      try {
        const { data } = await axios.get(statusUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.platform.log.debug(`[OvenDoneSensor] Received status: state=${data.state}, estimated_end_time=${data.estimated_end_time}`);
        if (!this.watching) {
          return;
        }

        if (!data.estimated_end_time) {
          // Oven is idle → keep polling every configured interval
          this.platform.log.debug('[OvenDoneSensor] Oven idle; polling again in ' +
            `${this.pollIntervalSec}s`);
          this.pollTimer = setTimeout(poll, this.pollIntervalSec * 1000);
          return;
        }

        if (data.state === 'cooking') {
          const end = parseIsoMillis(data.estimated_end_time);
          const now = Date.now();
          const timeUntilEnd = end - now;

          // Update stored end-time if it changed
          if (this.endTimeMs !== end) {
            this.platform.log.debug('[OvenDoneSensor] Updated end-time from API');
            this.endTimeMs = end;
          }

          if (timeUntilEnd > 10_000) {
            // We are more than 10s away → schedule ONE check at (end‑10s)
            const delay = timeUntilEnd - 10_000;
            this.platform.log.debug('[OvenDoneSensor] Scheduling pre-finish check ' +
              `in ${Math.ceil(delay / 1000)}s`);
            clearTimeout(this.pollTimer as NodeJS.Timeout);
            this.pollTimer = setTimeout(poll, delay);
          } else if (timeUntilEnd > 0) {
            // 10s window → schedule motion trigger exactly at finish
            if (!this.triggerTimer) {
              this.platform.log.debug('[OvenDoneSensor] Within 10 s; arming motion trigger');
              this.triggerTimer = setTimeout(() => {
                // Fire motion only if still cooking and end-time unchanged
                if (this.endTimeMs === end && this.watching) {
                  this.triggerMotion();
                }
                this.watching = false;
                this.triggerTimer = undefined;
              }, timeUntilEnd);
            }
            // No further polling while waiting for trigger
          } else {
            // end‑time already passed but still cooking → retry pre‑finish logic in 10s
            this.platform.log.debug('[OvenDoneSensor] Passed end-time; will retry in 10s');
            clearTimeout(this.pollTimer as NodeJS.Timeout);
            this.pollTimer = setTimeout(poll, 10_000);
          }
          return;
        }

        // Oven no longer cooking – cancel pending trigger
        if (this.triggerTimer) {
          clearTimeout(this.triggerTimer);
          this.triggerTimer = undefined;
        }
        // Continue polling every interval while idle
        this.pollTimer = setTimeout(poll, this.pollIntervalSec * 1000);
        return;
      } catch (err) {
        this.platform.log.warn('Cook-status poll failed:', err);
        this.platform.log.debug(`[OvenDoneSensor] Error polling status, retrying in ${this.pollIntervalSec} seconds`);
        // try again in the configured interval
        this.pollTimer = setTimeout(poll, this.pollIntervalSec * 1000);
        return;
      }

      // If we’re here the cook is done
      this.triggerMotion();
      this.watching = false;
    };

    poll();
  }

  private triggerMotion(): void {
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
      this.triggerTimer = undefined;
    }
    this.platform.log.debug(`[OvenDoneSensor] Triggering motion event for oven ${this.ovenId}`);
    this.service.updateCharacteristic(
      this.platform.Characteristic.MotionDetected, true);

    // Auto‑reset after 30s (Home will show a quick notification)
    this.timeoutTimer = setTimeout(() => {
      this.service.updateCharacteristic(
        this.platform.Characteristic.MotionDetected, false);
    }, 30_000);
  }

  private cleanup(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
      this.triggerTimer = undefined;
    }
  }
  /** Called by the platform on shutdown to clear timers */
  public stop(): void {
    this.cleanup();
  }
}