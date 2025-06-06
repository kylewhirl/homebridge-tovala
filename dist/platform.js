import axios from 'axios';
import jwt from 'jsonwebtoken'; // Import the jsonwebtoken library
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TovalaOvenAccessory } from './platformAccessory.js';
import { TovalaOvenDoneSensor } from './ovenSensor.js';
export class TovalaSmartOvenPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    // Platform accessories
    accessories = [];
    doneSensor;
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.log.debug('TovalaSmartOvenPlatform initialized');
        this.config.groupAccessories = this.config.groupAccessories ?? true;
        this.config.enableDoneSensor = this.config.enableDoneSensor ?? true;
        this.config.doneSensorPoll = Math.max(5, Number(this.config.doneSensorPoll) || 30);
        if (!this.config.email || !this.config.password) {
            this.log.error('Missing configuration parameters. Please provide email, password, and userId.');
            return;
        }
        // Defer initialization logic to after the constructor has completed
        this.api.on('didFinishLaunching', async () => {
            this.log.debug('didFinishLaunching callback invoked');
            await this.initializePlatform();
        });
        this.api.on('shutdown', () => this.doneSensor?.stop?.());
    }
    async initializePlatform() {
        try {
            const token = await this.authenticate();
            const userId = this.decodeUserIdFromToken(token); // Extract userId from token
            if (userId) {
                this.config.userId = userId.toString(); // Update config with extracted userId
            }
            const ovenId = await this.getOvenId(token);
            // Create "Oven Done" motion sensor once
            if (this.config.enableDoneSensor && !this.doneSensor) {
                this.log.debug('Creating "Oven Done" motion-sensor accessory');
                const sensorUuid = this.api.hap.uuid.generate('tovala-done');
                let sensorAcc = this.accessories.find(a => a.UUID === sensorUuid);
                if (!sensorAcc) {
                    sensorAcc = new this.api.platformAccessory('Tovala Oven Done', sensorUuid);
                    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [sensorAcc]);
                    this.accessories.push(sensorAcc);
                }
                this.doneSensor = new TovalaOvenDoneSensor(this, sensorAcc, ovenId, this.config.doneSensorPoll);
            }
            // Start polling immediately to detect any running or upcoming cook
            this.doneSensor?.watchCook(token);
            const recipes = await this.getCustomRecipes(token);
            // Log the recipes for debugging
            this.log.debug('Fetched recipes:', JSON.stringify(recipes, null, 2));
            // Create accessories for each recipe
            // this.createRecipeAccessories(recipes, ovenId, token);
            if (this.config.groupAccessories) {
                this.purgeLegacyAccessories();
                this.createGroupedAccessory(recipes, ovenId, token);
            }
            else {
                this.purgeGroupedAccessory();
                this.createRecipeAccessories(recipes, ovenId, token);
            }
        }
        catch (error) {
            this.log.error('Failed to initialize platform:', error);
        }
    }
    async authenticate() {
        this.log.debug('Authenticating...');
        try {
            const response = await axios.post('https://api.tovala.com/v0/getToken', {
                email: this.config.email,
                password: this.config.password,
                type: 'user',
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Tovala-AppID': 'MyTovala',
                },
            });
            this.log.debug('Authentication successful');
            return response.data.token;
        }
        catch (error) {
            this.log.error('Authentication failed:', error);
            throw error;
        }
    }
    decodeUserIdFromToken(token) {
        try {
            // Decode the JWT without verifying the signature
            const decoded = jwt.decode(token);
            // Check if decoded is null or if userId is undefined
            if (decoded && decoded.userId !== undefined) {
                this.log.debug('Decoded userId from token:', decoded.userId);
                return decoded.userId;
            }
            // Return null if userId is not found or decoded is null
            return null;
        }
        catch (error) {
            this.log.error('Failed to decode JWT:', error);
            return null;
        }
    }
    async getOvenId(token) {
        this.log.debug('Fetching oven ID...');
        try {
            const response = await axios.get(`https://api.beta.tovala.com/v0/users/${this.config.userId}/ovens`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            const ovenId = response.data[0].tovala.id;
            this.log.debug(`Oven ID: ${ovenId}`);
            return ovenId;
        }
        catch (error) {
            this.log.error('Failed to fetch oven ID:', error);
            throw error;
        }
    }
    async getCustomRecipes(token) {
        this.log.debug('Fetching custom recipes...');
        try {
            const response = await axios.get(`https://api.beta.tovala.com/v0/users/${this.config.userId}/customMealDataJSON`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            // Log the raw API response
            this.log.debug('Raw recipes response:', JSON.stringify(response.data, null, 2));
            const recipes = response.data.userRecipes.map((recipe) => ({
                title: recipe.title,
                barcode: recipe.barcode,
            }));
            this.log.debug('Recipes fetched successfully');
            return recipes;
        }
        catch (error) {
            this.log.error('Failed to fetch custom recipes:', error);
            throw error;
        }
    }
    createRecipeAccessories(recipes, ovenId, token) {
        recipes.forEach(recipe => {
            this.log.debug(`Creating accessory for recipe: ${recipe.title}`);
            const uuid = this.api.hap.uuid.generate(recipe.barcode);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.debug(`Updating existing accessory: ${recipe.title}`);
                // Log the barcode when updating an existing accessory
                this.log.debug(`Setting barcode for existing accessory: ${recipe.barcode}`);
                existingAccessory.context.barcode = recipe.barcode;
                new TovalaOvenAccessory(this, existingAccessory, ovenId, token);
            }
            else {
                this.log.debug(`Adding new accessory: ${recipe.title}`);
                const accessory = new this.api.platformAccessory(recipe.title, uuid);
                // Log the barcode when creating a new accessory
                this.log.debug(`Setting barcode for new accessory: ${recipe.barcode}`);
                accessory.context.barcode = recipe.barcode;
                new TovalaOvenAccessory(this, accessory, ovenId, token);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                this.accessories.push(accessory);
            }
        });
    }
    /**
     * Expose ONE accessory containing a ServiceLabel and
     * a numbered Switch for each recipe. iOS collapses it
     * to a single tile that expands on long‑press.
     */
    createGroupedAccessory(recipes, ovenId, token) {
        const uuid = this.api.hap.uuid.generate('tovala-group');
        const accessory = this.accessories.find(a => a.UUID === uuid)
            ?? new this.api.platformAccessory(this.config.name || 'Tovala Oven', uuid);
        accessory.category = 7 /* this.api.hap.Categories.OUTLET */;
        // If the accessory is brand‑new we give it an initial Name,
        // but we never touch ConfiguredName so the user can rename it
        // in HomeKit and have the change persist across restarts.
        const isNewAccessory = !this.accessories.includes(accessory);
        const info = accessory.getService(this.Service.AccessoryInformation);
        if (info && isNewAccessory) {
            info.setCharacteristic(this.Characteristic.Name, 'Tovala Oven');
        }
        // ServiceLabel for numeric grouping
        const label = accessory.getService(this.Service.ServiceLabel)
            ?? accessory.addService(this.Service.ServiceLabel);
        label.updateCharacteristic(this.Characteristic.ServiceLabelNamespace, 1);
        // One Switch service per recipe
        recipes.forEach((recipe, i) => {
            const subtype = recipe.barcode;
            const s = accessory.getServiceById(this.Service.Switch, subtype)
                ?? accessory.addService(this.Service.Switch, recipe.title, subtype);
            s.setCharacteristic(this.Characteristic.Name, recipe.title);
            if (this.Characteristic.ConfiguredName) {
                s.setCharacteristic(this.Characteristic.ConfiguredName, recipe.title);
            }
            s.setCharacteristic(this.Characteristic.ServiceLabelIndex, i + 1);
            s.getCharacteristic(this.Characteristic.On).onSet(async (val) => {
                if (val) {
                    await this.startCooking(ovenId, token, recipe.barcode);
                    setTimeout(() => s.updateCharacteristic(this.Characteristic.On, false), 1000);
                }
            });
        });
        if (!this.accessories.includes(accessory)) {
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
        }
    }
    /**
     * Delete any accessories whose context has a `barcode`
     * (those are the old stand‑alone recipe switches) if the
     * user has enabled `groupAccessories === true`.
     */
    purgeLegacyAccessories() {
        if (!this.config.groupAccessories) {
            return; // nothing to do
        }
        const leftovers = this.accessories.filter(a => a.context?.barcode);
        if (leftovers.length) {
            this.log.info(`Removing ${leftovers.length} legacy recipe accessory(s) ` +
                'because “Group accessories” is enabled.');
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, leftovers);
            // keep our in‑memory list in sync without re‑assigning the readonly array
            for (const acc of leftovers) {
                const idx = this.accessories.indexOf(acc);
                if (idx !== -1) {
                    this.accessories.splice(idx, 1);
                }
            }
        }
    }
    /**
   * Deletes the single “Tovala Oven” group accessory when
   * the user has disabled `groupAccessories`.
   */
    purgeGroupedAccessory() {
        if (this.config.groupAccessories) {
            return;
        } // nothing to do
        const uuid = this.api.hap.uuid.generate('tovala-group');
        const toRemove = this.accessories.filter(a => a.UUID === uuid);
        if (toRemove.length) {
            this.log.info('Removing grouped accessory because “Group accessories” is disabled.');
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
            // keep the in‑memory list in sync
            for (const acc of toRemove) {
                const idx = this.accessories.indexOf(acc);
                if (idx !== -1) {
                    this.accessories.splice(idx, 1);
                }
            }
        }
    }
    async startCooking(ovenId, token, barcode) {
        await axios.post(`https://api.beta.tovala.com/v0/users/${this.config.userId}/ovens/${ovenId}/cook/start`, { barcode }, { headers: { Authorization: `Bearer ${token}` } });
        this.doneSensor?.watchCook(token);
    }
    // Handle accessory restoration from cache
    configureAccessory(accessory) {
        this.log.debug('Restoring cached accessory:', accessory.displayName);
        this.accessories.push(accessory);
        // Set the switch to off state upon reboot
        const switchService = accessory.getService(this.Service.Switch);
        if (switchService) {
            switchService.updateCharacteristic(this.Characteristic.On, false);
        }
    }
}
//# sourceMappingURL=platform.js.map