/**
 * Activity Log Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Core service for logging all player activities in DarkFrame.
 * Provides comprehensive tracking of 30+ action types across 9 categories.
 * Supports security auditing, analytics, performance monitoring, and admin oversight.
 * 
 * Features:
 * - Automatic action logging with metadata capture
 * - Query and filtering by player, action type, date range
 * - Statistics and analytics aggregation
 * - Log retention and cleanup policies
 * - Performance-optimized with MongoDB indexes
 * - Non-blocking logging to avoid request delays
 * 
 * Dependencies:
 * - MongoDB for data persistence
 * - activityLog.types.ts for type definitions
 */

import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import {
  ActivityLog,
  ActivityLogQuery,
  ActivityLogStats,
  ActionType,
  ActionCategory,
  LogRetentionPolicy,
  getActionCategory
} from '@/types/activityLog.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'ActionLog';

/**
 * Default log retention policy
 * Can be overridden via admin configuration
 */
const DEFAULT_RETENTION_POLICY: LogRetentionPolicy = {
  activityLogDays: 90,
  battleLogDays: 180,
  adminLogDays: 365,
  archiveEnabled: false
};

/**
 * Default query limits to prevent performance issues
 */
const DEFAULT_QUERY_LIMIT = 100;
const MAX_QUERY_LIMIT = 1000;

// ============================================================================
// CORE LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a player activity action
 * 
 * @param logEntry - Activity log entry to record
 * @returns Promise resolving to inserted log ID
 * 
 * @example
 * await logActivity({
 *   playerId: '12345',
 *   username: 'player1',
 *   actionType: ActionType.HARVEST_METAL,
 *   category: ActionCategory.RESOURCE,
 *   timestamp: new Date(),
 *   details: { amount: 50, tileX: 10, tileY: 15 },
 *   success: true,
 *   executionTimeMs: 45,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * });
 */
export async function logActivity(logEntry: Omit<ActivityLog, '_id'>): Promise<string> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    // Ensure category is set
    const entry: ActivityLog = {
      ...logEntry,
      category: logEntry.category || getActionCategory(logEntry.actionType),
      timestamp: logEntry.timestamp || new Date()
    };
    
    // Insert log entry (non-blocking - fire and forget for performance)
    const result = await collection.insertOne(entry);
    
    return result.insertedId.toString();
  } catch (error) {
    // Log errors but don't throw to avoid disrupting the main request
    console.error('[ActivityLog] Error logging activity:', error);
    return '';
  }
}

/**
 * Log multiple activities in bulk
 * More efficient for batch operations
 * 
 * @param logEntries - Array of activity log entries
 * @returns Promise resolving to array of inserted log IDs
 * 
 * @example
 * await logActivitiesBulk([
 *   { playerId: '1', actionType: ActionType.MOVE, ... },
 *   { playerId: '1', actionType: ActionType.HARVEST_METAL, ... }
 * ]);
 */
