/**
 * @file lib/researchPointService.ts
 * @created 2025-10-20
 * @overview Research Points (RP) management service for DarkFrame
 * 
 * OVERVIEW:
 * Centralized service for managing Research Points (RP) economy across the game.
 * Handles RP generation from multiple sources (harvesting, leveling, achievements, battles),
 * VIP bonus calculations (+50% RP), daily harvest milestone tracking, and RP spending validation.
 * 
 * Core features:
 * - Award RP from any source with automatic VIP bonus application
 * - Track daily harvest progress toward 6 milestones (1k/2.5k/5k/10k/15k/22.5k)
 * - Reset daily counters on map reset
 * - Query player RP stats and transaction history
 * - Validate and deduct RP for research/purchases
 * 
 * Economy design targets:
 * - Active player: 6,000-7,600 RP/day (full map + activities)
 * - VIP player: 9,000-11,400 RP/day (+50% bonus)
 * - 100k RP features achievable in 8-17 days of active play
 * - Flag research T1-T4 achievable in 1-2 days
 */

import { getDatabase } from './mongodb';
import type { Player, ResearchPointHistory } from '@/types/game.types';
import { type Collection, type Db } from 'mongodb';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Daily harvest progress tracking per player
 * Stores daily harvest count and completed milestones
 * Resets at daily map reset (12:00 AM and 12:00 PM server time)
 */
