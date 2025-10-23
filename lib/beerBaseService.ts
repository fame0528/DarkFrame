/**
 * Beer Base Service
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages special "Beer Base" bots with bonus loot rewards. Beer Bases are high-value targets
 * that disappear when defeated (NOT Full Permanence) and respawn weekly on Sundays at 4 AM.
 * 
 * FEATURES:
 * - 5-10% of bot population are Beer Bases
 * - 3x resource rewards (compared to normal bots)
 * - Disappear completely when defeated (removed from database)
 * - Weekly respawn schedule (Sunday 4 AM)
 * - Random spawn locations across map
 * - Special icon in scanner (🍺)
 * - Admin controls for spawn rate and reward multiplier
 * 
 * ARCHITECTURE:
 * - Beer Bases are regular bots with isSpecialBase: true flag
 * - Spawn rate configurable (default 5-10%)
 * - Reward multiplier configurable (default 3x)
 * - Cron job for weekly respawn
 * - Integration with bot spawner and combat service
 */

import { connectToDatabase } from './mongodb';
import { createBot } from './botService';
import { BotSpecialization, UnitType, PlayerUnit } from '@/types/game.types';

// Map size constant
const MAP_SIZE = 150;

/**
 * Beer Base Configuration
 */
export interface BeerBaseConfig {
  spawnRateMin: number; // Minimum % of population (default 5)
  spawnRateMax: number; // Maximum % of population (default 10)
  resourceMultiplier: number; // Resource reward multiplier (default 3)
  respawnDay: number; // Day of week (0=Sunday, default 0)
  respawnHour: number; // Hour of day (default 4 AM)
  enabled: boolean; // Master switch (default true)
}

/**
 * Default Beer Base configuration
 * 
 * With ~2,000-5,000 total bots on a 150x150 map:
 * - 5-10% spawn rate = 100-500 Beer Bases (realistic distribution)
 * - Provides varied hunting opportunities across all power tiers
 * - Ensures players always have targets without oversaturation
 */
const DEFAULT_CONFIG: BeerBaseConfig = {
  spawnRateMin: 5,  // 5% minimum (100+ bases with 2000 bots)
  spawnRateMax: 10, // 10% maximum (500 bases with 5000 bots)
  resourceMultiplier: 3,
  respawnDay: 0, // Sunday
  respawnHour: 4, // 4 AM
  enabled: true,
};

/**
 * Get Beer Base configuration from database or return defaults
 */