export async function logActivitiesBulk(logEntries: Omit<ActivityLog, '_id'>[]): Promise<string[]> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    // Ensure all entries have category and timestamp
    const entries: ActivityLog[] = logEntries.map(entry => ({
      ...entry,
      category: entry.category || getActionCategory(entry.actionType),
      timestamp: entry.timestamp || new Date()
    }));
    
    const result = await collection.insertMany(entries);
    
    return Object.values(result.insertedIds).map(id => id.toString());
  } catch (error) {
    console.error('[ActivityLog] Error bulk logging activities:', error);
    return [];
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Query activity logs with filtering and pagination
 * 
 * @param query - Query parameters for filtering logs
 * @returns Promise resolving to array of matching activity logs
 * 
 * @example
 * const logs = await queryActivityLogs({
 *   playerId: '12345',
 *   actionType: [ActionType.HARVEST_METAL, ActionType.HARVEST_ENERGY],
 *   startDate: new Date('2025-10-01'),
 *   endDate: new Date('2025-10-18'),
 *   limit: 50,
 *   sortBy: 'timestamp',
 *   sortOrder: 'desc'
 * });
 */
export async function queryActivityLogs(query: ActivityLogQuery): Promise<ActivityLog[]> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    // Build MongoDB filter
    const filter: any = {};
    
    if (query.playerId) {
      filter.playerId = query.playerId;
    }
    
    if (query.username) {
      filter.username = query.username;
    }
    
    if (query.actionType) {
      if (Array.isArray(query.actionType)) {
        filter.actionType = { $in: query.actionType };
      } else {
        filter.actionType = query.actionType;
      }
    }
    
    if (query.category) {
      if (Array.isArray(query.category)) {
        filter.category = { $in: query.category };
      } else {
        filter.category = query.category;
      }
    }
    
    if (query.startDate || query.endDate) {
      filter.timestamp = {};
      if (query.startDate) {
        filter.timestamp.$gte = query.startDate;
      }
      if (query.endDate) {
        filter.timestamp.$lte = query.endDate;
      }
    }
    
    if (query.success !== undefined) {
      filter.success = query.success;
    }
    
    // Build sort options
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortBy]: sortOrder };
    
    // Apply limits
    const limit = Math.min(query.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const offset = query.offset || 0;
    
    // Execute query
    const logs = await collection
      .find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();
    
    return logs;
  } catch (error) {
    console.error('[ActivityLog] Error querying activity logs:', error);
    throw new Error('Failed to query activity logs');
  }
}

/**
 * Get activity logs for a specific player
 * 
 * @param playerId - Player ID to get logs for
 * @param limit - Maximum number of logs to return (default: 100)
 * @returns Promise resolving to player's recent activity logs
 * 
 * @example
 * const playerLogs = await getPlayerActivityLogs('12345', 50);
 */
export async function getPlayerActivityLogs(playerId: string, limit: number = 100): Promise<ActivityLog[]> {
  return queryActivityLogs({
    playerId,
    limit,
    sortBy: 'timestamp',
    sortOrder: 'desc'
  });
}

/**
 * Get recent activity logs (last 24 hours)
 * 
 * @param limit - Maximum number of logs to return
 * @returns Promise resolving to recent activity logs
 * 
 * @example
 * const recentLogs = await getRecentActivityLogs(100);
 */
export async function getRecentActivityLogs(limit: number = 100): Promise<ActivityLog[]> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  return queryActivityLogs({
    startDate: oneDayAgo,
    limit,
    sortBy: 'timestamp',
    sortOrder: 'desc'
  });
}

/**
 * Get failed actions (for debugging and monitoring)
 * 
 * @param limit - Maximum number of failures to return
 * @returns Promise resolving to failed activity logs
 * 
 * @example
 * const failures = await getFailedActions(50);
 */
export async function getFailedActions(limit: number = 100): Promise<ActivityLog[]> {
  return queryActivityLogs({
    success: false,
    limit,
    sortBy: 'timestamp',
    sortOrder: 'desc'
  });
}

// ============================================================================
// STATISTICS FUNCTIONS
// ============================================================================

/**
 * Get activity log statistics
 * 
 * @param query - Optional query to filter statistics
 * @returns Promise resolving to activity log statistics
 * 
 * @example
 * const stats = await getActivityLogStats({
 *   startDate: new Date('2025-10-01'),
 *   endDate: new Date('2025-10-18')
 * });
 */
