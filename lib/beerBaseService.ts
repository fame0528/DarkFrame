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
import { BotSpecialization } from '@/types/game.types';

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
 */
const DEFAULT_CONFIG: BeerBaseConfig = {
  spawnRateMin: 5,
  spawnRateMax: 10,
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
  
  // Generate random tier (weighted toward higher tiers for Beer Bases)
  const tierWeights = [1, 2, 2, 3, 3, 3]; // Favors T2-T3
  const tier = tierWeights[Math.floor(Math.random() * tierWeights.length)] as 1 | 2 | 3;
  
  // Generate position
  const position = getRandomPosition();
  
  // Generate base bot using createBot service (generates zone-based bot with isSpecial flag)
  const bot = await createBot(null, specialization, true); // null zone = random, true = is Beer Base
  
  // Override position to be truly random (not zone-constrained)
  bot.base = position;
  bot.currentPosition = position;
  
  // Generate unique username with beer emoji
  const beerBaseNumber = (await getCurrentBeerBaseCount()) + 1;
  bot.username = `🍺BeerBase-${specialization}-${beerBaseNumber}`;
  
  // Insert into database
  await db.collection('players').insertOne(bot);
  
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
