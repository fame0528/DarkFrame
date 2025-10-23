/**
 * Clan Activity Service - Activity Logging & Feed
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan activity logging and activity feed generation.
 * Integrates with the P6 activity logging system to track all clan-related events.
 * Provides filtered views of clan activities for members and analytics.
 * 
 * Key Features:
 * - Log all clan activities (member changes, research, wars, banking, etc.)
 * - Retrieve activity feed with filtering and pagination
 * - Activity type filtering (show only specific types)
 * - Time-based queries (last 24 hours, last week, etc.)
 * - Player-specific activity tracking
 * - Integration with general activity logging system
 * 
 * Dependencies:
 * - MongoDB database connection
 * - types/clan.types.ts for activity types
 * - lib/activityLogService.ts for general activity logging
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  ClanActivity,
  ClanActivityType,
} from '@/types/clan.types';

let client: MongoClient;
let db: Db;

/**
 * Initialize MongoDB connection for clan activity service
 * @param mongoClient - MongoDB client instance
 * @param database - Database instance
 */
export function initializeClanActivityService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get MongoDB database instance
 * @returns Database instance
 * @throws Error if database not initialized
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Clan activity service database not initialized');
  }
  return db;
}

/**
 * Log a clan activity event
 * Creates activity record in clan_activities collection and general activity log.
 * 
 * @param clanId - Clan ID
 * @param activityType - Type of activity
 * @param playerId - Player involved (optional)
 * @param details - Activity-specific details
 * @returns Created activity document
 * 
 * @example
 * await logClanActivity('clan123', ClanActivityType.MEMBER_JOINED, 'player456', {
 *   username: 'NewPlayer',
 *   role: ClanRole.RECRUIT
 * });
 */