export async function getActivityLogStats(query?: ActivityLogQuery): Promise<ActivityLogStats> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    // Build filter from query
    const filter: any = {};
    if (query?.playerId) filter.playerId = query.playerId;
    if (query?.startDate || query?.endDate) {
      filter.timestamp = {};
      if (query.startDate) filter.timestamp.$gte = query.startDate;
      if (query.endDate) filter.timestamp.$lte = query.endDate;
    }
    
    // Aggregate statistics
    const pipeline: any[] = [
      { $match: filter }
    ];
    
    // Total actions
    const totalActions = await collection.countDocuments(filter);
    
    // Actions by category
    const categoryStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).toArray();
    
    const actionsByCategory: Record<ActionCategory, number> = {} as any;
    categoryStats.forEach(stat => {
      actionsByCategory[stat._id as ActionCategory] = stat.count;
    });
    
    // Actions by type
    const typeStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$actionType', count: { $sum: 1 } } }
    ]).toArray();
    
    const actionsByType: Record<ActionType, number> = {} as any;
    typeStats.forEach(stat => {
      actionsByType[stat._id as ActionType] = stat.count;
    });
    
    // Success rate
    const successCount = await collection.countDocuments({ ...filter, success: true });
    const successRate = totalActions > 0 ? (successCount / totalActions) * 100 : 0;
    
    // Average execution time
    const execTimeStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, avgTime: { $avg: '$executionTimeMs' } } }
    ]).toArray();
    
    const averageExecutionTimeMs = execTimeStats[0]?.avgTime || 0;
    
    // Unique players
    const uniquePlayers = await collection.distinct('playerId', filter);
    
    // Date range
    const dateRangeStats = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          earliest: { $min: '$timestamp' },
          latest: { $max: '$timestamp' }
        }
      }
    ]).toArray();
    
    const dateRange = dateRangeStats[0] 
      ? { earliest: dateRangeStats[0].earliest as Date, latest: dateRangeStats[0].latest as Date }
      : { earliest: new Date(), latest: new Date() };
    
    // Top players by action count
    const topPlayersStats = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { playerId: '$playerId', username: '$username' },
          actionCount: { $sum: 1 }
        }
      },
      { $sort: { actionCount: -1 } },
      { $limit: 10 }
    ]).toArray();
    
    const topPlayers = topPlayersStats.map(stat => ({
      playerId: stat._id.playerId,
      username: stat._id.username,
      actionCount: stat.actionCount
    }));
    
    // Error rate
    const errorCount = await collection.countDocuments({ ...filter, success: false });
    const errorRate = totalActions > 0 ? (errorCount / totalActions) * 100 : 0;
    
    // Errors by type
    const errorTypeStats = await collection.aggregate([
      { $match: { ...filter, success: false, errorCode: { $exists: true } } },
      { $group: { _id: '$errorCode', count: { $sum: 1 } } }
    ]).toArray();
    
    const errorsByType: Record<string, number> = {};
    errorTypeStats.forEach(stat => {
      errorsByType[stat._id] = stat.count;
    });
    
    return {
      totalActions,
      actionsByCategory,
      actionsByType,
      successRate,
      averageExecutionTimeMs,
      uniquePlayers: uniquePlayers.length,
      dateRange,
      topPlayers,
      errorRate,
      errorsByType
    };
  } catch (error) {
    console.error('[ActivityLog] Error calculating statistics:', error);
    throw new Error('Failed to calculate activity log statistics');
  }
}

/**
 * Get action counts for a specific time period
 * 
 * @param hours - Number of hours to look back
 * @returns Promise resolving to action count
 * 
 * @example
 * const actionsLastHour = await getActionCountForPeriod(1);
 * const actionsLast24Hours = await getActionCountForPeriod(24);
 */
export async function getActionCountForPeriod(hours: number): Promise<number> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);
    
    const count = await collection.countDocuments({
      timestamp: { $gte: startDate }
    });
    
    return count;
  } catch (error) {
    console.error('[ActivityLog] Error counting actions for period:', error);
    return 0;
  }
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Clean up old activity logs based on retention policy
 * 
 * @param policy - Optional custom retention policy (uses default if not provided)
 * @returns Promise resolving to number of logs deleted
 * 
 * @example
 * const deleted = await cleanupOldLogs();
 * console.log(`Deleted ${deleted} old log entries`);
 */
