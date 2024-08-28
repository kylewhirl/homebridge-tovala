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
    getOvenId(token: string): Promise<string>;
    getCustomRecipes(token: string): Promise<{
        title: string;
        barcode: string;
    }[]>;
    createRecipeAccessories(recipes: {
        title: string;
        barcode: string;
    }[], ovenId: string, token: string): void;
    configureAccessory(accessory: PlatformAccessory): void;
}
