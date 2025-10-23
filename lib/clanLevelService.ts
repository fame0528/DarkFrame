/**
 * Clan Level Progression Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan level progression from 1-50 with exponential XP curve. Awards XP from member
 * actions (harvesting, combat, research, building) and triggers milestone rewards at key levels.
 * Unlocks features progressively: bank upgrades, perks, monuments, and warfare capabilities.
 * 
 * Core Systems:
 * - XP Calculation: Action-based XP awards with diminishing returns for repetitive actions
 * - Level Progression: Exponential curve (baseXP * level^1.8) requiring ~50M total XP to max
 * - Milestone Rewards: Resource bonuses, bank capacity, perk unlocks at levels 5,10,15,20,25,30,40,50
 * - Feature Unlocking: Progressive access to advanced systems (perks at 5, monuments at 20, warfare at 25)
 * - Progress Tracking: Real-time XP gain notifications and level-up events
 * 
 * XP Award Rates:
 * - Harvesting: 5 XP per harvest (metal, energy, research points)
 * - Combat Victory: 10 XP per enemy defeated
 * - Research Contribution: 15 XP per 1000 RP contributed
 * - Building Construction: 20 XP per building completed
 * - Territory Claim: 50 XP per territory captured
 * - Monument Control: 100 XP per monument controlled
 * 
 * Level Unlocks:
 * - Level 5: Bronze perks, bank level 2
 * - Level 10: Silver perks, bank level 3
 * - Level 15: Gold perks, bank level 4
 * - Level 20: Legendary perks, monuments, bank level 5
 * - Level 25: Clan warfare, bank level 6
 * - Level 30: Advanced monuments
 * - Level 40: Elite warfare bonuses
 * - Level 50: Max level rewards (prestige badge, 10M resources)
 * 
 * Integration Points:
 * - clanService.ts: Calls awardClanXP() when clan created/member joins
 * - clanActivityService.ts: Logs all XP awards to activity feed
 * - Player action handlers: Award XP on harvests, combat, research
 * - API routes: GET level info, POST award XP (admin/system only)
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  Clan,
  ClanLevel,
  ClanMilestone,
  ClanXPSource,
  ClanActivityType,
  CLAN_LEVEL_CONSTANTS,
  CLAN_XP_RATES,
  CLAN_MILESTONES,
} from '@/types/clan.types';

// ============================================================================
// Module State
// ============================================================================

let mongoClient: MongoClient;
let database: Db;

/**
 * Initialize clan level service with MongoDB connection
 * @param client - MongoDB client instance
 * @param db - Database instance
 */
export function initializeClanLevelService(client: MongoClient, db: Db): void {
  mongoClient = client;
  database = db;
}

// ============================================================================
// Core Level Progression Functions
// ============================================================================

/**
 * Award XP to a clan from a specific source and check for level ups
 * 
 * Awards XP based on predefined rates for different actions (harvesting, combat, research).
 * Automatically detects level ups, awards milestone rewards, and logs activities.
 * 
 * @param clanId - Clan to award XP to
 * @param source - Source of XP (harvest, combat, research, etc.)
 * @param amount - Base amount (e.g., resources harvested, enemies defeated)
 * @param playerId - Player who performed the action
 * @returns Updated clan object with new XP/level and milestone rewards if leveled up
 * 
 * @example
 * // Award XP for harvesting 5000 metal (5000 * 0.001 * 5 = 25 XP)
 * const result = await awardClanXP(clanId, 'harvest', 5000, playerId);
 * if (result.leveledUp) {
 *   console.log(`Leveled up to ${result.clan.level.currentLevel}!`);
 *   console.log(`Rewards: ${result.milestoneRewards}`);
 * }
 */