export async function getBeerBaseConfig(): Promise<BeerBaseConfig> {
  try {
    const db = await connectToDatabase();
    const config = await db.collection('gameConfig').findOne({ type: 'beerBase' });
    
    if (config) {
      return {
        spawnRateMin: config.spawnRateMin ?? DEFAULT_CONFIG.spawnRateMin,
        spawnRateMax: config.spawnRateMax ?? DEFAULT_CONFIG.spawnRateMax,
        resourceMultiplier: config.resourceMultiplier ?? DEFAULT_CONFIG.resourceMultiplier,
        respawnDay: config.respawnDay ?? DEFAULT_CONFIG.respawnDay,
        respawnHour: config.respawnHour ?? DEFAULT_CONFIG.respawnHour,
        enabled: config.enabled ?? DEFAULT_CONFIG.enabled,
      };
    }
    
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error('Failed to load Beer Base config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Update Beer Base configuration
 */
export async function updateBeerBaseConfig(config: Partial<BeerBaseConfig>): Promise<void> {
  const db = await connectToDatabase();
  
  await db.collection('gameConfig').updateOne(
    { type: 'beerBase' },
    { $set: { ...config, type: 'beerBase', updatedAt: new Date() } },
    { upsert: true }
  );
}

/**
 * Calculate target number of Beer Bases based on total bot population
 */
export async function getTargetBeerBaseCount(): Promise<number> {
  const db = await connectToDatabase();
  const config = await getBeerBaseConfig();
  
  if (!config.enabled) {
    return 0;
  }
  
  // Get total bot count
  const totalBots = await db.collection('players').countDocuments({ isBot: true });
  
  // Random percentage between min and max
  const spawnRate = config.spawnRateMin + Math.random() * (config.spawnRateMax - config.spawnRateMin);
  
  // Calculate target count
  const targetCount = Math.floor(totalBots * (spawnRate / 100));
  
  return Math.max(1, targetCount); // At least 1 Beer Base if enabled
}

/**
 * Get current Beer Base count
 */
export async function getCurrentBeerBaseCount(): Promise<number> {
  const db = await connectToDatabase();
  return await db.collection('players').countDocuments({ 
    isBot: true, 
    isSpecialBase: true 
  });
}

/**
 * Generate random position on map
 */
function getRandomPosition(): { x: number; y: number } {
  return {
    x: Math.floor(Math.random() * MAP_SIZE),
    y: Math.floor(Math.random() * MAP_SIZE),
  };
}

/**
 * Power tier classification for Beer Bases
 * Realistic power ranges aligned with endgame player capabilities
 */
enum PowerTier {
  Weak = 'WEAK',           // 1K-50K total power (early targets)
  Mid = 'MID',             // 50K-500K total power (mid-game targets)
  Strong = 'STRONG',       // 500K-2M total power (late-game targets)
  Elite = 'ELITE',         // 2M-10M total power (endgame targets)
  Ultra = 'ULTRA',         // 10M-50M total power (veteran targets)
  Legendary = 'LEGENDARY'  // 50M-100M total power (ultimate challenges)
}

/**
 * Get target total power for a given power tier
 */
function getTargetPowerForTier(tier: PowerTier): number {
  switch (tier) {
    case PowerTier.Weak:
      return 1_000 + Math.floor(Math.random() * 49_000); // 1K-50K
    case PowerTier.Mid:
      return 50_000 + Math.floor(Math.random() * 450_000); // 50K-500K
    case PowerTier.Strong:
      return 500_000 + Math.floor(Math.random() * 1_500_000); // 500K-2M
    case PowerTier.Elite:
      return 2_000_000 + Math.floor(Math.random() * 8_000_000); // 2M-10M
    case PowerTier.Ultra:
      return 10_000_000 + Math.floor(Math.random() * 40_000_000); // 10M-50M
    case PowerTier.Legendary:
      return 50_000_000 + Math.floor(Math.random() * 50_000_000); // 50M-100M
  }
}

/**
 * Unit definitions with power stats
 * All 40 standard units organized by tier for progressive army building
 */
const UNIT_POOLS = {
  T1_STR: [
    { type: UnitType.T1_Sniper, str: 15, def: 5, name: 'Sniper' },
    { type: UnitType.T1_Grenadier, str: 12, def: 8, name: 'Grenadier' },
    { type: UnitType.T1_Scout, str: 8, def: 10, name: 'Scout' },
    { type: UnitType.T1_Rifleman, str: 5, def: 10, name: 'Rifleman' },
  ],
  T1_DEF: [
    { type: UnitType.T1_Shield, str: 5, def: 15, name: 'Shield' },
    { type: UnitType.T1_Turret, str: 8, def: 12, name: 'Turret' },
    { type: UnitType.T1_Barrier, str: 7, def: 8, name: 'Barrier' },
    { type: UnitType.T1_Bunker, str: 6, def: 5, name: 'Bunker' },
  ],
  T2_STR: [
    { type: UnitType.T2_Demolisher, str: 60, def: 30, name: 'Demolisher' },
    { type: UnitType.T2_Assassin, str: 50, def: 35, name: 'Assassin' },
    { type: UnitType.T2_Ranger, str: 40, def: 40, name: 'Ranger' },
    { type: UnitType.T2_Commando, str: 30, def: 32, name: 'Commando' },
  ],
  T2_DEF: [
    { type: UnitType.T2_Sentinel, str: 30, def: 60, name: 'Sentinel' },
    { type: UnitType.T2_Cannon, str: 35, def: 50, name: 'Cannon' },
    { type: UnitType.T2_Barricade, str: 32, def: 40, name: 'Barricade' },
    { type: UnitType.T2_Fortress, str: 40, def: 30, name: 'Fortress' },
  ],
  T3_STR: [
    { type: UnitType.T3_Warlord, str: 135, def: 90, name: 'Warlord' },
    { type: UnitType.T3_Enforcer, str: 120, def: 95, name: 'Enforcer' },
    { type: UnitType.T3_Raider, str: 105, def: 100, name: 'Raider' },
    { type: UnitType.T3_Striker, str: 90, def: 105, name: 'Striker' },
  ],
  T3_DEF: [
    { type: UnitType.T3_Guardian, str: 90, def: 135, name: 'Guardian' },
    { type: UnitType.T3_Artillery, str: 95, def: 120, name: 'Artillery' },
    { type: UnitType.T3_Bulwark, str: 100, def: 105, name: 'Bulwark' },
    { type: UnitType.T3_Citadel, str: 105, def: 90, name: 'Citadel' },
  ],
  T4_STR: [
    { type: UnitType.T4_Annihilator, str: 270, def: 180, name: 'Annihilator' },
    { type: UnitType.T4_Destroyer, str: 240, def: 190, name: 'Destroyer' },
    { type: UnitType.T4_Juggernaut, str: 210, def: 200, name: 'Juggernaut' },
    { type: UnitType.T4_Titan, str: 180, def: 210, name: 'Titan' },
  ],
  T4_DEF: [
    { type: UnitType.T4_Colossus, str: 180, def: 270, name: 'Colossus' },
    { type: UnitType.T4_Dreadnought, str: 190, def: 240, name: 'Dreadnought' },
    { type: UnitType.T4_Rampart, str: 200, def: 210, name: 'Rampart' },
    { type: UnitType.T4_Stronghold, str: 210, def: 180, name: 'Stronghold' },
  ],
  T5_STR: [
    { type: UnitType.T5_Apocalypse, str: 540, def: 360, name: 'Apocalypse' },
    { type: UnitType.T5_Devastator, str: 480, def: 380, name: 'Devastator' },
    { type: UnitType.T5_Conqueror, str: 420, def: 400, name: 'Conqueror' },
    { type: UnitType.T5_Overlord, str: 360, def: 420, name: 'Overlord' },
  ],
  T5_DEF: [
    { type: UnitType.T5_Immortal, str: 360, def: 540, name: 'Immortal' },
    { type: UnitType.T5_Leviathan, str: 380, def: 480, name: 'Leviathan' },
    { type: UnitType.T5_Monolith, str: 400, def: 420, name: 'Monolith' },
    { type: UnitType.T5_Bastion, str: 420, def: 360, name: 'Bastion' },
  ],
};

/**
 * Generate realistic progressive unit composition for Beer Base
 * 
 * Builds armies progressively across all tiers (T1-T5) like real players.
 * - T1: 10% of power (foundation units built early)
 * - T2: 20% of power (bulk army)
 * - T3: 30% of power (backbone of force)
 * - T4: 60% of remaining power (heavy hitters)
 * - T5: Rest (endgame power units)
 * 
 * @param specialization - Bot specialization affecting STR/DEF ratio
 * @param powerTier - Target power tier for this Beer Base
 * @returns Array of PlayerUnits with realistic progressive composition
 */
function generateBeerBaseUnits(
  specialization: BotSpecialization,
  powerTier: PowerTier
): PlayerUnit[] {
  const units: PlayerUnit[] = [];
  
  // Get total target power for this tier
  const totalTargetPower = getTargetPowerForTier(powerTier);
  
  // Determine STR/DEF ratio based on specialization
  let strRatio = 0.5; // Default balanced
  
  switch (specialization) {
    case BotSpecialization.Raider:
      strRatio = 0.7; // 70% STR, 30% DEF
      break;
    case BotSpecialization.Fortress:
      strRatio = 0.3; // 30% STR, 70% DEF
      break;
    case BotSpecialization.Balanced:
      strRatio = 0.5; // 50/50
      break;
    case BotSpecialization.Ghost:
      strRatio = 0.6; // 60% STR, 40% DEF
      break;
    case BotSpecialization.Hoarder:
      strRatio = 0.4; // 40% STR, 60% DEF (defensive hoarder)
      break;
  }
  
  // Split total power into STR and DEF
  const targetStrPower = Math.floor(totalTargetPower * strRatio);
  const targetDefPower = Math.floor(totalTargetPower * (1 - strRatio));
  
  // Progressive power allocation across tiers
  // T1: 10%, T2: 20%, T3: 30%, T4: 60% of remaining, T5: rest
  const strPowerT1 = Math.floor(targetStrPower * 0.10);
  const strPowerT2 = Math.floor(targetStrPower * 0.20);
  const strPowerT3 = Math.floor(targetStrPower * 0.30);
  const strPowerRemaining = targetStrPower - strPowerT1 - strPowerT2 - strPowerT3;
  const strPowerT4 = Math.floor(strPowerRemaining * 0.60);
  const strPowerT5 = strPowerRemaining - strPowerT4;
  
  const defPowerT1 = Math.floor(targetDefPower * 0.10);
  const defPowerT2 = Math.floor(targetDefPower * 0.20);
  const defPowerT3 = Math.floor(targetDefPower * 0.30);
  const defPowerRemaining = targetDefPower - defPowerT1 - defPowerT2 - defPowerT3;
  const defPowerT4 = Math.floor(defPowerRemaining * 0.60);
  const defPowerT5 = defPowerRemaining - defPowerT4;
  
  // Helper to pick random unit from pool
  const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  
  // Helper to create PlayerUnit
  const createUnit = (unit: any, quantity: number): PlayerUnit => {
    const rarity = unit.str + unit.def >= 500 ? 'legendary' : 
                   unit.str + unit.def >= 200 ? 'epic' :
                   unit.str + unit.def >= 100 ? 'rare' :
                   unit.str + unit.def >= 30 ? 'uncommon' : 'common';
    
    return {
      id: `${unit.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      unitId: `${unit.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      unitType: unit.type,
      name: unit.name,
      category: unit.str > 0 ? 'STR' : 'DEF',
      rarity: rarity as 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
      strength: unit.str,
      defense: unit.def,
      quantity,
      createdAt: new Date()
    };
  };
  
  // Generate STR units progressively across all tiers
  if (strPowerT1 > 0) {
    const unit = pickRandom(UNIT_POOLS.T1_STR);
    const quantity = Math.floor(strPowerT1 / unit.str);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (strPowerT2 > 0) {
    const unit = pickRandom(UNIT_POOLS.T2_STR);
    const quantity = Math.floor(strPowerT2 / unit.str);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (strPowerT3 > 0) {
    const unit = pickRandom(UNIT_POOLS.T3_STR);
    const quantity = Math.floor(strPowerT3 / unit.str);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (strPowerT4 > 0) {
    const unit = pickRandom(UNIT_POOLS.T4_STR);
    const quantity = Math.floor(strPowerT4 / unit.str);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (strPowerT5 > 0) {
    const unit = pickRandom(UNIT_POOLS.T5_STR);
    const quantity = Math.floor(strPowerT5 / unit.str);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  // Generate DEF units progressively across all tiers
  if (defPowerT1 > 0) {
    const unit = pickRandom(UNIT_POOLS.T1_DEF);
    const quantity = Math.floor(defPowerT1 / unit.def);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (defPowerT2 > 0) {
    const unit = pickRandom(UNIT_POOLS.T2_DEF);
    const quantity = Math.floor(defPowerT2 / unit.def);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (defPowerT3 > 0) {
    const unit = pickRandom(UNIT_POOLS.T3_DEF);
    const quantity = Math.floor(defPowerT3 / unit.def);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (defPowerT4 > 0) {
    const unit = pickRandom(UNIT_POOLS.T4_DEF);
    const quantity = Math.floor(defPowerT4 / unit.def);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  if (defPowerT5 > 0) {
    const unit = pickRandom(UNIT_POOLS.T5_DEF);
    const quantity = Math.floor(defPowerT5 / unit.def);
    if (quantity > 0) units.push(createUnit(unit, quantity));
  }
  
  return units;
}

/**
 * Select random power tier with weighted distribution
 * Most Beer Bases are Mid-Strong, fewer Weak/Elite, rare Ultra/Legendary
 */
function selectRandomPowerTier(): PowerTier {
  const roll = Math.random() * 100;
  
  if (roll < 10) return PowerTier.Weak;        // 10%
  if (roll < 40) return PowerTier.Mid;         // 30%
  if (roll < 70) return PowerTier.Strong;      // 30%
  if (roll < 90) return PowerTier.Elite;       // 20%
  if (roll < 98) return PowerTier.Ultra;       // 8%
  return PowerTier.Legendary;                  // 2%
}

/**
 * Spawn a single Beer Base
 */
export async function spawnBeerBase(): Promise<string> {
  const db = await connectToDatabase();
  const config = await getBeerBaseConfig();
  
  // Generate random specialization (weighted toward high-value types)
  const specializations = [
    BotSpecialization.Hoarder, // 30% - Most valuable
    BotSpecialization.Hoarder,
    BotSpecialization.Hoarder,
    BotSpecialization.Fortress, // 20% - High defense
    BotSpecialization.Fortress,
    BotSpecialization.Raider, // 20% - High offense
    BotSpecialization.Raider,
    BotSpecialization.Balanced, // 20% - Balanced
    BotSpecialization.Balanced,
    BotSpecialization.Ghost, // 10% - Rare, hard to find
  ];
  
  const specialization = specializations[Math.floor(Math.random() * specializations.length)];
  
  // Select random power tier for this Beer Base
  const powerTier = selectRandomPowerTier();
  
  // Generate position
  const position = getRandomPosition();
  
  // Generate base bot using createBot service
  const bot = await createBot(null, specialization, true); // null zone = random, true = is Beer Base
  
  // Override position to be truly random (not zone-constrained)
  bot.base = position;
  bot.currentPosition = position;
  
  // Generate realistic unit composition
  const units = generateBeerBaseUnits(specialization, powerTier);
  
  // Calculate total strength and defense from units
  const totalStrength = units.reduce((sum, unit) => sum + (unit.strength * unit.quantity), 0);
  const totalDefense = units.reduce((sum, unit) => sum + (unit.defense * unit.quantity), 0);
  
  // Update bot with units and calculated power
  bot.units = units;
  bot.totalStrength = totalStrength;
  bot.totalDefense = totalDefense;
  
  // Generate unique username using timestamp + random suffix to avoid race conditions
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 10000);
  bot.username = `🍺BeerBase-${powerTier}-${timestamp}-${randomSuffix}`;
  
  // Set appropriate level based on power tier
  switch (powerTier) {
    case PowerTier.Weak:
      bot.level = 1 + Math.floor(Math.random() * 5); // 1-5
      bot.rank = 1;
      break;
    case PowerTier.Mid:
      bot.level = 5 + Math.floor(Math.random() * 5); // 5-10
      bot.rank = 2;
      break;
    case PowerTier.Strong:
      bot.level = 10 + Math.floor(Math.random() * 10); // 10-20
      bot.rank = 3;
      break;
    case PowerTier.Elite:
      bot.level = 20 + Math.floor(Math.random() * 10); // 20-30
      bot.rank = 4;
      break;
    case PowerTier.Ultra:
      bot.level = 30 + Math.floor(Math.random() * 10); // 30-40
      bot.rank = 5;
      break;
    case PowerTier.Legendary:
      bot.level = 40 + Math.floor(Math.random() * 20); // 40-60
      bot.rank = 6;
      break;
  }
  
  // Boost resources based on power tier (Beer Bases are high-value targets)
  const resourceMultipliers: Record<PowerTier, number> = {
    [PowerTier.Weak]: 2,
    [PowerTier.Mid]: 3,
    [PowerTier.Strong]: 5,
    [PowerTier.Elite]: 8,
    [PowerTier.Ultra]: 12,
    [PowerTier.Legendary]: 20,
  };
  
  const multiplier = resourceMultipliers[powerTier] * config.resourceMultiplier;
  bot.resources = {
    metal: Math.floor((bot.resources?.metal || 1000) * multiplier),
    energy: Math.floor((bot.resources?.energy || 1000) * multiplier),
  };
  
  // Insert into database
  await db.collection('players').insertOne(bot);
  
  console.log(`🍺 Spawned Beer Base: ${bot.username} (${powerTier}) | STR: ${totalStrength} | DEF: ${totalDefense} | Units: ${units.length}`);
  
  return bot.username;
}

/**
 * Spawn multiple Beer Bases to reach target count
 */
export async function spawnBeerBases(count: number): Promise<string[]> {
  const spawned: string[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const username = await spawnBeerBase();
      spawned.push(username);
    } catch (error) {
      console.error(`Failed to spawn Beer Base ${i + 1}:`, error);
    }
  }
  
  return spawned;
}

/**
 * Remove a defeated Beer Base from database
 * Called by combat service when Beer Base is defeated
 */
export async function removeBeerBase(username: string): Promise<void> {
  const db = await connectToDatabase();
  
  // Verify it's actually a Beer Base
  const bot = await db.collection('players').findOne({ 
    username, 
    isBot: true, 
    isSpecialBase: true 
  });
  
  if (!bot) {
    throw new Error('Bot is not a Beer Base or does not exist');
  }
  
  // Remove completely from database
  await db.collection('players').deleteOne({ username });
  
  console.log(`🍺 Beer Base removed: ${username}`);
}

/**
 * Weekly respawn - Replace all Beer Bases
 * Called by cron job on Sunday at 4 AM
 */
export async function weeklyBeerBaseRespawn(): Promise<{
  removed: number;
  spawned: number;
  beerBases: string[];
}> {
  const db = await connectToDatabase();
  const config = await getBeerBaseConfig();
  
  if (!config.enabled) {
    return { removed: 0, spawned: 0, beerBases: [] };
  }
  
  // Remove all existing Beer Bases
  const deleteResult = await db.collection('players').deleteMany({ 
    isBot: true, 
    isSpecialBase: true 
  });
  
  const removed = deleteResult.deletedCount || 0;
  
  // Calculate target count
  const targetCount = await getTargetBeerBaseCount();
  
  // Spawn new Beer Bases
  const beerBases = await spawnBeerBases(targetCount);
  
  console.log(`🍺 Weekly Beer Base respawn: Removed ${removed}, Spawned ${beerBases.length}`);
  
  return {
    removed,
    spawned: beerBases.length,
    beerBases,
  };
}

/**
 * Get next scheduled Beer Base respawn time
 */
export function getNextRespawnTime(config: BeerBaseConfig = DEFAULT_CONFIG): Date {
  const now = new Date();
  const nextRespawn = new Date();
  
  // Set to target day and hour
  nextRespawn.setHours(config.respawnHour, 0, 0, 0);
  
  // Calculate days until target day
  const currentDay = now.getDay();
  let daysUntilRespawn = config.respawnDay - currentDay;
  
  // If target day has passed this week, go to next week
  if (daysUntilRespawn < 0 || (daysUntilRespawn === 0 && now.getHours() >= config.respawnHour)) {
    daysUntilRespawn += 7;
  }
  
  nextRespawn.setDate(now.getDate() + daysUntilRespawn);
  
  return nextRespawn;
}

/**
 * Get Beer Base statistics
 */
export async function getBeerBaseStats(): Promise<{
  current: number;
  target: number;
  config: BeerBaseConfig;
  nextRespawn: Date;
  beerBases: Array<{
    username: string;
    specialization: BotSpecialization;
    tier: number;
    position: { x: number; y: number };
    resources: { metal: number; energy: number };
    totalStrength: number;
    totalDefense: number;
  }>;
}> {
  const db = await connectToDatabase();
  const config = await getBeerBaseConfig();
  const current = await getCurrentBeerBaseCount();
  const target = await getTargetBeerBaseCount();
  const nextRespawn = getNextRespawnTime(config);
  
  // Get all Beer Bases with key info
  const beerBases = await db.collection('players').find(
    { isBot: true, isSpecialBase: true },
    { 
      projection: { 
        username: 1, 
        specialization: 1, 
        tier: 1, 
        currentPosition: 1, 
        resources: 1,
        totalStrength: 1,
        totalDefense: 1,
      } 
    }
  ).toArray();
  
  return {
    current,
    target,
    config,
    nextRespawn,
    beerBases: beerBases.map((bb: any) => ({
      username: bb.username,
      specialization: bb.specialization,
      tier: bb.tier,
      position: bb.currentPosition,
      resources: bb.resources,
      totalStrength: bb.totalStrength || 0,
      totalDefense: bb.totalDefense || 0,
    })),
  };
}

/**
 * Check if it's time for weekly respawn
 * Returns true if current time matches respawn schedule
 */
export function isRespawnTime(config: BeerBaseConfig = DEFAULT_CONFIG): boolean {
  const now = new Date();
  return now.getDay() === config.respawnDay && now.getHours() === config.respawnHour;
}

/**
 * Manual trigger for Beer Base respawn (admin only)
 */
export async function manualBeerBaseRespawn(): Promise<{
  success: boolean;
  removed: number;
  spawned: number;
  beerBases: string[];
}> {
  try {
    const result = await weeklyBeerBaseRespawn();
    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error('Manual Beer Base respawn failed:', error);
    return {
      success: false,
      removed: 0,
      spawned: 0,
      beerBases: [],
    };
  }
}

// ============================================================
// IMPLEMENTATION NOTES
// ============================================================
// Beer Bases are designed as high-value, temporary targets:
// 1. Spawn Rate: 5-10% of bot population (configurable)
// 2. Resources: 3x multiplier (configurable)
// 3. Lifecycle: Spawn weekly → Exist until defeated → Removed
// 4. Weekly Reset: Sunday 4 AM removes ALL and spawns new ones
// 5. Specialization: Weighted toward Hoarders (most valuable)
// 6. Tiers: Weighted toward T2-T3 (balanced challenge)
// 7. Integration: isSpecialBase flag used by scanner, combat
// 8. Admin: Full control over spawn rate, multiplier, schedule
// 
// FUTURE ENHANCEMENTS:
// - Bounty system integration (bonus rewards)
// - Achievement for defeating Beer Bases
// - Leaderboard for most Beer Bases defeated
// - Special loot tables (rare items)
// - Notification when Beer Base spawns nearby
// ============================================================
