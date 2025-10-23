/**
 * @fileoverview Bounty Board Service - Daily bot defeat challenges with progressive rewards
 * @module lib/bountyBoardService
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * The Bounty Board provides players with daily challenges to defeat specific bot types/tiers.
 * - 3 bounties per day: Easy (25k), Medium (50k), Hard (100k rewards)
 * - Auto-refreshes at midnight UTC
 * - Tracks completion per player
 * - Rewards metal + energy on claim
 * - Integrated with bot reputation system
 * 
 * Features:
 * - Random bounty generation based on bot tiers and specializations
 * - Progressive difficulty: Tier 1-2 (easy), 3-4 (medium), 5-6 (hard)
 * - Completion tracking with defeat count validation
 * - Daily reset mechanism at midnight UTC
 * - Unclaimed reward handling (expires at reset)
 */

import { Db, ObjectId } from 'mongodb';
import clientPromise from './mongodb';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Bounty difficulty tier with associated rewards
 */
export type BountyDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Bot specializations available for bounties
 */
export type BountySpecialization = 'Hoarder' | 'Fortress' | 'Raider' | 'Balanced' | 'Ghost';

/**
 * Individual bounty structure
 */
export interface Bounty {
  id: string;                          // Unique bounty ID
  difficulty: BountyDifficulty;        // Difficulty tier
  specialization: BountySpecialization; // Required bot type
  tier: number;                        // Required bot tier
  defeatsRequired: number;             // Number of bots to defeat
  currentDefeats: number;              // Progress counter
  metalReward: number;                 // Metal earned on completion
  energyReward: number;                // Energy earned on completion
  completed: boolean;                  // Completion status
  claimed: boolean;                    // Reward claim status
}

/**
 * Player's daily bounty state
 */
export interface PlayerBounties {
  bounties: Bounty[];       // Today's active bounties
  lastRefresh: Date;        // Last reset timestamp
  unclaimedRewards: number; // Count of completed but unclaimed bounties
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Bounty system configuration constants
 */
const BOUNTY_CONFIG = {
  BOUNTIES_PER_DAY: 3,
  EASY: {
    minTier: 1,
    maxTier: 2,
    defeatsRequired: 3,
    metalReward: 25000,
    energyReward: 15000,
  },
  MEDIUM: {
    minTier: 3,
    maxTier: 4,
    defeatsRequired: 5,
    metalReward: 50000,
    energyReward: 30000,
  },
  HARD: {
    minTier: 5,
    maxTier: 6,
    defeatsRequired: 3,
    metalReward: 100000,
    energyReward: 60000,
  },
} as const;

const SPECIALIZATIONS: BountySpecialization[] = ['Hoarder', 'Fortress', 'Raider', 'Balanced', 'Ghost'];

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Get MongoDB database connection
 */
async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db('game');
}

// ============================================================================
// BOUNTY GENERATION
// ============================================================================

/**
 * Generates a random bounty for the specified difficulty
 * @param difficulty - Bounty difficulty tier
 * @returns Newly generated bounty
 */
