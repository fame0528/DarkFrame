/**
 * @file lib/botMagnetService.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * Bot Magnet beacon system for attracting bots to strategic locations.
 * 
 * FEATURES:
 * - Deploy beacons at chosen coordinates (requires bot-magnet tech)
 * - Attract 30% of bots within 100-tile radius during spawn
 * - 7-day beacon duration (168 hours)
 * - 14-day cooldown between deployments
 * - Single active beacon per player
 * - Automatic beacon expiration cleanup
 * 
 * INTEGRATION:
 * - Tech requirement: player.unlockedTechs.includes('bot-magnet')
 * - Called by bot spawn logic to influence spawn locations
 * - Admin API for emergency beacon management
 * 
 * BEACON MECHANICS:
 * - Deployment: Player selects coordinates, beacon activates immediately
 * - Attraction: 30% chance to redirect spawning bots within 100-tile radius
 * - Duration: 168 hours (7 days) from deployment
 * - Cooldown: 336 hours (14 days) from deployment
 * - Expiration: Auto-removed when duration expires
 */

import { connectToDatabase } from '@/lib/mongodb';
import { Db, Collection, ObjectId } from 'mongodb';

/**
 * Bot Magnet beacon configuration
 */
export interface BotMagnetBeacon {
  _id?: ObjectId;
  playerId: ObjectId;
  playerName: string;
  x: number;
  y: number;
  deployedAt: Date;
  expiresAt: Date;
  cooldownUntil: Date;
  attractionRadius: number;  // Default 100 tiles
  attractionChance: number;  // Default 0.30 (30%)
  botsAttracted: number;     // Tracking metric
  active: boolean;
}

/**
 * Default beacon configuration
 */
const BEACON_CONFIG = {
  DURATION_HOURS: 168,        // 7 days
  COOLDOWN_HOURS: 336,        // 14 days
  ATTRACTION_RADIUS: 100,     // tiles
  ATTRACTION_CHANCE: 0.30,    // 30% of bots
  MAX_BEACONS_PER_PLAYER: 1,
} as const;

/**
 * Deploy a new bot magnet beacon
 */
export async function deployBeacon(
  playerId: ObjectId,
  playerName: string,
  x: number,
  y: number
): Promise<{
  success: boolean;
  message: string;
  beacon?: BotMagnetBeacon;
  cooldownRemaining?: number;
}> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  // Check for active beacon
  const existingBeacon = await beacons.findOne({
    playerId,
    active: true,
  });

  if (existingBeacon) {
    return {
      success: false,
      message: 'You already have an active beacon. Wait for it to expire or cooldown to complete.',
    };
  }

  // Check cooldown
  const lastBeacon = await beacons.findOne(
    { playerId },
    { sort: { deployedAt: -1 } }
  );

  if (lastBeacon) {
    const now = new Date();
    if (now < lastBeacon.cooldownUntil) {
      const cooldownRemaining = Math.ceil(
        (lastBeacon.cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60)
      );
      return {
        success: false,
        message: `Beacon on cooldown. ${cooldownRemaining} hours remaining.`,
        cooldownRemaining,
      };
    }
  }

  // Create new beacon
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BEACON_CONFIG.DURATION_HOURS * 60 * 60 * 1000);
  const cooldownUntil = new Date(now.getTime() + BEACON_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000);

  const beacon: BotMagnetBeacon = {
    playerId,
    playerName,
    x,
    y,
    deployedAt: now,
    expiresAt,
    cooldownUntil,
    attractionRadius: BEACON_CONFIG.ATTRACTION_RADIUS,
    attractionChance: BEACON_CONFIG.ATTRACTION_CHANCE,
    botsAttracted: 0,
    active: true,
  };

  const result = await beacons.insertOne(beacon);
  beacon._id = result.insertedId;

  return {
    success: true,
    message: `Beacon deployed at (${x}, ${y}). Active for ${BEACON_CONFIG.DURATION_HOURS} hours.`,
    beacon,
  };
}

/**
 * Get player's beacon status
 */
export async function getBeaconStatus(playerId: ObjectId): Promise<{
  hasActiveBeacon: boolean;
  beacon?: BotMagnetBeacon;
  cooldownRemaining?: number;
  canDeploy: boolean;
}> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  // Clean up expired beacons first
  await cleanupExpiredBeacons();

  // Check for active beacon
  const activeBeacon = await beacons.findOne({
    playerId,
    active: true,
  });

  if (activeBeacon) {
    return {
      hasActiveBeacon: true,
      beacon: activeBeacon,
      canDeploy: false,
    };
  }

  // Check cooldown
  const lastBeacon = await beacons.findOne(
    { playerId },
    { sort: { deployedAt: -1 } }
  );

  if (lastBeacon) {
    const now = new Date();
    if (now < lastBeacon.cooldownUntil) {
      const cooldownRemaining = Math.ceil(
        (lastBeacon.cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60)
      );
      return {
        hasActiveBeacon: false,
        cooldownRemaining,
        canDeploy: false,
      };
    }
  }

  return {
    hasActiveBeacon: false,
    canDeploy: true,
  };
}

