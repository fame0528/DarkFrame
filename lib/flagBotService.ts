/**
 * @file lib/flagBotService.ts
 * @created 2025-10-23
 * @overview Flag Bot lifecycle management service
 * 
 * OVERVIEW:
 * Manages the AI-controlled bot that holds the flag when no player possesses it.
 * Handles bot spawning, movement, defeat mechanics, and flag transfer logic.
 * Integrates with botService.ts for bot creation and flags collection for state.
 * 
 * Features:
 * - Spawn flag bot at random position when needed
 * - Move bot randomly every 30 minutes (1-3 tiles)
 * - Handle bot defeat and flag transfer to victor
 * - Reset/respawn bot if flag unclaimed for > 1 hour
 * - Track flag ownership in MongoDB flags collection
 * 
 * Related Files:
 * - /lib/botService.ts - Bot creation utilities
 * - /app/api/flag/route.ts - Flag API endpoints
 * - /types/flag.types.ts - Flag type definitions
 * - /lib/flagService.ts - Flag calculation utilities
 */

import { ObjectId } from 'mongodb';
import { BotSpecialization, type Player, type Position } from '@/types/game.types';
import { createBot } from '@/lib/botService';
import { getDatabase } from '@/lib/mongodb';
import { FLAG_CONFIG } from '@/types/flag.types';

/**
 * Flag bot configuration
 * Uses Balanced specialization with custom HP for flag defense
 */
const FLAG_BOT_CONFIG = {
  specialization: BotSpecialization.Balanced,
  tier: 2, // Mid-tier bot
  baseHP: FLAG_CONFIG.BASE_ATTACK_DAMAGE * 10, // 100 * 10 = 1000 HP
  respawnDelay: 3600000, // 1 hour in milliseconds
  mapSize: { min: 1, max: 150 }, // Full map coordinates
};

// ============================================================
// FLAG BOT RETRIEVAL
// ============================================================

/**
 * Get the current flag bot from database
 * Queries the flags collection for active flag holder
 * 
 * @returns Flag bot Player object or null if no bot holds flag
 * 
 * @example
 * ```typescript
 * const flagBot = await getFlagBot();
 * if (flagBot) {
 *   console.log(`Flag held by bot: ${flagBot.username}`);
 * }
 * ```
 */
export async function getFlagBot(): Promise<Player | null> {
  try {
    const db = await getDatabase();
    const flagDoc = await db.collection('flags').findOne({});
    
    if (!flagDoc || !flagDoc.currentHolder || !flagDoc.currentHolder.botId) {
      return null; // Flag held by player or doesn't exist
    }
    
    // Get the bot from players collection
    const bot = await db.collection('players').findOne({
      _id: flagDoc.currentHolder.botId
    }) as Player | null;
    
    return bot;
  } catch (error) {
    console.error('❌ Error getting flag bot:', error);
    return null;
  }
}

// ============================================================
// FLAG BOT CREATION
// ============================================================

/**
 * Create a new flag bot with flag in possession
 * Uses botService.createBot() pattern with custom configuration
 * Initializes flags collection if it doesn't exist
 * Spawns at completely random location (1-150, 1-150) unless position specified
 * 
 * @param position - Optional spawn position (completely random if not provided)
 * @returns Newly created flag bot Player object
 * 
 * @example
 * ```typescript
 * // Spawn at random position anywhere on map
 * const bot = await createFlagBot();
 * 
 * // Spawn at specific position
 * const bot = await createFlagBot({ x: 75, y: 75 });
 * ```
 */
