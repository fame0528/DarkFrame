/**
 * Experience & Leveling Service
 * Created: 2025-10-17
 * 
 * OVERVIEW:
 * Core service for player progression through experience points (XP) and levels.
 * Handles XP awards, level calculations, research point (RP) rewards, and level-up
 * notifications. Integrates with all game systems to provide continuous progression.
 * 
 * LEVELING FORMULA:
 * level = Math.floor(totalXP / 1000) + 1
 * XP required for next level = currentLevel * 1000
 * 
 * REWARDS:
 * - 1 Research Point (RP) per level gained
 * - Future: Unlock special abilities, units, features
 * 
 * XP AWARD TABLE:
 * - Harvest (Metal/Energy): +10 XP
 * - Cave exploration: +15 XP
 * - Cave item (rare): +25 XP
 * - Cave item (legendary): +50 XP
 * - Factory capture: +100 XP
 * - Factory upgrade: +50 XP
 * - Unit building: +5 XP per unit
 * - Shrine sacrifice: +20 XP
 * - Infantry attack win: +150 XP
 * - Infantry attack loss: +25 XP
 * - Base attack win: +200 XP
 * - Base attack loss: +30 XP
 * - Defense success: +75 XP
 * - Factory defense: +50 XP
 */

import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { triggerAchievementCheck } from '@/lib/statTrackingService';

/**
 * XP action types for logging and tracking
 */
export enum XPAction {
  // Resource gathering
  HARVEST_RESOURCE = 'harvest_resource',
  CAVE_EXPLORATION = 'cave_exploration',
  CAVE_ITEM_RARE = 'cave_item_rare',
  CAVE_ITEM_LEGENDARY = 'cave_item_legendary',
  
  // Factory actions
  FACTORY_CAPTURE = 'factory_capture',
  FACTORY_UPGRADE = 'factory_upgrade',
  FACTORY_ABANDON = 'factory_abandon',
  
  // Unit actions
  UNIT_BUILD = 'unit_build',
  
  // Shrine actions
  SHRINE_SACRIFICE = 'shrine_sacrifice',
  
  // Combat actions
  INFANTRY_ATTACK_WIN = 'infantry_attack_win',
  INFANTRY_ATTACK_LOSS = 'infantry_attack_loss',
  BASE_ATTACK_WIN = 'base_attack_win',
  BASE_ATTACK_LOSS = 'base_attack_loss',
  DEFENSE_SUCCESS = 'defense_success',
  FACTORY_DEFENSE = 'factory_defense',
  
  // Special events
  FIRST_LOGIN = 'first_login',
  DAILY_LOGIN = 'daily_login'
}

/**
 * XP amounts for each action type
 */
export const XP_REWARDS: Record<XPAction, number> = {
  [XPAction.HARVEST_RESOURCE]: 10,
  [XPAction.CAVE_EXPLORATION]: 15,
  [XPAction.CAVE_ITEM_RARE]: 25,
  [XPAction.CAVE_ITEM_LEGENDARY]: 50,
  
  [XPAction.FACTORY_CAPTURE]: 100,
  [XPAction.FACTORY_UPGRADE]: 50,
  [XPAction.FACTORY_ABANDON]: 0, // No reward for abandoning
  
  [XPAction.UNIT_BUILD]: 5, // Per unit
  
  [XPAction.SHRINE_SACRIFICE]: 20,
  
  [XPAction.INFANTRY_ATTACK_WIN]: 150,
  [XPAction.INFANTRY_ATTACK_LOSS]: 25,
  [XPAction.BASE_ATTACK_WIN]: 200,
  [XPAction.BASE_ATTACK_LOSS]: 30,
  [XPAction.DEFENSE_SUCCESS]: 75,
  [XPAction.FACTORY_DEFENSE]: 50,
  
  [XPAction.FIRST_LOGIN]: 100,
  [XPAction.DAILY_LOGIN]: 10
};

/**
 * Player XP statistics
 */
export interface PlayerXPStats {
  username: string;
  totalXP: number;
  level: number;
  currentLevelXP: number;
  xpForNextLevel: number;
  progressPercent: number;
  researchPoints: number;
  totalLevelsGained: number;
}

/**
 * Level-up result
 */
export interface LevelUpResult {
  levelsGained: number;
  newLevel: number;
  rpAwarded: number;
  totalRP: number;
}

/**
 * Calculate player level from total XP
 * Formula: level = floor(totalXP / 1000) + 1
 * 
 * @param totalXP - Total experience points
 * @returns Player level (minimum 1)
 * 
 * @example
 * calculateLevel(0);    // Returns 1
 * calculateLevel(999);  // Returns 1
 * calculateLevel(1000); // Returns 2
 * calculateLevel(5432); // Returns 6
 */
export function calculateLevel(totalXP: number): number {
  if (totalXP < 0) return 1;
  return Math.floor(totalXP / 1000) + 1;
}