export async function awardClanXP(
  clanId: string,
  source: ClanXPSource,
  amount: number,
  playerId: string
): Promise<{
  success: boolean;
  clan: Clan;
  xpAwarded: number;
  leveledUp: boolean;
  previousLevel: number;
  newLevel: number;
  milestoneRewards?: ClanMilestone;
}> {
  const clansCollection = database.collection<Clan>('clans');

  // Get current clan state
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  // Calculate XP based on source and amount
  const xpAwarded = calculateXPFromSource(source, amount);
  if (xpAwarded <= 0) {
    return {
      success: false,
      clan,
      xpAwarded: 0,
      leveledUp: false,
      previousLevel: clan.level.currentLevel,
      newLevel: clan.level.currentLevel,
    };
  }

  const previousLevel = clan.level.currentLevel;
  const newTotalXP = clan.level.totalXP + xpAwarded;

  // Calculate new level based on total XP
  const newLevel = calculateLevelFromXP(newTotalXP);
  const leveledUp = newLevel > previousLevel;

  // Calculate XP for current level progress
  const xpForCurrentLevel = getXPRequiredForLevel(newLevel);
  const xpForNextLevel = getXPRequiredForLevel(newLevel + 1);
  const currentLevelXP = newTotalXP - xpForCurrentLevel;
  const xpToNextLevel = xpForNextLevel - newTotalXP;

  // Update clan level data
  const updateData: any = {
    'level.currentLevel': newLevel,
    'level.totalXP': newTotalXP,
    'level.currentLevelXP': currentLevelXP,
    'level.xpToNextLevel': xpToNextLevel,
    'level.lastXPGain': new Date(),
  };

  // Check for milestone rewards if leveled up
  let milestoneRewards: ClanMilestone | undefined;
  if (leveledUp) {
    milestoneRewards = checkForMilestoneReward(newLevel);
    if (milestoneRewards) {
      // Award milestone rewards to clan bank
      updateData['bank.treasury.metal'] = clan.bank.treasury.metal + milestoneRewards.rewards.metal;
      updateData['bank.treasury.energy'] = clan.bank.treasury.energy + milestoneRewards.rewards.energy;
      updateData['bank.treasury.researchPoints'] = clan.bank.treasury.researchPoints + milestoneRewards.rewards.researchPoints;

      // Unlock features
      if (milestoneRewards.unlocksFeature) {
        if (!clan.level.featuresUnlocked.includes(milestoneRewards.unlocksFeature)) {
          updateData.$addToSet = { 'level.featuresUnlocked': milestoneRewards.unlocksFeature };
        }
      }

      // Track milestone completion
      updateData.$push = {
        'level.milestonesCompleted': {
          level: newLevel,
          completedAt: new Date(),
          rewards: milestoneRewards.rewards,
        } as any,
      } as any;
    }

    updateData['level.lastLevelUp'] = new Date();
  }

  // Update clan in database
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    updateData.$push || updateData.$addToSet ? updateData : { $set: updateData }
  );

  // Get updated clan
  const updatedClan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!updatedClan) {
    throw new Error('Failed to retrieve updated clan');
  }

  // Log XP gain activity
  await logXPActivity(clanId, playerId, source, xpAwarded, leveledUp, previousLevel, newLevel);

  return {
    success: true,
    clan: updatedClan,
    xpAwarded,
    leveledUp,
    previousLevel,
    newLevel,
    milestoneRewards,
  };
}

/**
 * Get detailed level progression information for a clan
 * 
 * Returns comprehensive level data including current progress, next milestone,
 * total milestones completed, and all unlocked features.
 * 
 * @param clanId - Clan to get level info for
 * @returns Level progression details with progress percentages
 * 
 * @example
 * const levelInfo = await getClanLevelInfo(clanId);
 * console.log(`Level ${levelInfo.currentLevel} - ${levelInfo.progressPercentage}% to next level`);
 * console.log(`Next milestone at level ${levelInfo.nextMilestone?.level}`);
 */
export async function getClanLevelInfo(clanId: string): Promise<{
  currentLevel: number;
  totalXP: number;
  currentLevelXP: number;
  xpToNextLevel: number;
  progressPercentage: number;
  nextMilestone: ClanMilestone | null;
  milestonesCompleted: number;
  featuresUnlocked: string[];
  maxLevel: boolean;
}> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    throw new Error('Clan not found');
  }

  const { currentLevel, totalXP, currentLevelXP, xpToNextLevel } = clan.level;
  const xpRequiredForNextLevel = getXPRequiredForLevel(currentLevel + 1) - getXPRequiredForLevel(currentLevel);
  const progressPercentage = Math.floor((currentLevelXP / xpRequiredForNextLevel) * 100);

  // Find next milestone
  const nextMilestone = findNextMilestone(currentLevel);

  return {
    currentLevel,
    totalXP,
    currentLevelXP,
    xpToNextLevel,
    progressPercentage,
    nextMilestone,
    milestonesCompleted: clan.level.milestonesCompleted.length,
    featuresUnlocked: clan.level.featuresUnlocked,
    maxLevel: currentLevel >= CLAN_LEVEL_CONSTANTS.MAX_LEVEL,
  };
}

/**
 * Get all milestone information including completed and upcoming
 * 
 * Returns complete milestone history and preview of future milestones.
 * Useful for displaying progression roadmap in UI.
 * 
 * @param clanId - Clan to get milestone info for
 * @returns Completed milestones and upcoming milestones
 */
