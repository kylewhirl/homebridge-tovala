import { PLATFORM_NAME } from './settings.js';
import { TovalaSmartOvenPlatform } from './platform.js';
export default (api) => {
    api.registerPlatform(PLATFORM_NAME, TovalaSmartOvenPlatform);
};
/* import axios from 'axios';
import fs from 'fs/promises'; // Import file system promises for async operations
import path from 'path';
import { API, AccessoryConfig, AccessoryPlugin, AccessoryPluginConstructor, CharacteristicValue, HAP, Logging, Service } from 'homebridge';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Create __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


let hap: HAP;

interface TovalaConfig extends AccessoryConfig {
  email: string;
  password: string;
  userId: string;
}

interface AuthResponse {
  token: string;
}

interface OvenResponse {
  tovala: {
    id: string;
  };
}

interface Recipe {
  title: string;
  barcode: string;
}

const PERSISTENCE_FILE = path.join(__dirname, 'recipes.json'); // Path to store recipes

const TovalaSmartOvenPlugin = (api: API) => {
  hap = api.hap;
  api.registerAccessory('TovalaSmartOven', TovalaSmartOven as unknown as AccessoryPluginConstructor);
};

class TovalaSmartOven implements AccessoryPlugin {
  private readonly log: Logging;
  private token: string | null = null;
  private ovenId: string | null = null;
  private recipes: Recipe[] = [];
  private services: Service[] = []; // Array to hold the created switch services
  private initialized = false; // Track if initialization is complete

  constructor(log: Logging, config: TovalaConfig) {
    this.log = log;
    const { email, password, userId } = config;

    this.log.debug('TovalaSmartOven constructor initialized');
    this.log.debug(`Config: email=${email}, userId=${userId}`);

    // Start async initialization
    this.initialize(email, password, userId).then(() => {
      this.log.debug('Initialization complete');
      this.initialized = true;
    }).catch((error) => {
      this.log.error('Initialization failed:', error);
    });
  }

  async initialize(email: string, password: string, userId: string): Promise<void> {
    this.log.debug('Initializing Tovala Smart Oven...');
    
    // Load recipes from file if available
    const storedRecipes = await this.loadRecipesFromFile();
    if (storedRecipes) {
      this.recipes = storedRecipes;
      this.createRecipeSwitches(); // Create switches from stored recipes
    }

    // Proceed with API calls
    await this.authenticate(email, password);
    await this.getOvenId(userId);
    await this.getCustomRecipes(userId);
    
    // Save the recipes to file and create switches
    await this.saveRecipesToFile();
    this.createRecipeSwitches();
  }

  async authenticate(email: string, password: string): Promise<void> {
    this.log.debug('Authenticating...');
    
    try {
      const response = await axios.post<AuthResponse>('https://api.tovala.com/v0/getToken', {
        email,
        password,
        type: 'user',
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Tovala-AppID': 'MyTovala',
        },
      });

      this.token = response.data.token;
      this.log.debug(`Authenticated successfully. Token: ${this.token}`);
    } catch (error) {
      this.log.error('Authentication failed:', error);
      throw error; // Rethrow the error to prevent further initialization
    }
  }

  async getOvenId(userId: string): Promise<void> {
    this.log.debug('Fetching oven ID...');

    try {
      const response = await axios.get<OvenResponse[]>(`https://api.beta.tovala.com/v0/users/${userId}/ovens`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      this.ovenId = response.data[0].tovala.id;
      this.log.debug(`Oven ID fetched: ${this.ovenId}`);
    } catch (error) {
      this.log.error('Failed to fetch oven ID:', error);
      throw error;
    }
  }

  async getCustomRecipes(userId: string): Promise<void> {
    this.log.debug('Fetching custom recipes...');

    try {
      const response = await axios.get(`https://api.beta.tovala.com/v0/users/${userId}/customMealDataJSON`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      this.recipes = response.data.userRecipes.map((recipe: Recipe) => ({
        title: recipe.title,
        barcode: recipe.barcode,
      }));

      this.log.debug(`Custom recipes fetched: ${JSON.stringify(this.recipes)}`);
    } catch (error) {
      this.log.error('Failed to fetch custom recipes:', error);
      throw error;
    }
  }

  createRecipeSwitches(): void {
    this.log.debug('Creating recipe switches...');
    
    this.recipes.forEach((recipe) => {
      this.log.debug(`Creating switch for recipe: ${recipe.title}`);
      
      const switchService = new hap.Service.Switch(recipe.title);

      switchService.getCharacteristic(hap.Characteristic.On)
        .onSet(async (value: CharacteristicValue) => {
          if (value) {
            await this.startCooking(recipe.barcode);
            switchService.updateCharacteristic(hap.Characteristic.On, false);
          }
        });

      this.services.push(switchService); // Store the service in the array
      this.log.debug(`Switch created and stored for recipe: ${recipe.title}`);
    });
  }

  async startCooking(barcode: string): Promise<void> {
    this.log.debug(`Starting cooking for barcode: ${barcode}`);

    try {
      await axios.post(`https://api.beta.tovala.com/v0/users/${this.token}/ovens/${this.ovenId}/cook/start`, {
        barcode,
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      this.log.debug(`Cooking started for barcode: ${barcode}`);
    } catch (error) {
      this.log.error(`Failed to start cooking for barcode: ${barcode}`, error);
    }
  }

  async saveRecipesToFile(): Promise<void> {
    try {
      await fs.writeFile(PERSISTENCE_FILE, JSON.stringify(this.recipes, null, 2));
      this.log.debug('Recipes saved to file.');
    } catch (error) {
      this.log.error('Failed to save recipes to file:', error);
    }
  }

  async loadRecipesFromFile(): Promise<Recipe[] | null> {
    try {
      const data = await fs.readFile(PERSISTENCE_FILE, 'utf-8');
      this.log.debug('Recipes loaded from file.');
      return JSON.parse(data);
    } catch (error) {
      this.log.debug('No saved recipes found, starting fresh.');
      return null; // No file found, proceed with fresh start
    }
  }

  getServices(): Service[] {
    this.log.debug('Fetching services...');
    
    if (!this.initialized) {
      this.log.debug('Services not ready yet, returning empty array');
      return [];
    }

    return this.services; // Return the stored services after initialization
  }
}

export default TovalaSmartOvenPlugin;
 */ 
//# sourceMappingURL=index.js.map