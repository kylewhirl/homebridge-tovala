import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { TovalaOvenDoneSensor } from './ovenSensor.js';
import { AuthenticatedClient } from './authenticatedClient.js';
export declare class TovalaSmartOvenPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly accessories;
    doneSensor?: TovalaOvenDoneSensor;
    readonly client: AuthenticatedClient;
    constructor(log: Logger, config: PlatformConfig, api: API);
    initializePlatform(): Promise<void>;
    authenticate(): Promise<string>;
    decodeUserIdFromToken(token: string): number | null;
    getOvenId(): Promise<string>;
    getCustomRecipes(): Promise<{
        title: string;
        barcode: string;
    }[]>;
    createRecipeAccessories(recipes: {
        title: string;
        barcode: string;
    }[], ovenId: string): void;
    /**
     * Expose ONE accessory containing a ServiceLabel and
     * a numbered Switch for each recipe. iOS collapses it
     * to a single tile that expands on long‑press.
     */
    private createGroupedAccessory;
    /**
     * Delete any accessories whose context has a `barcode`
     * (those are the old stand‑alone recipe switches) if the
     * user has enabled `groupAccessories === true`.
     */
    private purgeLegacyAccessories;
    /**
   * Deletes the single “Tovala Oven” group accessory when
   * the user has disabled `groupAccessories`.
   */
    private purgeGroupedAccessory;
    private startCooking;
    configureAccessory(accessory: PlatformAccessory): void;
}