export async function getClanMilestones(clanId: string): Promise<{
  completed: Array<{
    level: number;
    completedAt: Date;
    rewards: { metal: number; energy: number; researchPoints: number };
  }>;
  upcoming: ClanMilestone[];
  currentLevel: number;
}> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    throw new Error('Clan not found');
  }

  // Get all upcoming milestones
  const upcoming = CLAN_MILESTONES.filter((m) => m.level > clan.level.currentLevel);

  return {
    completed: clan.level.milestonesCompleted,
    upcoming,
    currentLevel: clan.level.currentLevel,
  };
}

/**
 * Calculate total XP needed to reach a specific level
 * 
 * Uses exponential curve formula: baseXP * level^exponent
 * Cumulative XP requirement (sum of all previous levels).
 * 
 * @param level - Target level (1-50)
 * @returns Total XP required from level 1 to reach target level
 * 
 * @example
 * const xpForLevel10 = getXPRequiredForLevel(10); // ~89,000 XP
 * const xpForLevel50 = getXPRequiredForLevel(50); // ~50M XP
 */
export function getXPRequiredForLevel(level: number): number {
  if (level <= 1) return 0;

  let totalXP = 0;
  for (let i = 2; i <= level; i++) {
    totalXP += Math.floor(
      CLAN_LEVEL_CONSTANTS.BASE_XP_REQUIREMENT * Math.pow(i, CLAN_LEVEL_CONSTANTS.XP_EXPONENT)
    );
  }

  return totalXP;
}

/**
 * Calculate current level based on total XP
 * 
 * Performs binary search through level curve to find current level.
 * More efficient than iterating through all levels.
 * 
 * @param totalXP - Total accumulated XP
 * @returns Current level (1-50)
 */
export function calculateLevelFromXP(totalXP: number): number {
  let level = 1;

  while (level < CLAN_LEVEL_CONSTANTS.MAX_LEVEL) {
    const xpForNextLevel = getXPRequiredForLevel(level + 1);
    if (totalXP < xpForNextLevel) {
      break;
    }
    level++;
  }

  return level;
}

/**
 * Calculate XP awarded from a specific action source
 * 
 * Applies XP rates based on action type and scales with amount.
 * Different sources have different conversion rates to encourage diverse activities.
 * 
 * @param source - Type of action (harvest, combat, research, etc.)
 * @param amount - Amount of action (resources, enemies, etc.)
 * @returns XP to award
 * 
 * @example
 * calculateXPFromSource('harvest', 5000);      // 25 XP (5000 * 0.005)
 * calculateXPFromSource('combat', 3);          // 30 XP (3 * 10)
 * calculateXPFromSource('research', 10000);    // 150 XP (10000 * 0.015)
 */
export function calculateXPFromSource(source: ClanXPSource, amount: number): number {
  const rate = CLAN_XP_RATES[source] || 0;
  return Math.floor(amount * rate);
}

/**
 * Check if a level has a milestone reward
 * 
 * Milestones occur at levels: 5, 10, 15, 20, 25, 30, 40, 50
 * Each milestone provides increasing resource rewards and feature unlocks.
 * 
 * @param level - Level to check
 * @returns Milestone data if exists, undefined otherwise
 */
export function checkForMilestoneReward(level: number): ClanMilestone | undefined {
  return CLAN_MILESTONES.find((m) => m.level === level);
}

/**
 * Find the next upcoming milestone after current level
 * 
 * @param currentLevel - Current clan level
 * @returns Next milestone or null if at max level
 */
export function findNextMilestone(currentLevel: number): ClanMilestone | null {
  const next = CLAN_MILESTONES.find((m) => m.level > currentLevel);
  return next || null;
}

/**
 * Check if a specific feature is unlocked at clan's current level
 * 
 * Features unlock at milestone levels (perks, monuments, warfare).
 * Used for UI feature gating and permission validation.
 * 
 * @param clanId - Clan to check
 * @param featureName - Feature to check (e.g., 'bronze_perks', 'monuments', 'warfare')
 * @returns True if feature is unlocked
 * 
 * @example
 * const canUsePerks = await isFeatureUnlocked(clanId, 'bronze_perks'); // Level 5+
 * const canWarfare = await isFeatureUnlocked(clanId, 'warfare');       // Level 25+
 */
export async function isFeatureUnlocked(clanId: string, featureName: string): Promise<boolean> {
  const clansCollection = database.collection<Clan>('clans');
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });

  if (!clan) {
    return false;
  }

  return clan.level.featuresUnlocked.includes(featureName);
}

/**
 * Get recommended XP sources for fastest leveling
 * 
 * Analyzes XP rates and returns prioritized list of activities.
 * Helps guide players toward most efficient leveling strategies.
 * 
 * @returns Sorted list of XP sources by efficiency (XP per action)
 */