export async function createFlagBot(position?: Position): Promise<Player> {
  try {
    const db = await getDatabase();
    
    // Create bot using botService pattern (zone will be calculated from final position)
    const botData = await createBot(
      null, // Random zone (will be overridden by position)
      FLAG_BOT_CONFIG.specialization,
      false // Not a Beer Base
    );
    
    // Generate completely random position anywhere on 150x150 map if not provided
    const spawnPosition = position || {
      x: Math.floor(Math.random() * FLAG_BOT_CONFIG.mapSize.max) + FLAG_BOT_CONFIG.mapSize.min,
      y: Math.floor(Math.random() * FLAG_BOT_CONFIG.mapSize.max) + FLAG_BOT_CONFIG.mapSize.min,
    };
    
    // Override position with random or specified location
    botData.base = spawnPosition;
    botData.currentPosition = spawnPosition;
    
    // Add flag-specific fields
    const flagBot = {
      ...botData,
      currentHP: FLAG_BOT_CONFIG.baseHP,
      maxHP: FLAG_BOT_CONFIG.baseHP,
      username: `Flag-Bearer-${Math.floor(Math.random() * 9999)}`,
    };
    
    // Insert bot into database
    const result = await db.collection('players').insertOne(flagBot as any);
    const botId = result.insertedId;
    
    // Initialize or update flags collection
    const flagsCollection = db.collection('flags');
    const existingFlag = await flagsCollection.findOne({});
    
    const flagData = {
      currentHolder: {
        playerId: null,
        botId: botId,
        username: flagBot.username,
        level: flagBot.level || 10,
        position: flagBot.currentPosition,
        claimedAt: new Date(),
      },
      lastTransfer: new Date(),
      transferHistory: [
        {
          from: { type: 'system', id: null, username: 'System' },
          to: { type: 'bot', id: botId, username: flagBot.username },
          timestamp: new Date(),
          method: 'spawn',
        },
      ],
      statistics: {
        totalTransfers: 0,
        longestHold: { username: '', duration: 0 },
        mostTransfers: { username: '', count: 0 },
      },
    };
    
    if (existingFlag) {
      // Update existing flag document
      await flagsCollection.updateOne(
        { _id: existingFlag._id },
        {
          $set: {
            currentHolder: flagData.currentHolder,
            lastTransfer: flagData.lastTransfer,
          },
          $push: {
            transferHistory: flagData.transferHistory[0] as any,
          },
        }
      );
    } else {
      // Create new flag document
      await flagsCollection.insertOne(flagData);
    }
    
    const createdBot = { ...flagBot, _id: botId } as Player;
    
    console.log(`✅ Flag bot created: ${createdBot.username} at (${createdBot.currentPosition.x}, ${createdBot.currentPosition.y})`);
    
    return createdBot;
  } catch (error) {
    console.error('❌ Error creating flag bot:', error);
    throw new Error('Failed to create flag bot');
  }
}

// ============================================================
// FLAG BOT MOVEMENT
// ============================================================

/**
 * Move flag bot to random position anywhere on the map
 * Called by cron job every 30 minutes
 * TELEPORTS to completely random location (1-150, 1-150) to keep flag dynamic
 * 
 * @param botId - ObjectId of the flag bot
 * @returns New position after teleport
 * 
 * @example
 * ```typescript
 * const newPosition = await moveFlagBot(botId);
 * console.log(`Bot teleported to (${newPosition.x}, ${newPosition.y})`);
 * ```
 */
export async function moveFlagBot(botId: ObjectId): Promise<Position> {
  try {
    const db = await getDatabase();
    const bot = await db.collection('players').findOne({ _id: botId }) as Player | null;
    
    if (!bot) {
      throw new Error('Flag bot not found');
    }
    
    // Generate completely random position anywhere on 150x150 map
    const newX = Math.floor(Math.random() * FLAG_BOT_CONFIG.mapSize.max) + FLAG_BOT_CONFIG.mapSize.min;
    const newY = Math.floor(Math.random() * FLAG_BOT_CONFIG.mapSize.max) + FLAG_BOT_CONFIG.mapSize.min;
    
    const newPosition: Position = { x: newX, y: newY };
    
    // Update bot position in database
    await db.collection('players').updateOne(
      { _id: botId },
      { $set: { currentPosition: newPosition } }
    );
    
    // Update flag position in flags collection
    await db.collection('flags').updateOne(
      { 'currentHolder.botId': botId },
      { $set: { 'currentHolder.position': newPosition } }
    );
    
    console.log(`� Flag bot teleported: (${bot.currentPosition.x}, ${bot.currentPosition.y}) → (${newX}, ${newY})`);
    
    return newPosition;
  } catch (error) {
    console.error('❌ Error moving flag bot:', error);
    throw new Error('Failed to move flag bot');
  }
}

// ============================================================
// FLAG BOT DEFEAT & TRANSFER
// ============================================================

/**
 * Handle flag bot defeat and transfer flag to victor
 * Called when bot HP reaches 0
 * Resets bot HP to full and transfers flag ownership
 * 
 * @param botId - ObjectId of defeated flag bot
 * @param victorId - ObjectId of victorious player
 * 
 * @example
 * ```typescript
 * await handleFlagBotDefeat(botId, playerId);
 * console.log('Flag transferred to player!');
 * ```
 */