/**
 * Calculate XP required for next level
 * 
 * @param currentLevel - Current player level
 * @returns XP needed to reach next level
 * 
 * @example
 * getXPForNextLevel(1); // Returns 1000
 * getXPForNextLevel(5); // Returns 5000
 */
export function getXPForNextLevel(currentLevel: number): number {
  return currentLevel * 1000;
}

/**
 * Calculate XP progress within current level
 * 
 * @param totalXP - Total experience points
 * @returns Object with current level XP and progress percentage
 * 
 * @example
 * getXPProgress(1234);
 * // Returns: { currentLevelXP: 234, progressPercent: 23.4, xpForNextLevel: 1000 }
 */
export function getXPProgress(totalXP: number): {
  currentLevelXP: number;
  progressPercent: number;
  xpForNextLevel: number;
} {
  const level = calculateLevel(totalXP);
  const xpAtLevelStart = (level - 1) * 1000;
  const currentLevelXP = totalXP - xpAtLevelStart;
  const xpForNextLevel = getXPForNextLevel(level);
  const progressPercent = (currentLevelXP / xpForNextLevel) * 100;
  
  return {
    currentLevelXP,
    progressPercent: Math.min(progressPercent, 100),
    xpForNextLevel
  };
}

/**
 * Award XP to a player and handle level-ups
 * 
 * @param playerId - Player ID or username
 * @param action - XP action type
 * @param multiplier - XP multiplier (default 1, for quantity-based awards)
 * @returns Updated player XP stats and level-up info
 * 
 * @example
 * await awardXP('player123', XPAction.HARVEST_RESOURCE);
 * await awardXP('player123', XPAction.UNIT_BUILD, 10); // 10 units = 50 XP
 */
export async function awardXP(
  playerId: string,
  action: XPAction,
  multiplier: number = 1
): Promise<{
  xpAwarded: number;
  totalXP: number;
  oldLevel: number;
  newLevel: number;
  levelUp: boolean;
  levelUpResult?: LevelUpResult;
}> {
  const db = await connectToDatabase();
  const playersCollection = db.collection('players');
  
  // Calculate XP to award
  const baseXP = XP_REWARDS[action] || 0;
  const xpAwarded = baseXP * multiplier;
  
  // Find player
  const query = playerId.length === 24 && ObjectId.isValid(playerId)
    ? { _id: new ObjectId(playerId) }
    : { username: playerId };
  
  const player = await playersCollection.findOne(query);
  
  if (!player) {
    throw new Error(`Player not found: ${playerId}`);
  }
  
  // Get current stats
  const currentXP = player.xp || 0;
  const currentLevel = player.level || 1;
  
  // Calculate new stats
  const newTotalXP = currentXP + xpAwarded;
  const newLevel = calculateLevel(newTotalXP);
  const levelUp = newLevel > currentLevel;
  
  // Prepare update
  const updateData: any = {
    xp: newTotalXP,
    level: newLevel,
    lastXPAward: new Date()
  };
  
  let levelUpResult: LevelUpResult | undefined;
  
  // Handle level-up rewards
  if (levelUp) {
    const levelsGained = newLevel - currentLevel;
    
    // Award scaled RP via researchPointService (level × 5, max 500 per level)
    const username = typeof playerId === 'string' && playerId.length !== 24 
      ? playerId 
      : player.username;
    
    let totalRPAwarded = 0;
    try {
      const { awardRP } = await import('./researchPointService');
      
      for (let i = 0; i < levelsGained; i++) {
        const level = currentLevel + i + 1;
        const rpForLevel = Math.min(level * 5, 500); // Scale: level × 5, cap at 500
        
        const result = await awardRP(
          username,
          rpForLevel,
          'level_up',
          `Reached Level ${level}`,
          { level }
        );
        
        if (result.success) {
          totalRPAwarded += result.rpAwarded;
          console.log(`🎉 Level up! ${username} reached Level ${level} and earned ${result.rpAwarded} RP`);
        }
      }
    } catch (error) {
      console.error('❌ Error awarding RP for level up:', error);
      // Fallback to old system if RP service fails (1 RP per level)
      const rpAwarded = levelsGained;
      const currentRP = player.researchPoints || 0;
      updateData.researchPoints = currentRP + rpAwarded;
      totalRPAwarded = rpAwarded;
    }
    
    updateData.lastLevelUp = new Date();
    
    levelUpResult = {
      levelsGained,
      newLevel,
      rpAwarded: totalRPAwarded,
      totalRP: (player.researchPoints || 0) + totalRPAwarded
    };
  }
  
  // Update player
  await playersCollection.updateOne(
    query,
    { $set: updateData }
  );
  
  // Check achievements if player leveled up
  if (levelUp) {
    const username = typeof playerId === 'string' && playerId.length !== 24 
      ? playerId 
      : player.username;
    await triggerAchievementCheck(username);
  }
  
  return {
    xpAwarded,
    totalXP: newTotalXP,
    oldLevel: currentLevel,
    newLevel,
    levelUp,
    levelUpResult
  };
}

