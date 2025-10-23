/**
 * Warfare Configuration Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages warfare system configuration stored in MongoDB. Allows admin
 * to modify war costs, rewards, durations, territory limits, and passive
 * income parameters in real-time without server restart.
 * 
 * Features:
 * - Load configuration from MongoDB (with defaults)
 * - Save/update configuration
 * - Validate configuration parameters
 * - Real-time config application
 * - Config versioning and history
 * 
 * Default Config Structure:
 * - warCosts: Metal/Energy costs, scaling factors
 * - warRewards: Spoils percentages, XP bonuses
 * - warDuration: Minimum duration, cooldowns
 * - warRequirements: Level, member minimums
 * - territoryCosts: Base costs, tiered pricing
 * - passiveIncome: Base income, scaling factors
 * - territoryLimits: Max territories by level
 * 
 * @module lib/warfareConfigService
 */

import { MongoClient, Db } from 'mongodb';

let client: MongoClient;
let db: Db;

/**
 * Initialize warfare config service
 */
export function initializeWarfareConfigService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Warfare config service not initialized');
  }
  return db;
}

/**
 * Warfare configuration interface
 */
export interface WarfareConfig {
  _id?: string;
  version: number;
  lastUpdated: Date;
  updatedBy: string;
  
  warCosts: {
    baseMetal: number;
    baseEnergy: number;
    scalingPerTerritory: number; // Additional cost per 25 defender territories
  };
  
  warRewards: {
    metalSpoilsPercent: number;      // Percentage of loser's metal
    energySpoilsPercent: number;     // Percentage of loser's energy
    rpSpoilsPercent: number;         // Percentage of loser's RP
    victoryXP: number;               // XP bonus for winner
    defeatXPPenalty: number;         // XP penalty for loser
  };
  
  warDuration: {
    minimumHours: number;            // Minimum war duration
    cooldownHours: number;           // Cooldown between wars
  };
  
  warRequirements: {
    minimumLevel: number;            // Minimum clan level to declare war
    minimumMembers: number;          // Minimum clan members
  };
  
  territoryCosts: {
    baseMetal: number;
    baseEnergy: number;
    costTiers: Array<{
      upTo: number;
      costMetal: number;
      costEnergy: number;
    }>;
  };
  
  passiveIncome: {
    baseMetal: number;               // Base metal per territory per day
    baseEnergy: number;              // Base energy per territory per day
    scalingFactor: number;           // Income scaling per clan level (0.1 = 10%)
    collectionHour: number;          // UTC hour for daily collection (0-23)
  };
  
  territoryLimits: {
    absoluteMax: number;             // Absolute maximum territories
    levelBasedCaps: Array<{
      minLevel: number;
      maxTerritories: number;
    }>;
  };
}

/**
 * Default warfare configuration
 */
export const DEFAULT_WARFARE_CONFIG: Omit<WarfareConfig, '_id' | 'lastUpdated' | 'updatedBy'> = {
  version: 1,
  
  warCosts: {
    baseMetal: 50000,
    baseEnergy: 50000,
    scalingPerTerritory: 400, // +10K per 25 territories
  },
  
  warRewards: {
    metalSpoilsPercent: 15,
    energySpoilsPercent: 15,
    rpSpoilsPercent: 10,
    victoryXP: 50000,
    defeatXPPenalty: 25000,
  },
  
  warDuration: {
    minimumHours: 48,
    cooldownHours: 168, // 7 days
  },
  
  warRequirements: {
    minimumLevel: 10,
    minimumMembers: 5,
  },
  
  territoryCosts: {
    baseMetal: 2500,
    baseEnergy: 2500,
    costTiers: [
      { upTo: 10, costMetal: 2500, costEnergy: 2500 },
      { upTo: 25, costMetal: 3000, costEnergy: 3000 },
      { upTo: 50, costMetal: 3500, costEnergy: 3500 },
      { upTo: 100, costMetal: 4000, costEnergy: 4000 },
      { upTo: 250, costMetal: 5000, costEnergy: 5000 },
      { upTo: 500, costMetal: 6000, costEnergy: 6000 },
      { upTo: 750, costMetal: 7000, costEnergy: 7000 },
      { upTo: 1000, costMetal: 8000, costEnergy: 8000 },
    ],
  },
  
  passiveIncome: {
    baseMetal: 1000,
    baseEnergy: 1000,
    scalingFactor: 0.1,
    collectionHour: 0, // Midnight UTC
  },
  
  territoryLimits: {
    absoluteMax: 1000,
    levelBasedCaps: [
      { minLevel: 1, maxTerritories: 25 },
      { minLevel: 6, maxTerritories: 50 },
      { minLevel: 11, maxTerritories: 100 },
      { minLevel: 16, maxTerritories: 200 },
      { minLevel: 21, maxTerritories: 400 },
      { minLevel: 26, maxTerritories: 700 },
      { minLevel: 31, maxTerritories: 1000 },
    ],
  },
};

