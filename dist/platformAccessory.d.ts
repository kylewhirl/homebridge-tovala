import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { TovalaSmartOvenPlatform } from './platform.js';
export declare class TovalaOvenAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly ovenId;
    private readonly token;
    private service;
    private barcode;
    constructor(platform: TovalaSmartOvenPlatform, accessory: PlatformAccessory, ovenId: string, token: string);
    private setupInitialState;
    handleOnSet(value: CharacteristicValue): Promise<void>;
    startCooking(): Promise<void>;
}