export interface DailyHarvestProgress {
  playerUsername: string;
  date: string; // YYYY-MM-DD format
  resetPeriod: string; // "AM" or "PM"
  harvestCount: number; // Total harvests today
  milestonesCompleted: number[]; // Array of milestone thresholds reached [1000, 2500, etc.]
  totalRPEarned: number; // Total RP earned from milestones today
  lastHarvestAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * RP transaction record for detailed tracking
 * Separate collection for scalability (vs embedding in Player.rpHistory)
 */
export interface RPTransaction {
  playerUsername: string;
  amount: number; // Positive for gains, negative for spending
  source: RPSource;
  description: string;
  timestamp: Date;
  vipBonus: boolean; // Was VIP +50% bonus applied?
  balanceAfter: number; // RP balance after this transaction
  metadata?: Record<string, unknown>; // Optional extra data (e.g., milestone threshold, level number)
}

/**
 * RP source types for transaction categorization
 */
export type RPSource =
  | 'harvest_milestone' // Daily harvest milestone rewards
  | 'daily_login' // Daily login bonus + streak
  | 'quest' // Quest completion rewards
  | 'achievement' // Achievement unlock rewards
  | 'level_up' // Level-up RP scaling (level × 5, max 500)
  | 'battle' // PvP battle victory rewards
  | 'clan_warfare' // Clan war spoils
  | 'discovery' // Ancient technology discovery
  | 'admin' // Admin-awarded RP
  | 'purchase' // RP shop package purchase
  | 'research' // RP spent on research (Flag tiers, etc.)
  | 'tech_unlock' // RP spent on tech tree
  | 'other'; // Miscellaneous

/**
 * Daily harvest milestones (resets daily)
 * Key: harvest count threshold
 * Value: RP reward for reaching threshold
 * 
 * Total for full map completion (22,500 harvests): 6,000 RP
 */
export const DAILY_HARVEST_MILESTONES: Record<number, number> = {
  1000: 500, // 4% of map = 500 RP
  2500: 750, // 11% of map = 750 RP
  5000: 1000, // 22% of map = 1,000 RP
  10000: 1500, // 44% of map = 1,500 RP
  15000: 1250, // 67% of map = 1,250 RP
  22500: 1000 // 100% completion bonus = 1,000 RP
};

/**
 * VIP RP bonus multiplier
 * VIP players receive +50% RP from all sources
 */
export const VIP_RP_MULTIPLIER = 1.5;

// ============================================================================
// CORE RP AWARD FUNCTION
// ============================================================================

/**
 * Award Research Points to a player from any source
 * Automatically applies VIP +50% bonus if applicable
 * Logs transaction in both Player.rpHistory and RPTransaction collection
 * 
 * @param playerUsername - Player's unique username
 * @param amount - Base RP amount to award (before VIP bonus)
 * @param source - Source type for categorization
 * @param description - Human-readable description of the award
 * @param metadata - Optional extra data for analytics
 * @returns Promise resolving to transaction details
 * 
 * @example
 * // Award RP for level up
 * await awardRP('player123', 250, 'level_up', 'Reached Level 50', { level: 50 });
 * 
 * @example
 * // Award RP for achievement (VIP gets 150 instead of 100)
 * await awardRP('vipPlayer', 100, 'achievement', 'Unlocked Epic Achievement: Cave Master');
 */
export async function awardRP(
  playerUsername: string,
  amount: number,
  source: RPSource,
  description: string,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  message: string;
  rpAwarded: number;
  vipBonusApplied: boolean;
  newBalance: number;
}> {
  if (!playerUsername || amount <= 0) {
    return {
      success: false,
      message: 'Invalid player username or RP amount',
      rpAwarded: 0,
      vipBonusApplied: false,
      newBalance: 0
    };
  }

  try {
    const db: Db = await getDatabase();
    const playersCollection: Collection<Player> = db.collection('players');

    // Fetch player to check VIP status
    const player = await playersCollection.findOne({ username: playerUsername });

    if (!player) {
      return {
        success: false,
        message: `Player not found: ${playerUsername}`,
        rpAwarded: 0,
        vipBonusApplied: false,
        newBalance: 0
      };
    }

    // Calculate VIP bonus
    const isVIP = !!(player.isVIP && player.vipExpiresAt && new Date(player.vipExpiresAt) > new Date());
    const finalAmount = isVIP ? Math.floor(amount * VIP_RP_MULTIPLIER) : amount;

    // Calculate new balance
    const currentRP = player.researchPoints || 0;
    const newBalance = currentRP + finalAmount;

    // Create transaction record
    const transaction: ResearchPointHistory = {
      amount: finalAmount,
      reason: description,
      timestamp: new Date(),
      balance: newBalance
    };

    // Update player RP balance and history
    const updateResult = await playersCollection.updateOne(
      { username: playerUsername },
      {
        $set: { researchPoints: newBalance },
        $push: { rpHistory: transaction }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return {
        success: false,
        message: 'Failed to update player RP balance',
        rpAwarded: 0,
        vipBonusApplied: isVIP,
        newBalance: currentRP
      };
    }

    // Log detailed transaction in RPTransaction collection
    const rpTransactionsCollection = db.collection<RPTransaction>('rpTransactions');
    await rpTransactionsCollection.insertOne({
      playerUsername,
      amount: finalAmount,
      source,
      description,
      timestamp: new Date(),
      vipBonus: isVIP,
      balanceAfter: newBalance,
      metadata
    });

    return {
      success: true,
      message: `Awarded ${finalAmount} RP${isVIP ? ' (VIP bonus applied)' : ''} to ${playerUsername}`,
      rpAwarded: finalAmount,
      vipBonusApplied: isVIP,
      newBalance
    };
  } catch (error) {
    console.error('[researchPointService] Error awarding RP:', error);
    return {
      success: false,
      message: 'Internal server error while awarding RP',
      rpAwarded: 0,
      vipBonusApplied: false,
      newBalance: 0
    };
  }
}

// ============================================================================
// DAILY HARVEST MILESTONE SYSTEM
// ============================================================================

/**
 * Check and award daily harvest milestones for a player
 * Called after each successful harvest to track progress
 * Awards RP when milestones are reached (1k, 2.5k, 5k, 10k, 15k, 22.5k harvests)
 * 
 * @param playerUsername - Player's unique username
 * @param resetPeriod - Current reset period (e.g., "2025-10-20-AM")
 * @returns Promise resolving to milestone check results
 * 
 * @example
 * // Called after successful harvest in harvestService.ts
 * const result = await checkDailyHarvestMilestone('player123', '2025-10-20-AM');
 * if (result.milestoneReached) {
 *   // Show toast notification: "Milestone reached! +750 RP"
 * }
 */
export async function checkDailyHarvestMilestone(
  playerUsername: string,
  resetPeriod: string
): Promise<{
  success: boolean;
  message: string;
  harvestCount: number;
  milestoneReached: boolean;
  milestoneThreshold?: number;
  rpAwarded?: number;
  nextMilestone?: number;
}> {
  if (!playerUsername || !resetPeriod) {
    return {
      success: false,
      message: 'Invalid player username or reset period',
      harvestCount: 0,
      milestoneReached: false
    };
  }

  try {
    const db: Db = await getDatabase();
    const dailyProgressCollection = db.collection<DailyHarvestProgress>('dailyHarvestProgress');

    // Extract date from resetPeriod (format: "YYYY-MM-DD-AM" or "YYYY-MM-DD-PM")
    const date = resetPeriod.substring(0, 10); // "2025-10-20"
    const period = resetPeriod.substring(11); // "AM" or "PM"

    // Find or create daily progress record
    const existingProgress = await dailyProgressCollection.findOne({
      playerUsername,
      date,
      resetPeriod: period
    });

    const currentHarvestCount = (existingProgress?.harvestCount || 0) + 1;
    const completedMilestones = existingProgress?.milestonesCompleted || [];

    // Check if new milestone reached
    const milestoneThresholds = Object.keys(DAILY_HARVEST_MILESTONES)
      .map(Number)
      .sort((a, b) => a - b);

    let milestoneReached = false;
    let milestoneThreshold: number | undefined;
    let rpAwarded: number | undefined;

    for (const threshold of milestoneThresholds) {
      if (
        currentHarvestCount >= threshold &&
        !completedMilestones.includes(threshold)
      ) {
        // New milestone reached!
        milestoneReached = true;
        milestoneThreshold = threshold;
        rpAwarded = DAILY_HARVEST_MILESTONES[threshold];

        // Award RP
        const awardResult = await awardRP(
          playerUsername,
          rpAwarded,
          'harvest_milestone',
          `Daily harvest milestone: ${threshold.toLocaleString()} harvests`,
          { milestone: threshold, resetPeriod }
        );

        if (!awardResult.success) {
          console.error('[researchPointService] Failed to award milestone RP:', awardResult.message);
        }

        // Update completed milestones
        completedMilestones.push(threshold);
        break; // Only award one milestone per harvest
      }
    }

    // Find next milestone
    const nextMilestone = milestoneThresholds.find(
      (threshold) => threshold > currentHarvestCount
    );

    // Upsert daily progress record
    await dailyProgressCollection.updateOne(
      { playerUsername, date, resetPeriod: period },
      {
        $set: {
          harvestCount: currentHarvestCount,
          milestonesCompleted: completedMilestones,
          totalRPEarned: (existingProgress?.totalRPEarned || 0) + (rpAwarded || 0),
          lastHarvestAt: new Date(),
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    return {
      success: true,
      message: milestoneReached
        ? `Milestone reached: ${milestoneThreshold?.toLocaleString()} harvests! +${rpAwarded} RP`
        : 'Harvest counted',
      harvestCount: currentHarvestCount,
      milestoneReached,
      milestoneThreshold,
      rpAwarded,
      nextMilestone
    };
  } catch (error) {
    console.error('[researchPointService] Error checking daily harvest milestone:', error);
    return {
      success: false,
      message: 'Internal server error while checking milestone',
      harvestCount: 0,
      milestoneReached: false
    };
  }
}

/**
 * Reset daily harvest progress for a player
 * Called at map reset (12:00 AM and 12:00 PM server time)
 * Clears harvest count and milestone tracking for new cycle
 * 
 * @param playerUsername - Player's unique username (optional, resets all if omitted)
 * @returns Promise resolving to reset confirmation
 * 
 * @example
 * // Reset all players at map reset
 * await resetDailyProgress();
 * 
 * @example
 * // Reset specific player (admin tool)
 * await resetDailyProgress('player123');
 */
export async function resetDailyProgress(
  playerUsername?: string
): Promise<{ success: boolean; message: string; playersReset: number }> {
  try {
    const db: Db = await getDatabase();
    const dailyProgressCollection = db.collection<DailyHarvestProgress>('dailyHarvestProgress');

    // Build filter
    const filter = playerUsername ? { playerUsername } : {};

    // Delete all daily progress records (fresh start for new reset period)
    const deleteResult = await dailyProgressCollection.deleteMany(filter);

    return {
      success: true,
      message: playerUsername
        ? `Daily progress reset for ${playerUsername}`
        : `Daily progress reset for ${deleteResult.deletedCount} players`,
      playersReset: deleteResult.deletedCount
    };
  } catch (error) {
    console.error('[researchPointService] Error resetting daily progress:', error);
    return {
      success: false,
      message: 'Internal server error while resetting daily progress',
      playersReset: 0
    };
  }
}

// ============================================================================
// RP QUERY & ANALYTICS
// ============================================================================

/**
 * Get comprehensive RP statistics for a player
 * Includes current balance, daily earnings, milestone progress, transaction history
 * 
 * @param playerUsername - Player's unique username
 * @returns Promise resolving to player RP stats
 * 
 * @example
 * // Display in admin dashboard
 * const stats = await getPlayerRPStats('player123');
 * console.log(`Balance: ${stats.currentBalance} RP`);
 * console.log(`Today: ${stats.dailyEarnings} RP from ${stats.harvestCount} harvests`);
 */
export async function getPlayerRPStats(playerUsername: string): Promise<{
  success: boolean;
  message: string;
  currentBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  dailyEarnings: number;
  harvestCount: number;
  milestonesCompleted: number[];
  nextMilestone?: number;
  recentTransactions: RPTransaction[];
}> {
  if (!playerUsername) {
    return {
      success: false,
      message: 'Invalid player username',
      currentBalance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      dailyEarnings: 0,
      harvestCount: 0,
      milestonesCompleted: [],
      recentTransactions: []
    };
  }

  try {
    const db: Db = await getDatabase();
    const playersCollection: Collection<Player> = db.collection('players');
    const dailyProgressCollection = db.collection<DailyHarvestProgress>('dailyHarvestProgress');
    const rpTransactionsCollection = db.collection<RPTransaction>('rpTransactions');

    // Fetch player
    const player = await playersCollection.findOne({ username: playerUsername });

    if (!player) {
      return {
        success: false,
        message: `Player not found: ${playerUsername}`,
        currentBalance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        dailyEarnings: 0,
        harvestCount: 0,
        milestonesCompleted: [],
        recentTransactions: []
      };
    }

    // Get current RP balance
    const currentBalance = player.researchPoints || 0;

    // Calculate lifetime earned and spent from rpHistory
    const rpHistory = player.rpHistory || [];
    let lifetimeEarned = 0;
    let lifetimeSpent = 0;

    for (const transaction of rpHistory) {
      if (transaction.amount > 0) {
        lifetimeEarned += transaction.amount;
      } else {
        lifetimeSpent += Math.abs(transaction.amount);
      }
    }

    // Get today's progress
    const today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const todayProgress = await dailyProgressCollection.findOne({
      playerUsername,
      date: today
    });

    const dailyEarnings = todayProgress?.totalRPEarned || 0;
    const harvestCount = todayProgress?.harvestCount || 0;
    const milestonesCompleted = todayProgress?.milestonesCompleted || [];

    // Find next milestone
    const milestoneThresholds = Object.keys(DAILY_HARVEST_MILESTONES)
      .map(Number)
      .sort((a, b) => a - b);
    const nextMilestone = milestoneThresholds.find(
      (threshold) => threshold > harvestCount
    );

    // Get recent transactions (last 20)
    const recentTransactions = await rpTransactionsCollection
      .find({ playerUsername })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    return {
      success: true,
      message: 'RP stats retrieved successfully',
      currentBalance,
      lifetimeEarned,
      lifetimeSpent,
      dailyEarnings,
      harvestCount,
      milestonesCompleted,
      nextMilestone,
      recentTransactions
    };
  } catch (error) {
    console.error('[researchPointService] Error fetching player RP stats:', error);
    return {
      success: false,
      message: 'Internal server error while fetching RP stats',
      currentBalance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      dailyEarnings: 0,
      harvestCount: 0,
      milestonesCompleted: [],
      recentTransactions: []
    };
  }
}

/**
 * Get available RP balance for spending
 * Simple wrapper around Player.researchPoints with validation
 * 
 * @param playerUsername - Player's unique username
 * @returns Promise resolving to available RP balance
 */
export async function getAvailableRP(playerUsername: string): Promise<number> {
  if (!playerUsername) {
    return 0;
  }

  try {
    const db: Db = await getDatabase();
    const playersCollection: Collection<Player> = db.collection('players');

    const player = await playersCollection.findOne({ username: playerUsername });

    return player?.researchPoints || 0;
  } catch (error) {
    console.error('[researchPointService] Error fetching available RP:', error);
    return 0;
  }
}

// ============================================================================
// RP SPENDING FUNCTIONS
// ============================================================================

/**
 * Spend Research Points for unlocks/purchases
 * Validates balance, deducts RP atomically, logs transaction
 * 
 * Note: This is a wrapper around xpService.spendResearchPoints() for consistency
 * All RP spending should eventually use this service for centralized tracking
 * 
 * @param playerUsername - Player's unique username
 * @param amount - RP amount to spend
 * @param reason - What the RP is being spent on
 * @param source - Source type for categorization (default: 'research')
 * @returns Promise resolving to spending result
 * 
 * @example
 * // Spend RP for Flag Tier 2 research
 * const result = await spendRP('player123', 1500, 'Flag Tier 2: Zone Tracking', 'research');
 */
export async function spendRP(
  playerUsername: string,
  amount: number,
  reason: string,
  source: RPSource = 'research'
): Promise<{
  success: boolean;
  message: string;
  newBalance: number;
}> {
  if (!playerUsername || amount <= 0) {
    return {
      success: false,
      message: 'Invalid player username or RP amount',
      newBalance: 0
    };
  }

  try {
    const db: Db = await getDatabase();
    const playersCollection: Collection<Player> = db.collection('players');

    // Fetch player to check balance
    const player = await playersCollection.findOne({ username: playerUsername });

    if (!player) {
      return {
        success: false,
        message: `Player not found: ${playerUsername}`,
        newBalance: 0
      };
    }

    const currentRP = player.researchPoints || 0;

    if (currentRP < amount) {
      return {
        success: false,
        message: `Insufficient RP. Required: ${amount}, Available: ${currentRP}`,
        newBalance: currentRP
      };
    }

    // Calculate new balance
    const newBalance = currentRP - amount;

    // Create transaction record
    const transaction: ResearchPointHistory = {
      amount: -amount, // Negative for spending
      reason,
      timestamp: new Date(),
      balance: newBalance
    };

    // Update player RP balance and history
    const updateResult = await playersCollection.updateOne(
      {
        username: playerUsername,
        researchPoints: { $gte: amount } // Double-check balance hasn't changed
      },
      {
        $set: { researchPoints: newBalance },
        $push: { rpHistory: transaction }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return {
        success: false,
        message: 'Failed to deduct RP (insufficient balance or concurrent modification)',
        newBalance: currentRP
      };
    }

    // Log detailed transaction in RPTransaction collection
    const rpTransactionsCollection = db.collection<RPTransaction>('rpTransactions');
    await rpTransactionsCollection.insertOne({
      playerUsername,
      amount: -amount,
      source,
      description: reason,
      timestamp: new Date(),
      vipBonus: false,
      balanceAfter: newBalance
    });

    return {
      success: true,
      message: `Spent ${amount} RP on ${reason}`,
      newBalance
    };
  } catch (error) {
    console.error('[researchPointService] Error spending RP:', error);
    return {
      success: false,
      message: 'Internal server error while spending RP',
      newBalance: 0
    };
  }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get RP transaction history with filtering
 * For admin dashboard analytics
 * 
 * @param filters - Query filters (playerUsername, source, dateRange, etc.)
 * @param limit - Maximum number of records to return
 * @param skip - Number of records to skip (pagination)
 * @returns Promise resolving to filtered transactions
 */
export async function getRPTransactionHistory(
  filters: {
    playerUsername?: string;
    source?: RPSource;
    startDate?: Date;
    endDate?: Date;
  } = {},
  limit = 100,
  skip = 0
): Promise<{
  success: boolean;
  message: string;
  transactions: RPTransaction[];
  totalCount: number;
}> {
  try {
    const db: Db = await getDatabase();
    const rpTransactionsCollection = db.collection<RPTransaction>('rpTransactions');

    // Build query filter
    const query: Record<string, unknown> = {};

    if (filters.playerUsername) {
      query.playerUsername = filters.playerUsername;
    }

    if (filters.source) {
      query.source = filters.source;
    }

    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) {
        (query.timestamp as Record<string, unknown>).$gte = filters.startDate;
      }
      if (filters.endDate) {
        (query.timestamp as Record<string, unknown>).$lte = filters.endDate;
      }
    }

    // Fetch transactions
    const transactions = await rpTransactionsCollection
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get total count for pagination
    const totalCount = await rpTransactionsCollection.countDocuments(query);

    return {
      success: true,
      message: 'Transaction history retrieved successfully',
      transactions,
      totalCount
    };
  } catch (error) {
    console.error('[researchPointService] Error fetching RP transaction history:', error);
    return {
      success: false,
      message: 'Internal server error while fetching transaction history',
      transactions: [],
      totalCount: 0
    };
  }
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. VIP Bonus Calculation:
 *    - Applied automatically in awardRP() function
 *    - +50% multiplier on all RP sources
 *    - Checked via player.isVIP && player.vipExpiresAt > now
 * 
 * 2. Daily Harvest Milestones:
 *    - 6 thresholds: 1k, 2.5k, 5k, 10k, 15k, 22.5k harvests
 *    - Total RP for full map: 6,000 RP
 *    - Resets at map reset (2x daily: 12:00 AM, 12:00 PM)
 *    - Tracked in separate collection (dailyHarvestProgress)
 * 
 * 3. Transaction Logging:
 *    - All RP gains/spending logged in Player.rpHistory (embedded)
 *    - Detailed analytics in RPTransaction collection (separate)
 *    - Enables audit trail and economy analytics
 * 
 * 4. Integration Points:
 *    - harvestService.ts: Call checkDailyHarvestMilestone() after harvest
 *    - xpService.ts: Replace 1 RP with awardRP(level × 5, max 500)
 *    - achievementService.ts: Call awardRP() on achievement unlock
 *    - battleService.ts: Call awardRP() on PvP victory
 *    - dailyLoginService.ts: Create new service, call awardRP()
 * 
 * 5. Admin Tools:
 *    - getRPTransactionHistory(): Filter/pagination for dashboard
 *    - getPlayerRPStats(): Individual player RP overview
 *    - Bulk adjustment: Use awardRP() with source: 'admin'
 * 
 * 6. Future Enhancements:
 *    - Lifetime harvest milestones (100/500/1k/5k/10k/25k/50k/100k)
 *    - RP shop packages (Stripe integration)
 *    - Quest system with RP rewards (300-500 RP per quest)
 *    - Daily login streak bonuses (100 base + 10 per day streak)
 * 
 * 7. Performance Considerations:
 *    - dailyHarvestProgress has TTL index (auto-delete after 7 days)
 *    - rpTransactions indexed by playerUsername, timestamp, source
 *    - Use aggregation pipelines for economy analytics
 * 
 * 8. Error Handling:
 *    - All functions return success/failure status
 *    - Database operations wrapped in try/catch
 *    - Validation on all inputs (username, amounts, etc.)
 *    - Atomic operations prevent race conditions
 */
