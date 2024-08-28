import axios from 'axios';
import jwt from 'jsonwebtoken'; // Import the jsonwebtoken library
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { TovalaOvenAccessory } from './platformAccessory.js';
export class TovalaSmartOvenPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    // Platform accessories
    accessories = [];
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.log.debug('TovalaSmartOvenPlatform initialized');
        if (!this.config.email || !this.config.password) {
            this.log.error('Missing configuration parameters. Please provide email, password, and userId.');
            return;
        }
        // Defer initialization logic to after the constructor has completed
        this.api.on('didFinishLaunching', async () => {
            this.log.debug('didFinishLaunching callback invoked');
            await this.initializePlatform();
        });
    }
    async initializePlatform() {
        try {
            const token = await this.authenticate();
            const userId = this.decodeUserIdFromToken(token); // Extract userId from token
            if (userId) {
                this.config.userId = userId.toString(); // Update config with extracted userId
            }
            const ovenId = await this.getOvenId(token);
            const recipes = await this.getCustomRecipes(token);
            // Log the recipes for debugging
            this.log.debug('Fetched recipes:', JSON.stringify(recipes, null, 2));
            // Create accessories for each recipe
            this.createRecipeAccessories(recipes, ovenId, token);
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