import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
export declare class TovalaSmartOvenPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    private readonly accessories;
    constructor(log: Logger, config: PlatformConfig, api: API);
    initializePlatform(): Promise<void>;
    authenticate(): Promise<string>;
    decodeUserIdFromToken(token: string): number | null;
    getOvenId(token: string): Promise<string>;
    getCustomRecipes(token: string): Promise<{
        title: string;
        barcode: string;
    }[]>;
    createRecipeAccessories(recipes: {
        title: string;
        barcode: string;
    }[], ovenId: string, token: string): void;
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
    private startCooking;
    configureAccessory(accessory: PlatformAccessory): void;
}
