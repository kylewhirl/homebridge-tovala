// ==== ovenSensor.ts ==========================================================

import axios from 'axios';
import { Service, PlatformAccessory } from 'homebridge';
import { TovalaSmartOvenPlatform } from './platform.js';


/**
 * Date.parse cannot handle more than 3 fractional‑second digits.
 * Tovala returns timestamps like "2025-06-06T07:23:00.000002706Z".
 * This trims to millisecond precision so Date.parse works.
 */

/* ---------------------------------------------------------------------------
   LEGACY END‑TIME–BASED LOGIC  (commented out 2025‑06‑06 at user request)

   The code below implemented the original scheduling strategy:

     • When state === 'cooking', store estimated_end_time (→ endTimeMs).
     • Poll again at (endTimeMs ‑ 10 s) to verify oven still cooking
       and end‑time unchanged.
     • In the last 10‑second window set triggerTimer to fire motion exactly
       at endTimeMs.
     • If the oven reports idle early, cancel triggerTimer and resume
       interval polling.
     • If the API updates the end‑time mid‑cook, update endTimeMs and
       reschedule the 10‑second check.

   It was removed temporarily because the /cook/status endpoint’s
   estimated_end_time is sometimes stale.  Uncomment and adjust as needed
   if the API becomes reliable again.
------------------------------------------------------------------------------

  // private endTimeMs?: number;            // expected end (epoch ms)
  // private triggerTimer?: NodeJS.Timeout; // fires at end‑time

  // function schedulePreFinishCheck(nowMs: number, endMs: number): void {
  //   const lead   = 10_000;                       // 10 seconds
  //   const delay  = Math.max(0, endMs - nowMs - lead);
  //   clearTimeout(this.pollTimer as NodeJS.Timeout);
  //   this.pollTimer = setTimeout(poll, delay);
  // }

  // function armTrigger(timeUntilEnd: number): void {
  //   if (this.triggerTimer) return;
  //   this.triggerTimer = setTimeout(() => {
  //     if (this.watching && this.endTimeMs === endMs) {
  //       this.triggerMotion();
  //     }
  //     this.watching = false;
  //     this.triggerTimer = undefined;
  //   }, timeUntilEnd);
  // }

---------------------------------------------------------------------------- */

export class TovalaOvenDoneSensor {
  private service: Service;
  private pollTimer?: NodeJS.Timeout;
  private timeoutTimer?: NodeJS.Timeout;
  private readonly pollIntervalSec: number;
  // private endTimeMs?: number;            // current cook’s expected end (epoch ms)
  // private triggerTimer?: NodeJS.Timeout; // fires motion exactly at end‑time
  private watching: boolean = false;
  private isCooking = false;        // tracks last known state

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

    // this.endTimeMs = undefined;
    // if (this.triggerTimer) {
    //   clearTimeout(this.triggerTimer);
    // }
    // this.triggerTimer = undefined;
    this.isCooking = false;  // reset state tracker

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

        const currentlyCooking = data.state === 'cooking';

        // Detect state transition
        if (currentlyCooking && !this.isCooking) {
          this.platform.log.debug('[OvenDoneSensor] Detected oven just started cooking');
          this.isCooking = true;
        } else if (!currentlyCooking && this.isCooking) {
          this.platform.log.debug('[OvenDoneSensor] Cooking finished ‑ triggering motion');
          this.triggerMotion();
          this.isCooking = false;
        }

        // Schedule next regular poll
        this.pollTimer = setTimeout(poll, this.pollIntervalSec * 1000);
        return;
      } catch (err) {
        this.platform.log.warn('Cook-status poll failed:', err);
        this.platform.log.debug(`[OvenDoneSensor] Error polling status, retrying in ${this.pollIntervalSec} seconds`);
        // try again in the configured interval
        this.pollTimer = setTimeout(poll, this.pollIntervalSec * 1000);
        return;
      }

    };

    poll();
  }

  private triggerMotion(): void {
    // if (this.triggerTimer) {
    //   clearTimeout(this.triggerTimer);
    //   this.triggerTimer = undefined;
    // }
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
    // if (this.triggerTimer) {
    //   clearTimeout(this.triggerTimer);
    //   this.triggerTimer = undefined;
    // }
  }
  /** Called by the platform on shutdown to clear timers */
  public stop(): void {
    this.cleanup();
  }
}