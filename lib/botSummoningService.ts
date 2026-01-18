/**
 * @file lib/botSummoningService.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * Bot Summoning Circle system for spawning bots of chosen specialization.
 * 
 * FEATURES:
 * - Spawn 5 bots of selected specialization
 * - Bots spawn within 20-tile radius of player position
 * - Summoned bots have 1.5x base resources
 * - 7-day (168 hour) cooldown per summon
 * - Tech requirement: bot-summoning-circle
 * - Cooldown tracked per player
 * 
 * INTEGRATION:
 * - Called via API endpoint /api/bot-summoning
 * - Uses createBot from botService with resource multiplier
 * - Cooldown stored in player document (lastBotSummon field)
 * 
 * SUMMONING MECHANICS:
 * - Player selects specialization (Hoarder, Fortress, Raider, Balanced, Ghost)
 * - 5 bots created with chosen specialization
 * - Each bot spawns at random position within 20-tile radius
 * - Resource multiplier: 1.5x (NOT Beer Base level, but significant boost)
 * - Cooldown: 168 hours (7 days) from last summon
 */

import { getCollection } from '@/lib/mongodb';
import { type Player, BotSpecialization } from '@/types/game.types';
import { createBotPlayer } from '@/lib/botService';
import { ObjectId } from 'mongodb';

/**
 * Summoning configuration
 */
const SUMMONING_CONFIG = {
  BOT_COUNT: 5,
  SPAWN_RADIUS: 20,
  RESOURCE_MULTIPLIER: 1.5,
  COOLDOWN_HOURS: 168, // 7 days
} as const;

/**
 * Summon bots at player location
 */
export async function summonBots(
  playerId: ObjectId,
  playerPosition: { x: number; y: number },
  specialization: BotSpecialization
): Promise<{
  success: boolean;
  message: string;
  bots?: Array<{ username: string; position: { x: number; y: number } }>;
}> {
  const playersCollection = await getCollection<Player>('players');

  // Check cooldown
  const player = await playersCollection.findOne({ _id: playerId });

  if (!player) {
    return {
      success: false,
      message: 'Player not found',
    };
  }

  // Check tech requirement
  const unlockedTechs = player.unlockedTechs || [];
  if (!unlockedTechs.includes('bot-summoning-circle')) {
    return {
      success: false,
      message: 'Requires Bot Summoning Circle technology',
    };
  }

  const lastSummon = player.lastBotSummon as Date | undefined;
  if (lastSummon) {
    const now = new Date();
    const cooldownMs = SUMMONING_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000;
    const nextSummonTime = new Date(lastSummon.getTime() + cooldownMs);

    if (now < nextSummonTime) {
      const hoursRemaining = Math.ceil(
        (nextSummonTime.getTime() - now.getTime()) / (1000 * 60 * 60)
      );
      return {
        success: false,
        message: `Summoning on cooldown. ${hoursRemaining} hours remaining.`,
      };
    }
  }

  // Generate spawn positions
  const spawnPositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < SUMMONING_CONFIG.BOT_COUNT; i++) {
    // Random offset within radius
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * SUMMONING_CONFIG.SPAWN_RADIUS;
    const offsetX = Math.round(Math.cos(angle) * distance);
    const offsetY = Math.round(Math.sin(angle) * distance);

    spawnPositions.push({
      x: playerPosition.x + offsetX,
      y: playerPosition.y + offsetY,
    });
  }

  // Create bots
  const botsToInsert = [];
  const botInfo: Array<{ username: string; position: { x: number; y: number } }> = [];

  for (const position of spawnPositions) {
    // Calculate zone from position
    const zone = Math.floor(position.x / 50) * 3 + Math.floor(position.y / 50);
    
    // Create bot with resource multiplier
    const bot = await createBotPlayer(zone, specialization, false);

    // Apply resource multiplier (with safety checks)
    if (bot.resources) {
      bot.resources.metal = Math.floor(bot.resources.metal * SUMMONING_CONFIG.RESOURCE_MULTIPLIER);
      bot.resources.energy = Math.floor(bot.resources.energy * SUMMONING_CONFIG.RESOURCE_MULTIPLIER);
    }

    // Set position
    bot.base = position;
    bot.currentPosition = position;

    // Mark as summoned (for tracking)
    if (bot.botConfig) {
      bot.botConfig.summonedBy = playerId;
      bot.botConfig.summonedAt = new Date();
    }

    botsToInsert.push(bot);
    botInfo.push({
      username: bot.username || 'Unknown',
      position,
    });
  }

  // Insert bots into database
  if (botsToInsert.length > 0) {
    await playersCollection.insertMany(botsToInsert as any);
  }

  // Update player's last summon time
  await playersCollection.updateOne(
    { _id: playerId },
    { $set: { lastBotSummon: new Date() } }
  );

  return {
    success: true,
    message: `Summoned ${SUMMONING_CONFIG.BOT_COUNT} ${specialization} bots`,
    bots: botInfo,
  };
}