/**
 * Get all active beacons (for spawn logic)
 */
export async function getActiveBeacons(): Promise<BotMagnetBeacon[]> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  // Clean up expired beacons first
  await cleanupExpiredBeacons();

  return await beacons.find({ active: true }).toArray();
}

/**
 * Check if spawn location should be redirected to beacon
 */
export async function shouldAttractToBeacon(
  x: number,
  y: number
): Promise<{
  attracted: boolean;
  targetX?: number;
  targetY?: number;
  beaconId?: ObjectId;
}> {
  const beacons = await getActiveBeacons();

  for (const beacon of beacons) {
    // Check if within attraction radius
    const distance = Math.sqrt(
      Math.pow(x - beacon.x, 2) + Math.pow(y - beacon.y, 2)
    );

    if (distance <= beacon.attractionRadius) {
      // 30% chance to attract
      if (Math.random() < beacon.attractionChance) {
        // Generate random offset from beacon (within 20 tiles)
        const offsetX = Math.floor(Math.random() * 41) - 20;
        const offsetY = Math.floor(Math.random() * 41) - 20;

        return {
          attracted: true,
          targetX: beacon.x + offsetX,
          targetY: beacon.y + offsetY,
          beaconId: beacon._id,
        };
      }
    }
  }

  return { attracted: false };
}

/**
 * Increment attracted bot count
 */
export async function incrementAttractedCount(beaconId: ObjectId): Promise<void> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  await beacons.updateOne(
    { _id: beaconId },
    { $inc: { botsAttracted: 1 } }
  );
}

/**
 * Clean up expired beacons
 */
export async function cleanupExpiredBeacons(): Promise<number> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  const now = new Date();
  const result = await beacons.updateMany(
    {
      active: true,
      expiresAt: { $lt: now },
    },
    {
      $set: { active: false },
    }
  );

  return result.modifiedCount;
}

/**
 * Deactivate player's beacon (early removal)
 */
export async function deactivateBeacon(playerId: ObjectId): Promise<{
  success: boolean;
  message: string;
}> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  const result = await beacons.updateOne(
    {
      playerId,
      active: true,
    },
    {
      $set: { active: false },
    }
  );

  if (result.modifiedCount === 0) {
    return {
      success: false,
      message: 'No active beacon found.',
    };
  }

  return {
    success: true,
    message: 'Beacon deactivated successfully.',
  };
}

/**
 * Get beacon statistics (admin)
 */
export async function getBeaconStats(): Promise<{
  totalBeacons: number;
  activeBeacons: number;
  totalBotsAttracted: number;
  averageAttraction: number;
  topBeacons: Array<{
    playerName: string;
    location: string;
    botsAttracted: number;
    deployedAt: Date;
  }>;
}> {
  const db = await connectToDatabase();
  const beacons: Collection<BotMagnetBeacon> = db.collection('botMagnetBeacons');

  const [total, active, topBeacons] = await Promise.all([
    beacons.countDocuments(),
    beacons.countDocuments({ active: true }),
    beacons.find()
      .sort({ botsAttracted: -1 })
      .limit(10)
      .toArray(),
  ]);

  const totalAttracted = topBeacons.reduce((sum, b) => sum + b.botsAttracted, 0);

  return {
    totalBeacons: total,
    activeBeacons: active,
    totalBotsAttracted: totalAttracted,
    averageAttraction: total > 0 ? totalAttracted / total : 0,
    topBeacons: topBeacons.map(b => ({
      playerName: b.playerName,
      location: `(${b.x}, ${b.y})`,
      botsAttracted: b.botsAttracted,
      deployedAt: b.deployedAt,
    })),
  };
}

/**
 * IMPLEMENTATION NOTES:
 * - Beacons stored in 'botMagnetBeacons' collection
 * - Cleanup runs automatically before each query
 * - Attraction happens during bot spawn in scripts/spawnBots.ts
 * - Tech requirement enforced at API level (bot-magnet)
 * - Cooldown is 2x duration (14 days vs 7 days active)
 * - Each player can only have 1 beacon at a time
 * - Beacons attract within 100-tile radius with 30% probability
 * - Attracted bots spawn within 20-tile radius of beacon center
 */
