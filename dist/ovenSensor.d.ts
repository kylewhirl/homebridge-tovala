import { PlatformAccessory } from 'homebridge';
import { TovalaSmartOvenPlatform } from './platform.js';
/**
 * Date.parse cannot handle more than 3 fractional‑second digits.
 * Tovala returns timestamps like "2025-06-06T07:23:00.000002706Z".
 * This trims to millisecond precision so Date.parse works.
 */
export declare class TovalaOvenDoneSensor {
    private readonly platform;
    private readonly accessory;
    private readonly ovenId;
    private service;
    private pollTimer?;
    private timeoutTimer?;
    private readonly pollIntervalSec;
    private watching;
    private isCooking;
    constructor(platform: TovalaSmartOvenPlatform, accessory: PlatformAccessory, ovenId: string, pollIntervalSec: number);
    /**
     * Called every time the user starts a cook.
     * Cancels any running watcher and starts a new one.
     */
    watchCook(): Promise<void>;
    private triggerMotion;
    private cleanup;
    /** Called by the platform on shutdown to clear timers */
    stop(): void;
}