export async function logClanActivity(
  clanId: string,
  activityType: ClanActivityType,
  playerId?: string,
  details?: Record<string, any>
): Promise<ClanActivity> {
  const database = getDb();
  
  // Get clan for username lookup
  let username: string | undefined;
  if (playerId) {
    const player = await database.collection('players').findOne({ _id: new ObjectId(playerId) });
    username = player?.username || playerId;
  }
  
  // Create activity record
  const activity: ClanActivity = {
    clanId,
    activityType,
    playerId,
    username,
    details: details || {},
    timestamp: new Date(),
  };
  
  // Insert into clan_activities collection
  const result = await database.collection('clan_activities').insertOne(activity);
  activity._id = result.insertedId;
  
  // Also log to general activity system (if available)
  try {
    await database.collection('activity_logs').insertOne({
      playerId,
      username,
      activityType: `CLAN_${activityType}`,
      metadata: {
        clanId,
        ...details,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    // Don't fail if general activity logging fails
    console.error('Failed to log to general activity system:', error);
  }
  
  return activity;
}

/**
 * Get clan activity feed
 * Retrieves recent activities with optional filtering and pagination.
 * 
 * @param clanId - Clan ID
 * @param options - Query options
 * @returns Array of activity records, newest first
 * 
 * @example
 * const feed = await getClanActivityFeed('clan123', {
 *   limit: 50,
 *   activityTypes: [ClanActivityType.MEMBER_JOINED, ClanActivityType.MEMBER_LEFT]
 * });
 */
export async function getClanActivityFeed(
  clanId: string,
  options: {
    limit?: number;
    offset?: number;
    activityTypes?: ClanActivityType[];
    playerId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<ClanActivity[]> {
  const database = getDb();
  
  const {
    limit = 100,
    offset = 0,
    activityTypes,
    playerId,
    startDate,
    endDate,
  } = options;
  
  // Build query filter
  const filter: any = { clanId };
  
  if (activityTypes && activityTypes.length > 0) {
    filter.activityType = { $in: activityTypes };
  }
  
  if (playerId) {
    filter.playerId = playerId;
  }
  
  if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = startDate;
    if (endDate) filter.timestamp.$lte = endDate;
  }
  
  // Query activities
  const activities = await database
    .collection('clan_activities')
    .find(filter)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit)
    .toArray() as ClanActivity[];
  
  return activities;
}

/**
 * Get activity count by type
 * Returns count of each activity type for analytics.
 * 
 * @param clanId - Clan ID
 * @param startDate - Optional start date filter
 * @param endDate - Optional end date filter
 * @returns Object with counts per activity type
 * 
 * @example
 * const stats = await getActivityStats('clan123', new Date('2025-01-01'));
 * // Returns: { MEMBER_JOINED: 15, RESEARCH_UNLOCKED: 8, ... }
 */
export async function getActivityStats(
  clanId: string,
  startDate?: Date,
  endDate?: Date
): Promise<Record<ClanActivityType, number>> {
  const database = getDb();
  
  // Build match filter
  const matchFilter: any = { clanId };
  if (startDate || endDate) {
    matchFilter.timestamp = {};
    if (startDate) matchFilter.timestamp.$gte = startDate;
    if (endDate) matchFilter.timestamp.$lte = endDate;
  }
  
  // Aggregate by activity type
  const results = await database
    .collection('clan_activities')
    .aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  
  // Convert to object
  const stats: Record<string, number> = {};
  for (const result of results) {
    stats[result._id] = result.count;
  }
  
  return stats as Record<ClanActivityType, number>;
}

/**
 * Get player contribution statistics
 * Analyzes player activity within clan for contribution tracking.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player ID
 * @param days - Number of days to analyze (default 30)
 * @returns Contribution statistics
 * 
 * @example
 * const contributions = await getPlayerContributions('clan123', 'player456', 7);
 */
export async function getPlayerContributions(
  clanId: string,
  playerId: string,
  days: number = 30
): Promise<{
  totalActivities: number;
  researchContributions: number;
  bankDeposits: number;
  territoriesClaimed: number;
  activityScore: number;
}> {
  const database = getDb();
  
  // Calculate start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Get all player activities in time range
  const activities = await database
    .collection('clan_activities')
    .find({
      clanId,
      playerId,
      timestamp: { $gte: startDate },
    })
    .toArray() as ClanActivity[];
  
  // Count specific activity types
  let researchContributions = 0;
  let bankDeposits = 0;
  let territoriesClaimed = 0;
  
  for (const activity of activities) {
    switch (activity.activityType) {
      case ClanActivityType.RESEARCH_CONTRIBUTED:
        researchContributions++;
        break;
      case ClanActivityType.BANK_DEPOSIT:
        bankDeposits++;
        break;
      case ClanActivityType.TERRITORY_CLAIMED:
        territoriesClaimed++;
        break;
    }
  }
  
  // Calculate activity score (weighted by contribution value)
  const activityScore =
    researchContributions * 10 + // Research contributions worth 10 points
    bankDeposits * 5 + // Bank deposits worth 5 points
    territoriesClaimed * 15 + // Territory claims worth 15 points
    activities.length * 1; // All activities worth 1 point base
  
  return {
    totalActivities: activities.length,
    researchContributions,
    bankDeposits,
    territoriesClaimed,
    activityScore,
  };
}

/**
 * Get recent member activities
 * Returns activity summary for all clan members.
 * 
 * @param clanId - Clan ID
 * @param hours - Time window in hours (default 24)
 * @returns Array of player activity summaries
 * 
 * @example
 * const recentActivity = await getRecentMemberActivities('clan123', 24);
 */
export async function getRecentMemberActivities(
  clanId: string,
  hours: number = 24
): Promise<Array<{
  playerId: string;
  username: string;
  activityCount: number;
  lastActivity: Date;
}>> {
  const database = getDb();
  
  // Calculate start time
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - hours);
  
  // Aggregate by player
  const results = await database
    .collection('clan_activities')
    .aggregate([
      {
        $match: {
          clanId,
          timestamp: { $gte: startTime },
          playerId: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: '$playerId',
          username: { $first: '$username' },
          activityCount: { $sum: 1 },
          lastActivity: { $max: '$timestamp' },
        },
      },
      {
        $sort: { activityCount: -1 },
      },
    ])
    .toArray();
  
  return results.map(r => ({
    playerId: r._id,
    username: r.username || r._id,
    activityCount: r.activityCount,
    lastActivity: r.lastActivity,
  }));
}

/**
 * Delete old clan activities
 * Cleanup function to remove old activity records.
 * 
 * @param clanId - Clan ID
 * @param daysToKeep - Number of days to retain (default 30)
 * @returns Number of deleted records
 * 
 * @example
 * const deleted = await cleanupOldActivities('clan123', 30);
 */
export async function cleanupOldActivities(
  clanId: string,
  daysToKeep: number = 30
): Promise<number> {
  const database = getDb();
  
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  // Delete old activities
  const result = await database.collection('clan_activities').deleteMany({
    clanId,
    timestamp: { $lt: cutoffDate },
  });
  
  return result.deletedCount;
}

/**
 * Get activity timeline
 * Returns activity counts grouped by time period for charts.
 * 
 * @param clanId - Clan ID
 * @param days - Number of days to analyze
 * @param groupBy - Time grouping ('hour' | 'day')
 * @returns Array of time period data
 * 
 * @example
 * const timeline = await getActivityTimeline('clan123', 7, 'day');
 * // Returns: [{ date: '2025-10-18', count: 45 }, ...]
 */
export async function getActivityTimeline(
  clanId: string,
  days: number = 7,
  groupBy: 'hour' | 'day' = 'day'
): Promise<Array<{ date: string; count: number }>> {
  const database = getDb();
  
  // Calculate start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // Build aggregation pipeline
  const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m-%d %H:00';
  
  const results = await database
    .collection('clan_activities')
    .aggregate([
      {
        $match: {
          clanId,
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: '$timestamp',
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ])
    .toArray();
  
  return results.map(r => ({
    date: r._id,
    count: r.count,
  }));
}

/**
 * Get most active members
 * Returns top contributors based on activity score.
 * 
 * @param clanId - Clan ID
 * @param days - Time window in days (default 7)
 * @param limit - Number of results (default 10)
 * @returns Array of top contributors
 * 
 * @example
 * const topMembers = await getMostActiveMembers('clan123', 7, 10);
 */
export async function getMostActiveMembers(
  clanId: string,
  days: number = 7,
  limit: number = 10
): Promise<Array<{
  playerId: string;
  username: string;
  activityScore: number;
  totalActivities: number;
}>> {
  const database = getDb();
  
  // Get clan members
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    return [];
  }
  
  // Calculate activity scores for all members
  const memberScores: Array<{
    playerId: string;
    username: string;
    activityScore: number;
    totalActivities: number;
  }> = [];
  
  for (const member of clan.members) {
    const contributions = await getPlayerContributions(clanId, member.playerId, days);
    memberScores.push({
      playerId: member.playerId,
      username: member.username,
      activityScore: contributions.activityScore,
      totalActivities: contributions.totalActivities,
    });
  }
  
  // Sort by activity score descending
  memberScores.sort((a, b) => b.activityScore - a.activityScore);
  
  // Return top N
  return memberScores.slice(0, limit);
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Activity Logging:
 *    - All clan activities stored in clan_activities collection
 *    - Also logged to general activity_logs for cross-system analytics
 *    - Automatic username lookup from player ID
 *    - Metadata stored in details field for flexibility
 * 
 * 2. Activity Feed:
 *    - Default limit: 100 activities
 *    - Sorted newest first (timestamp descending)
 *    - Support for filtering by type, player, date range
 *    - Pagination via limit/offset
 * 
 * 3. Activity Statistics:
 *    - Aggregation by activity type for analytics
 *    - Time-based filtering (last 24h, 7d, 30d, etc.)
 *    - Player contribution tracking
 *    - Activity scoring system (weighted by contribution value)
 * 
 * 4. Performance Considerations:
 *    - Index on clanId + timestamp for fast queries
 *    - Index on clanId + playerId for player-specific queries
 *    - Automatic cleanup of old activities (30+ days)
 *    - Aggregation pipeline for efficient stats calculation
 * 
 * 5. Activity Types Tracked:
 *    - Membership: JOINED, LEFT, KICKED, PROMOTED, DEMOTED
 *    - Leadership: LEADERSHIP_TRANSFERRED, SETTINGS_CHANGED
 *    - Progression: LEVEL_UP, PERK_ACTIVATED, PERK_DEACTIVATED
 *    - Research: RESEARCH_UNLOCKED, RESEARCH_CONTRIBUTED
 *    - Territory: TERRITORY_CLAIMED, TERRITORY_LOST
 *    - Warfare: WAR_DECLARED, WAR_ENDED
 *    - Monuments: MONUMENT_CAPTURED, MONUMENT_LOST
 *    - Banking: BANK_DEPOSIT, BANK_WITHDRAWAL, TAX_COLLECTED, TAX_RATE_CHANGED, BANK_UPGRADED
 * 
 * 6. Integration Points:
 *    - Called by clanService.ts for membership changes
 *    - Called by clanBankService.ts for banking operations
 *    - Called by clanResearchService.ts for research progress
 *    - Called by territoryService.ts for territory changes
 *    - Called by clanWarfareService.ts for war events
 * 
 * 7. Analytics Features:
 *    - Activity timeline for charts (hourly/daily grouping)
 *    - Most active members leaderboard
 *    - Recent member activity summary
 *    - Player contribution scoring (weighted)
 */