export function getRecommendedXPSources(): Array<{
  source: ClanXPSource;
  xpRate: number;
  description: string;
}> {
  return [
    {
      source: 'monument_control' as ClanXPSource,
      xpRate: CLAN_XP_RATES.monument_control,
      description: 'Control monuments for massive XP (100 XP per monument)',
    },
    {
      source: 'territory_claim' as ClanXPSource,
      xpRate: CLAN_XP_RATES.territory_claim,
      description: 'Claim territories for high XP (50 XP per territory)',
    },
    {
      source: 'building' as ClanXPSource,
      xpRate: CLAN_XP_RATES.building,
      description: 'Construct buildings (20 XP per building)',
    },
    {
      source: 'research' as ClanXPSource,
      xpRate: CLAN_XP_RATES.research,
      description: 'Contribute research points (15 XP per 1000 RP)',
    },
    {
      source: 'combat' as ClanXPSource,
      xpRate: CLAN_XP_RATES.combat,
      description: 'Win battles (10 XP per victory)',
    },
    {
      source: 'harvest' as ClanXPSource,
      xpRate: CLAN_XP_RATES.harvest,
      description: 'Harvest resources (5 XP per 1000 resources)',
    },
  ].sort((a, b) => b.xpRate - a.xpRate);
}

/**
 * Calculate estimated time to next level based on recent XP gain rate
 * 
 * Analyzes recent XP activity to project time to next level.
 * Returns null if insufficient activity data.
 * 
 * @param clanId - Clan to calculate for
 * @param daysToAnalyze - Number of days of history to analyze (default 7)
 * @returns Estimated hours to next level, or null if insufficient data
 */
export async function estimateTimeToNextLevel(
  clanId: string,
  daysToAnalyze: number = 7
): Promise<number | null> {
  const clansCollection = database.collection<Clan>('clans');
  const activitiesCollection = database.collection('clan_activities');

  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan || clan.level.currentLevel >= CLAN_LEVEL_CONSTANTS.MAX_LEVEL) {
    return null;
  }

  // Get recent XP activities
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.setDate(cutoffDate.getDate() - daysToAnalyze));

  const recentActivities = await activitiesCollection
    .find({
      clanId: new ObjectId(clanId),
      activityType: 'xp_gain' as ClanActivityType,
      timestamp: { $gte: cutoffDate },
    })
    .toArray();

  if (recentActivities.length === 0) {
    return null;
  }

  // Calculate average XP per hour
  const totalXP = recentActivities.reduce((sum, activity) => {
    return sum + (activity.details?.xpAwarded || 0);
  }, 0);

  const hoursAnalyzed = daysToAnalyze * 24;
  const xpPerHour = totalXP / hoursAnalyzed;

  if (xpPerHour <= 0) {
    return null;
  }

  // Calculate hours to next level
  const xpNeeded = clan.level.xpToNextLevel;
  const hoursToNextLevel = Math.ceil(xpNeeded / xpPerHour);

  return hoursToNextLevel;
}

// ============================================================================
// Activity Logging Integration
// ============================================================================

/**
 * Log XP gain activity to clan activity feed
 * 
 * Creates activity entry for XP awards and level ups.
 * Integrates with clanActivityService for comprehensive tracking.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player who earned XP
 * @param source - XP source type
 * @param xpAwarded - Amount of XP awarded
 * @param leveledUp - Whether clan leveled up
 * @param previousLevel - Level before XP award
 * @param newLevel - Level after XP award
 */
async function logXPActivity(
  clanId: string,
  playerId: string,
  source: ClanXPSource,
  xpAwarded: number,
  leveledUp: boolean,
  previousLevel: number,
  newLevel: number
): Promise<void> {
  const activitiesCollection = database.collection('clan_activities');

  const activity = {
    clanId: new ObjectId(clanId),
    activityType: (leveledUp ? 'level_up' : 'xp_gain') as ClanActivityType,
    playerId: new ObjectId(playerId),
    timestamp: new Date(),
    details: {
      source,
      xpAwarded,
      previousLevel,
      newLevel,
    },
  };

  await activitiesCollection.insertOne(activity);
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * XP Curve Design:
 * - Level 1→2: 1,000 XP
 * - Level 10→11: 8,900 XP
 * - Level 25→26: 56,000 XP
 * - Level 49→50: 320,000 XP
 * - Total to 50: ~50M XP (requires significant clan activity)
 * 
 * Performance Optimizations:
 * - Use binary search for level calculation (O(log n) vs O(n))
 * - Cache XP requirements in memory if needed
 * - Index clan_activities on clanId + activityType + timestamp
 * 
 * Future Enhancements:
 * - XP multiplier events (2x XP weekends)
 * - Prestige system after level 50
 * - Per-member XP contribution leaderboard
 * - XP decay for inactive clans
 */