export async function cleanupOldLogs(policy: LogRetentionPolicy = DEFAULT_RETENTION_POLICY): Promise<number> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.activityLogDays);
    
    // Delete logs older than retention period
    // Keep admin logs longer (separate retention policy)
    const result = await collection.deleteMany({
      timestamp: { $lt: cutoffDate },
      category: { $ne: ActionCategory.ADMIN } // Keep admin logs longer
    });
    
    // Delete old admin logs separately
    const adminCutoffDate = new Date();
    adminCutoffDate.setDate(adminCutoffDate.getDate() - policy.adminLogDays);
    
    const adminResult = await collection.deleteMany({
      timestamp: { $lt: adminCutoffDate },
      category: ActionCategory.ADMIN
    });
    
    const totalDeleted = result.deletedCount + adminResult.deletedCount;
    
    console.log(`[ActivityLog] Cleanup complete: ${totalDeleted} logs deleted`);
    return totalDeleted;
  } catch (error) {
    console.error('[ActivityLog] Error cleaning up old logs:', error);
    throw new Error('Failed to clean up old logs');
  }
}

/**
 * Archive old logs before deletion
 * (Implementation would export to file storage or separate archive DB)
 * 
 * @param policy - Retention policy
 * @returns Promise resolving to number of logs archived
 * 
 * @example
 * const archived = await archiveOldLogs();
 */
export async function archiveOldLogs(policy: LogRetentionPolicy = DEFAULT_RETENTION_POLICY): Promise<number> {
  // TODO: Implement archival to external storage (S3, file system, etc.)
  // For now, just logs that archival would happen
  console.log('[ActivityLog] Archive functionality not yet implemented');
  return 0;
}

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

/**
 * Create MongoDB indexes for optimal query performance
 * Should be called during application initialization
 * 
 * @returns Promise resolving when indexes are created
 * 
 * @example
 * await createActivityLogIndexes();
 */
export async function createActivityLogIndexes(): Promise<void> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<ActivityLog>(COLLECTION_NAME);
    
    // Compound index for player queries
    await collection.createIndex(
      { playerId: 1, timestamp: -1 },
      { name: 'player_timestamp_idx' }
    );
    
    // Compound index for action type queries
    await collection.createIndex(
      { actionType: 1, timestamp: -1 },
      { name: 'actionType_timestamp_idx' }
    );
    
    // Compound index for category queries
    await collection.createIndex(
      { category: 1, timestamp: -1 },
      { name: 'category_timestamp_idx' }
    );
    
    // Index for timestamp queries (cleanup)
    await collection.createIndex(
      { timestamp: 1 },
      { name: 'timestamp_idx' }
    );
    
    // Index for success/failure queries
    await collection.createIndex(
      { success: 1, timestamp: -1 },
      { name: 'success_timestamp_idx' }
    );
    
    // Index for username lookups
    await collection.createIndex(
      { username: 1, timestamp: -1 },
      { name: 'username_timestamp_idx' }
    );
    
    console.log('[ActivityLog] Indexes created successfully');
  } catch (error) {
    console.error('[ActivityLog] Error creating indexes:', error);
    throw error;
  }
}

/**
 * FOOTER:
 * 
 * Implementation Notes:
 * - All logging functions are non-blocking to avoid impacting request performance
 * - MongoDB indexes optimize common query patterns (player, action type, timestamp)
 * - Retention policies prevent database bloat from unlimited log growth
 * - Statistics aggregation uses MongoDB pipelines for efficiency
 * - Error handling ensures logging failures don't crash the application
 * 
 * Performance Considerations:
 * - Bulk logging reduces database round trips
 * - Indexes must be maintained as data volume grows
 * - Consider archival strategy for long-term storage
 * 
 * Security Notes:
 * - IP addresses and User-Agent stored for security auditing
 * - Admin actions logged separately with extended retention
 * - Sensitive data should be sanitized before logging in details object
 * 
 * Future Enhancements:
 * - Implement log archival to external storage (S3, Azure Blob)
 * - Add real-time log streaming for admin dashboard
 * - Implement log aggregation for time-series analytics
 * - Add anomaly detection for security alerts
 */