/**
 * Load warfare configuration from database
 * Returns default config if none exists
 * 
 * @returns Current warfare configuration
 */
export async function loadWarfareConfig(): Promise<WarfareConfig> {
  const database = getDb();
  const configCollection = database.collection<WarfareConfig>('warfareConfig');
  
  const config = await configCollection.findOne({}, { sort: { version: -1 } });
  
  if (config) {
    return config;
  }
  
  // No config exists, create default
  const defaultConfig: WarfareConfig = {
    ...DEFAULT_WARFARE_CONFIG,
    lastUpdated: new Date(),
    updatedBy: 'system',
  };
  
  await configCollection.insertOne(defaultConfig as any);
  return defaultConfig;
}

/**
 * Save warfare configuration to database
 * Validates config before saving
 * 
 * @param config - Configuration to save
 * @param updatedBy - Username of admin making the change
 * @returns Saved configuration
 * @throws Error if validation fails
 */
export async function saveWarfareConfig(
  config: Omit<WarfareConfig, '_id' | 'lastUpdated' | 'updatedBy'>,
  updatedBy: string
): Promise<WarfareConfig> {
  const database = getDb();
  const configCollection = database.collection<WarfareConfig>('warfareConfig');
  
  // Validate configuration
  const validation = validateWarfareConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }
  
  // Increment version
  const currentConfig = await loadWarfareConfig();
  const newVersion = (currentConfig.version || 0) + 1;
  
  // Create new config document
  const newConfig: WarfareConfig = {
    ...config,
    version: newVersion,
    lastUpdated: new Date(),
    updatedBy,
  };
  
  // Insert new version (keep history)
  await configCollection.insertOne(newConfig as any);
  
  // Log config change
  await database.collection('system_logs').insertOne({
    type: 'WARFARE_CONFIG_UPDATED',
    timestamp: new Date(),
    updatedBy,
    version: newVersion,
    changes: newConfig,
  });
  
  return newConfig;
}

/**
 * Validate warfare configuration
 * 
 * @param config - Configuration to validate
 * @returns Validation result
 */
export function validateWarfareConfig(
  config: Omit<WarfareConfig, '_id' | 'lastUpdated' | 'updatedBy'>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // War costs validation
  if (config.warCosts.baseMetal < 0) {
    errors.push('War cost (metal) must be non-negative');
  }
  if (config.warCosts.baseEnergy < 0) {
    errors.push('War cost (energy) must be non-negative');
  }
  if (config.warCosts.scalingPerTerritory < 0) {
    errors.push('War cost scaling must be non-negative');
  }
  
  // War rewards validation
  if (config.warRewards.metalSpoilsPercent < 0 || config.warRewards.metalSpoilsPercent > 100) {
    errors.push('Metal spoils percent must be between 0 and 100');
  }
  if (config.warRewards.energySpoilsPercent < 0 || config.warRewards.energySpoilsPercent > 100) {
    errors.push('Energy spoils percent must be between 0 and 100');
  }
  if (config.warRewards.rpSpoilsPercent < 0 || config.warRewards.rpSpoilsPercent > 100) {
    errors.push('RP spoils percent must be between 0 and 100');
  }
  
  // War duration validation
  if (config.warDuration.minimumHours < 1) {
    errors.push('Minimum war duration must be at least 1 hour');
  }
  if (config.warDuration.cooldownHours < 0) {
    errors.push('Cooldown hours must be non-negative');
  }
  
  // Requirements validation
  if (config.warRequirements.minimumLevel < 1) {
    errors.push('Minimum level must be at least 1');
  }
  if (config.warRequirements.minimumMembers < 1) {
    errors.push('Minimum members must be at least 1');
  }
  
  // Territory validation
  if (config.territoryLimits.absoluteMax < 1) {
    errors.push('Absolute max territories must be at least 1');
  }
  
  // Passive income validation
  if (config.passiveIncome.scalingFactor < 0 || config.passiveIncome.scalingFactor > 1) {
    errors.push('Scaling factor must be between 0 and 1');
  }
  if (config.passiveIncome.collectionHour < 0 || config.passiveIncome.collectionHour > 23) {
    errors.push('Collection hour must be between 0 and 23');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get configuration history
 * 
 * @param limit - Maximum number of versions to return
 * @returns Array of past configurations
 */
export async function getConfigHistory(limit = 10): Promise<WarfareConfig[]> {
  const database = getDb();
  const configCollection = database.collection<WarfareConfig>('warfareConfig');
  
  const history = await configCollection
    .find({})
    .sort({ version: -1 })
    .limit(limit)
    .toArray();
  
  return history;
}