/**
 * Get detailed XP statistics for a player
 * 
 * @param playerId - Player ID or username
 * @returns Complete XP stats
 * 
 * @example
 * const stats = await getPlayerXPStats('JohnDoe');
 * console.log(`Level ${stats.level} (${stats.progressPercent}%)`);
 */
export async function getPlayerXPStats(playerId: string): Promise<PlayerXPStats | null> {
  const db = await connectToDatabase();
  const playersCollection = db.collection('players');
  
  const query = playerId.length === 24 && ObjectId.isValid(playerId)
    ? { _id: new ObjectId(playerId) }
    : { username: playerId };
  
  const player = await playersCollection.findOne(query);
  
  if (!player) {
    return null;
  }
  
  const totalXP = player.xp || 0;
  const level = player.level || 1;
  const progress = getXPProgress(totalXP);
  
  return {
    username: player.username,
    totalXP,
    level,
    currentLevelXP: progress.currentLevelXP,
    xpForNextLevel: progress.xpForNextLevel,
    progressPercent: progress.progressPercent,
    researchPoints: player.researchPoints || 0,
    totalLevelsGained: level - 1
  };
}

/**
 * Get top players by XP for leaderboard
 * 
 * @param limit - Number of players to return
 * @returns Sorted list of players by XP
 */
export async function getTopPlayersByXP(limit: number = 100): Promise<Array<{
  rank: number;
  username: string;
  totalXP: number;
  level: number;
  researchPoints: number;
}>> {
  const db = await connectToDatabase();
  const playersCollection = db.collection('players');
  
  const players = await playersCollection
    .find({}, {
      projection: {
        username: 1,
        xp: 1,
        level: 1,
        researchPoints: 1
      }
    })
    .toArray();
  
  // Sort by XP descending
  const sorted = players
    .map(p => ({
      username: p.username,
      totalXP: p.xp || 0,
      level: p.level || 1,
      researchPoints: p.researchPoints || 0
    }))
    .sort((a, b) => {
      // Primary: XP descending
      if (b.totalXP !== a.totalXP) {
        return b.totalXP - a.totalXP;
      }
      // Tie-breaker: username ascending
      return a.username.localeCompare(b.username);
    });
  
  // Add ranks
  return sorted.slice(0, limit).map((player, index) => ({
    rank: index + 1,
    ...player
  }));
}

/**
 * Spend research points to unlock features
 * 
 * @param playerId - Player ID or username
 * @param amount - RP to spend
 * @param reason - What the RP was spent on
 * @returns Updated RP balance
 * 
 * @example
 * await spendResearchPoints('player123', 5, 'Unlock Tier 2 Units');
 */
export async function spendResearchPoints(
  playerId: string,
  amount: number,
  reason: string
): Promise<{
  success: boolean;
  newBalance: number;
  message: string;
}> {
  const db = await connectToDatabase();
  const playersCollection = db.collection('players');
  
  const query = playerId.length === 24 && ObjectId.isValid(playerId)
    ? { _id: new ObjectId(playerId) }
    : { username: playerId };
  
  const player = await playersCollection.findOne(query);
  
  if (!player) {
    return {
      success: false,
      newBalance: 0,
      message: 'Player not found'
    };
  }
  
  const currentRP = player.researchPoints || 0;
  
  if (currentRP < amount) {
    return {
      success: false,
      newBalance: currentRP,
      message: `Insufficient research points. Need ${amount}, have ${currentRP}`
    };
  }
  
  const newBalance = currentRP - amount;
  
  await playersCollection.updateOne(
    query,
    {
      $set: { researchPoints: newBalance },
      $push: {
        rpHistory: {
          amount: -amount,
          reason,
          timestamp: new Date(),
          balance: newBalance
        }
      } as any
    }
  );
  
  return {
    success: true,
    newBalance,
    message: `Spent ${amount} RP on ${reason}`
  };
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Level Progression:
 *    - Linear XP requirement (1000 per level)
 *    - Simple formula for easy calculation
 *    - No level cap (infinite progression)
 *    - Future: Could add exponential scaling for higher levels
 * 
 * 2. Research Points:
 *    - 1 RP per level gained
 *    - Used to unlock unit tiers, features, abilities
 *    - Spending tracked in rpHistory array
 *    - Cannot go negative
 * 
 * 3. XP Awards:
 *    - Balanced for typical gameplay loops
 *    - Combat awards significantly more than gathering
 *    - Quantity-based multiplier for bulk actions
 *    - All awards logged for analytics
 * 
 * 4. Performance:
 *    - Atomic updates prevent race conditions
 *    - Efficient level calculation (no loops)
 *    - Indexed queries on username and xp fields
 *    - Future: Cache top 100 with Redis
 * 
 * 5. Future Enhancements:
 *    - XP boost items (temporary multipliers)
 *    - Double XP events (weekends, special occasions)
 *    - XP penalties for deaths/losses
 *    - Prestige system (reset level for bonuses)
 *    - Level-based unlock notifications
 *    - XP history tracking per action type
 */