/**
 * Get summoning cooldown status
 */
export async function getSummoningStatus(
  playerId: ObjectId
): Promise<{
  canSummon: boolean;
  hoursRemaining?: number;
  lastSummon?: Date;
  nextSummonTime?: Date;
}> {
  const playersCollection = await getCollection<Player>('players');
  const player = await playersCollection.findOne(
    { _id: playerId },
    { projection: { lastBotSummon: 1 } }
  );

  if (!player) {
    return { canSummon: false };
  }

  const lastSummon = player.lastBotSummon as Date | undefined;

  if (!lastSummon) {
    return { canSummon: true };
  }

  const now = new Date();
  const cooldownMs = SUMMONING_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000;
  const nextSummonTime = new Date(lastSummon.getTime() + cooldownMs);

  if (now >= nextSummonTime) {
    return {
      canSummon: true,
      lastSummon,
    };
  }

  const hoursRemaining = Math.ceil(
    (nextSummonTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  );

  return {
    canSummon: false,
    hoursRemaining,
    lastSummon,
    nextSummonTime,
  };
}

/**
 * Get summoning statistics (admin)
 */
export async function getSummoningStats(): Promise<{
  totalSummons: number;
  activePlayerSummoners: number;
  summonsBySpecialization: Record<BotSpecialization, number>;
  recentSummons: Array<{
    playerName: string;
    specialization: BotSpecialization;
    botCount: number;
    summonedAt: Date;
  }>;
}> {
  const playersCollection = await getCollection<Player>('players');

  // Count players who have summoned
  const summoners = await playersCollection.countDocuments({
    lastBotSummon: { $exists: true },
  });

  // Count summoned bots by specialization
  const summonedBots = await playersCollection
    .find({
      isBot: true,
      'botConfig.summonedBy': { $exists: true },
    })
    .toArray();

  const summonsBySpec: Record<string, number> = {
    Hoarder: 0,
    Fortress: 0,
    Raider: 0,
    Balanced: 0,
    Ghost: 0,
  };

  summonedBots.forEach((bot) => {
    const spec = bot.botConfig?.specialization || 'Balanced';
    summonsBySpec[spec] = (summonsBySpec[spec] || 0) + 1;
  });

  // Get recent summons (group by player and summon time)
  const recentSummoners = await playersCollection
    .find(
      { lastBotSummon: { $exists: true } },
      { projection: { username: 1, lastBotSummon: 1 } }
    )
    .sort({ lastBotSummon: -1 })
    .limit(10)
    .toArray();

  const recentSummons = recentSummoners.map((player) => ({
    playerName: player.username,
    specialization: 'Unknown' as BotSpecialization, // Would need to track this separately
    botCount: SUMMONING_CONFIG.BOT_COUNT,
    summonedAt: player.lastBotSummon as Date,
  }));

  return {
    totalSummons: summonedBots.length,
    activePlayerSummoners: summoners,
    summonsBySpecialization: summonsBySpec as Record<BotSpecialization, number>,
    recentSummons,
  };
}

/**
 * Format time remaining for display
 */
export function formatTimeRemaining(hours: number): string {
  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  
  if (days > 0) {
    return `${days}d ${remainingHours}h`;
  }
  return `${remainingHours}h`;
}

/**
 * IMPLEMENTATION NOTES:
 * - Summons 5 bots of chosen specialization
 * - Bots spawn within 20-tile radius of player position
 * - Resource multiplier: 1.5x base resources (significant but not Beer Base level)
 * - Cooldown: 168 hours (7 days) stored in player.lastBotSummon
 * - Tech requirement: 'bot-summoning-circle' (enforced at API level)
 * - Summoned bots marked with botConfig.summonedBy and botConfig.summonedAt
 * - Spawn positions use polar coordinates for circular distribution
 * - Zone calculated from final position for proper bot placement
 * - All 5 bots inserted in single database operation
 * - Cooldown timer starts immediately after successful summon
 */