function generateBounty(difficulty: BountyDifficulty): Bounty {
  const config = BOUNTY_CONFIG[difficulty.toUpperCase() as 'EASY' | 'MEDIUM' | 'HARD'];
  
  // Random tier within difficulty range
  const tier = Math.floor(Math.random() * (config.maxTier - config.minTier + 1)) + config.minTier;
  
  // Random specialization
  const specialization = SPECIALIZATIONS[Math.floor(Math.random() * SPECIALIZATIONS.length)];
  
  return {
    id: `bounty-${difficulty}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    difficulty,
    specialization,
    tier,
    defeatsRequired: config.defeatsRequired,
    currentDefeats: 0,
    metalReward: config.metalReward,
    energyReward: config.energyReward,
    completed: false,
    claimed: false,
  };
}

/**
 * Generates full set of daily bounties (easy, medium, hard)
 * @returns Array of 3 bounties
 */
function generateDailyBounties(): Bounty[] {
  return [
    generateBounty('easy'),
    generateBounty('medium'),
    generateBounty('hard'),
  ];
}

// ============================================================================
// RESET & REFRESH LOGIC
// ============================================================================

/**
 * Checks if bounties need to be refreshed (new day)
 * @param lastRefresh - Last refresh timestamp
 * @returns True if refresh needed
 */
function needsRefresh(lastRefresh: Date | null): boolean {
  if (!lastRefresh) return true;
  
  const now = new Date();
  const last = new Date(lastRefresh);
  
  // Check if dates are different (midnight crossed)
  return now.toISOString().split('T')[0] !== last.toISOString().split('T')[0];
}

/**
 * Refreshes player's bounties if needed
 * @param db - Database connection
 * @param username - Player username
 * @returns Updated player bounties or null if no refresh needed
 */
async function refreshBountiesIfNeeded(db: Db, username: string): Promise<PlayerBounties | null> {
  const player = await db.collection('players').findOne({ username });
  
  if (!player) {
    throw new Error('Player not found');
  }
  
  const currentBounties = player.dailyBounties as PlayerBounties | undefined;
  
  // Check if refresh needed
  if (!needsRefresh(currentBounties?.lastRefresh || null)) {
    return null; // No refresh needed
  }
  
  // Generate new bounties
  const newBounties: PlayerBounties = {
    bounties: generateDailyBounties(),
    lastRefresh: new Date(),
    unclaimedRewards: 0,
  };
  
  // Update player
  await db.collection('players').updateOne(
    { username },
    { $set: { dailyBounties: newBounties } }
  );
  
  return newBounties;
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Records a bot defeat and updates bounty progress
 * @param db - Database connection
 * @param username - Player username
 * @param botSpecialization - Defeated bot's specialization
 * @param botTier - Defeated bot's tier
 * @returns Updated bounties with completion status
 */
export async function recordBotDefeat(
  db: Db,
  username: string,
  botSpecialization: BountySpecialization,
  botTier: number
): Promise<{ updated: boolean; completedBounties: string[] }> {
  // Ensure bounties are fresh
  await refreshBountiesIfNeeded(db, username);
  
  const player = await db.collection('players').findOne({ username });
  if (!player || !player.dailyBounties) {
    return { updated: false, completedBounties: [] };
  }
  
  const bounties = player.dailyBounties.bounties as Bounty[];
  let updated = false;
  const completedBounties: string[] = [];
  
  // Update matching bounties
  for (const bounty of bounties) {
    if (
      !bounty.completed &&
      bounty.specialization === botSpecialization &&
      bounty.tier === botTier
    ) {
      bounty.currentDefeats++;
      updated = true;
      
      // Check if bounty completed
      if (bounty.currentDefeats >= bounty.defeatsRequired) {
        bounty.completed = true;
        completedBounties.push(bounty.id);
      }
    }
  }
  
  // Save if any updates made
  if (updated) {
    const unclaimedRewards = bounties.filter(b => b.completed && !b.claimed).length;
    
    await db.collection('players').updateOne(
      { username },
      {
        $set: {
          'dailyBounties.bounties': bounties,
          'dailyBounties.unclaimedRewards': unclaimedRewards,
        },
      }
    );
  }
  
  return { updated, completedBounties };
}

// ============================================================================
// REWARD CLAIMING
// ============================================================================

/**
 * Claims rewards for a completed bounty
 * @param username - Player username
 * @param bountyId - Bounty ID to claim
 * @returns Claim result with rewards granted
 */
export async function claimBountyReward(
  username: string,
  bountyId: string
): Promise<{ success: boolean; message: string; metalGained?: number; energyGained?: number }> {
  const db = await getDb();
  
  const player = await db.collection('players').findOne({ username });
  if (!player || !player.dailyBounties) {
    return { success: false, message: 'No bounties found' };
  }
  
  const bounties = player.dailyBounties.bounties as Bounty[];
  const bounty = bounties.find(b => b.id === bountyId);
  
  if (!bounty) {
    return { success: false, message: 'Bounty not found' };
  }
  
  if (!bounty.completed) {
    return { success: false, message: 'Bounty not completed yet' };
  }
  
  if (bounty.claimed) {
    return { success: false, message: 'Reward already claimed' };
  }
  
  // Mark as claimed and grant rewards
  bounty.claimed = true;
  const unclaimedRewards = bounties.filter(b => b.completed && !b.claimed).length;
  
  await db.collection('players').updateOne(
    { username },
    {
      $set: {
        'dailyBounties.bounties': bounties,
        'dailyBounties.unclaimedRewards': unclaimedRewards,
      },
      $inc: {
        'resources.metal': bounty.metalReward,
        'resources.energy': bounty.energyReward,
      },
    }
  );
  
  return {
    success: true,
    message: 'Reward claimed successfully!',
    metalGained: bounty.metalReward,
    energyGained: bounty.energyReward,
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Gets player's current bounties (auto-refreshes if needed)
 * @param username - Player username
 * @returns Current bounty board state
 */
export async function getBounties(username: string): Promise<PlayerBounties> {
  const db = await getDb();
  
  // Auto-refresh if needed
  const refreshed = await refreshBountiesIfNeeded(db, username);
  if (refreshed) {
    return refreshed;
  }
  
  // Return existing bounties
  const player = await db.collection('players').findOne({ username });
  if (!player || !player.dailyBounties) {
    // Initialize if missing
    const newBounties: PlayerBounties = {
      bounties: generateDailyBounties(),
      lastRefresh: new Date(),
      unclaimedRewards: 0,
    };
    
    await db.collection('players').updateOne(
      { username },
      { $set: { dailyBounties: newBounties } }
    );
    
    return newBounties;
  }
  
  return player.dailyBounties as PlayerBounties;
}

/**
 * Gets bounty board statistics for a player
 * @param username - Player username
 * @returns Bounty statistics
 */
export async function getBountyStats(username: string): Promise<{
  totalCompleted: number;
  totalClaimed: number;
  unclaimedRewards: number;
  nextRefresh: Date;
}> {
  const bounties = await getBounties(username);
  
  const totalCompleted = bounties.bounties.filter(b => b.completed).length;
  const totalClaimed = bounties.bounties.filter(b => b.claimed).length;
  
  // Calculate next midnight UTC
  const nextRefresh = new Date();
  nextRefresh.setUTCHours(24, 0, 0, 0);
  
  return {
    totalCompleted,
    totalClaimed,
    unclaimedRewards: bounties.unclaimedRewards,
    nextRefresh,
  };
}

/**
 * Formats time remaining until next bounty refresh
 * @param nextRefresh - Next refresh timestamp
 * @returns Formatted time string
 */
export function formatTimeUntilRefresh(nextRefresh: Date): string {
  const now = new Date();
  const diff = nextRefresh.getTime() - now.getTime();
  
  if (diff <= 0) return 'Refreshing...';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * INTEGRATION POINTS:
 * - Call recordBotDefeat() from combat service after bot defeats
 * - Bounties auto-refresh at midnight UTC
 * - Requires dailyBounties field in Player type
 * - Rewards granted on claim, not completion
 * 
 * FUTURE ENHANCEMENTS:
 * - Weekly/monthly bounty quests
 * - Legendary bounties for rare bots
 * - Bounty chains (complete all 3 for bonus)
 * - Reputation-based bounty tiers
 * - Bounty history tracking
 */
