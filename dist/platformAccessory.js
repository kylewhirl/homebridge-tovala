import axios from 'axios';
export class TovalaOvenAccessory {
    platform;
    accessory;
    ovenId;
    token;
    service;
    barcode;
    constructor(platform, accessory, ovenId, token) {
        this.platform = platform;
        this.accessory = accessory;
        this.ovenId = ovenId;
        this.token = token;
        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Tovala')
            .setCharacteristic(this.platform.Characteristic.Model, 'Smart Oven');
        this.service = this.accessory.getService(this.platform.Service.Switch)
            || this.accessory.addService(this.platform.Service.Switch);
        this.service.updateCharacteristic(this.platform.Characteristic.On, false);
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.handleOnSet.bind(this));
        this.barcode = this.accessory.context.barcode;
        this.platform.log.debug(`Barcode for ${this.accessory.displayName}: ${this.barcode}`);
        if (!this.barcode) {
            this.platform.log.error(`Barcode is not set for ${this.accessory.displayName}`);
        }
        this.setupInitialState();
    }
    async setupInitialState() {
        try {
            this.service.updateCharacteristic(this.platform.Characteristic.On, false);
        }
        catch (error) {
            this.platform.log.error('Failed to initialize accessory state:', error);
        }
    }
    async handleOnSet(value) {
        if (value) {
            this.platform.log.debug(`Starting cooking for recipe: ${this.accessory.displayName}`);
            try {
                await this.startCooking();
                this.platform.log.debug(`Cooking started for ${this.accessory.displayName}`);
                // Introduce a 1-second delay before turning off the switch
                setTimeout(() => {
                    this.platform.log.debug(`Turning switch off for ${this.accessory.displayName}`);
                    this.service.updateCharacteristic(this.platform.Characteristic.On, false);
                }, 1000); // 1000 milliseconds = 1 second
            }
            catch (error) {
                this.platform.log.error(`Failed to start cooking for ${this.accessory.displayName}: ${error}`);
                // Optionally, handle the switch state in case of failure
                this.service.updateCharacteristic(this.platform.Characteristic.On, false); // Reset state on error
            }
        }
    }
    async startCooking() {
        try {
            if (!this.barcode) {
                throw new Error('Barcode is undefined');
            }
            this.platform.log.debug(`Sending barcode ${this.barcode} to Tovala API`);
            const response = await axios.post(`https://api.beta.tovala.com/v0/users/${this.platform.config.userId}/ovens/${this.ovenId}/cook/start`, {
                barcode: this.barcode,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            });
            if (response.status === 200) {
                this.platform.log.debug(`Cooking started for ${this.accessory.displayName}`);
            }
            else {
                throw new Error(`Unexpected response status: ${response.status}`);
            }
        }
        catch (error) {
            if (axios.isAxiosError(error)) {
                // eslint-disable-next-line max-len
                this.platform.log.error(`Failed to start cooking for ${this.accessory.displayName}: ${error.response?.status} ${error.response?.statusText} - ${error.response?.data}`);
            }
            else {
                this.platform.log.error(`Failed to start cooking for ${this.accessory.displayName}`, error);
            }
            throw error;
        }
    }
}
//# sourceMappingURL=platformAccessory.js.map