export async function handleFlagBotDefeat(
  botId: ObjectId,
  victorId: ObjectId
): Promise<void> {
  try {
    const db = await getDatabase();
    
    // Get bot and victor data
    const bot = await db.collection('players').findOne({ _id: botId }) as Player | null;
    const victor = await db.collection('players').findOne({ _id: victorId }) as Player | null;
    
    if (!bot || !victor) {
      throw new Error('Bot or victor not found');
    }
    
    // Reset bot HP to full
    await db.collection('players').updateOne(
      { _id: botId },
      { $set: { currentHP: FLAG_BOT_CONFIG.baseHP } }
    );
    
    // Transfer flag to victor
    await db.collection('flags').updateOne(
      {},
      {
        $set: {
          currentHolder: {
            playerId: victorId,
            botId: null,
            username: victor.username,
            level: victor.level || 1,
            position: victor.currentPosition,
            claimedAt: new Date(),
          },
          lastTransfer: new Date(),
        },
        $push: {
          transferHistory: {
            from: { type: 'bot', id: botId, username: bot.username },
            to: { type: 'player', id: victorId, username: victor.username },
            timestamp: new Date(),
            method: 'combat',
          } as any,
        },
        $inc: { 'statistics.totalTransfers': 1 },
      }
    );
    
    console.log(`⚔️ Flag transferred: ${bot.username} (bot) → ${victor.username} (player)`);
  } catch (error) {
    console.error('❌ Error handling flag bot defeat:', error);
    throw new Error('Failed to handle flag bot defeat');
  }
}

// ============================================================
// FLAG BOT RESET & RESPAWN
// ============================================================

/**
 * Reset flag bot if unclaimed for > 1 hour
 * Despawns old bot and spawns new one with flag
 * Called by cron job to keep flag active
 * 
 * @returns Newly spawned flag bot
 * 
 * @example
 * ```typescript
 * const newBot = await resetFlagBot();
 * console.log(`New flag bot spawned: ${newBot.username}`);
 * ```
 */
export async function resetFlagBot(): Promise<Player> {
  try {
    const db = await getDatabase();
    const flagDoc = await db.collection('flags').findOne({});
    
    if (flagDoc?.currentHolder?.botId) {
      // Remove old flag bot
      await db.collection('players').deleteOne({
        _id: flagDoc.currentHolder.botId,
      });
      
      console.log(`🗑️ Old flag bot removed: ${flagDoc.currentHolder.username}`);
    }
    
    // Create new flag bot at random position
    const newBot = await createFlagBot();
    
    console.log(`🔄 Flag bot reset and respawned: ${newBot.username}`);
    
    return newBot;
  } catch (error) {
    console.error('❌ Error resetting flag bot:', error);
    throw new Error('Failed to reset flag bot');
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Check if flag needs reset (unclaimed for > 1 hour)
 * 
 * @returns True if flag should be reset
 */
export async function shouldResetFlag(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const flagDoc = await db.collection('flags').findOne({});
    
    if (!flagDoc?.currentHolder) {
      return true; // No holder, needs reset
    }
    
    const timeSinceClaim = Date.now() - flagDoc.currentHolder.claimedAt.getTime();
    const shouldReset = timeSinceClaim > FLAG_BOT_CONFIG.respawnDelay;
    
    return shouldReset;
  } catch (error) {
    console.error('❌ Error checking flag reset status:', error);
    return false;
  }
}

/**
 * Initialize flags collection with first flag bot
 * Called on first server startup if flags collection doesn't exist
 */
export async function initializeFlagSystem(): Promise<void> {
  try {
    const db = await getDatabase();
    const flagDoc = await db.collection('flags').findOne({});
    
    if (!flagDoc) {
      console.log('🏴 Initializing flag system for first time...');
      await createFlagBot();
      console.log('✅ Flag system initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing flag system:', error);
    throw new Error('Failed to initialize flag system');
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Flag bot uses Balanced specialization (not special Beer Base)
// - Bot HP: 1000 (10x base attack damage for multiple attacks)
// - Movement: TELEPORTS to random location (1-150, 1-150) every 30 min
// - Spawn: Completely random position anywhere on 150×150 map
// - Reset: If unclaimed for > 1 hour, despawn and respawn at new random location
// - Flags collection: Singleton document tracking current holder
// - Transfer history: Tracks all flag ownership changes
// - Statistics: Longest hold time, most transfers per player
// 
// Why Random Teleport Instead of Incremental Movement?
// - Map is 150×150 = 22,500 tiles
// - Moving 1-3 tiles every 30 min would keep flag in tiny area
// - Random teleport ensures flag is accessible to all players
// - Creates dynamic gameplay - flag location constantly changes
// - Prevents flag camping in one zone
// 
// Related Lessons:
// - Lesson #35: Zero mocks - all data from MongoDB
// - Lesson #37: Complete file reading before implementation
// 
// Database Collections Used:
// - players: Bot and player data
// - flags: Current flag state (singleton document)
// ============================================================
// END OF FILE
// ============================================================
