/**
 * Battle Log Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Specialized service for tracking combat engagements in DarkFrame.
 * Enhances existing battle logging with detailed statistics, unit tracking, and analytics.
 * Provides comprehensive combat data for balancing, player analytics, and leaderboards.
 * 
 * Features:
 * - Detailed battle tracking (participants, units, damage, outcomes)
 * - Battle statistics and analytics
 * - Combat leaderboards and rankings
 * - Unit performance analysis
 * - Clan warfare tracking
 * - Factory battle logging
 * 
 * Dependencies:
 * - MongoDB for data persistence
 * - activityLog.types.ts for battle-specific types
 */

import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import {
  BattleLog,
  BattleLogQuery,
  BattleLogStats,
  BattleType,
  BattleOutcome,
  UnitSnapshot
} from '@/types/activityLog.types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'BattleLog';
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 500;

// ============================================================================
// CORE LOGGING FUNCTIONS
// ============================================================================

/**
 * Log a battle engagement
 * 
 * @param battleLog - Battle log entry to record
 * @returns Promise resolving to inserted battle log ID
 * 
 * @example
 * await logBattle({
 *   battleId: 'battle_1729234567890',
 *   battleType: BattleType.PLAYER_VS_PLAYER,
 *   timestamp: new Date(),
 *   attackerId: '12345',
 *   attackerUsername: 'player1',
 *   defenderId: '67890',
 *   defenderUsername: 'player2',
 *   tileX: 10,
 *   tileY: 15,
 *   outcome: BattleOutcome.ATTACKER_WIN,
 *   winner: '12345',
 *   loser: '67890',
 *   attackerUnits: [...],
 *   defenderUnits: [...],
 *   attackerSurvivors: [...],
 *   defenderSurvivors: [...],
 *   attackerDamageDealt: 1500,
 *   defenderDamageDealt: 800,
 *   attackerUnitsLost: 5,
 *   defenderUnitsLost: 12,
 *   totalDamage: 2300,
 *   battleDurationMs: 250,
 *   attackerLevel: 15,
 *   defenderLevel: 14
 * });
 */
export async function logBattle(battleLog: Omit<BattleLog, '_id'>): Promise<string> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    // Ensure timestamp is set
    const entry: BattleLog = {
      ...battleLog,
      timestamp: battleLog.timestamp || new Date()
    };
    
    const result = await collection.insertOne(entry);
    
    return result.insertedId.toString();
  } catch (error) {
    console.error('[BattleLog] Error logging battle:', error);
    throw new Error('Failed to log battle');
  }
}

/**
 * Log multiple battles in bulk
 * 
 * @param battleLogs - Array of battle log entries
 * @returns Promise resolving to array of inserted battle log IDs
 * 
 * @example
 * await logBattlesBulk([battle1, battle2, battle3]);
 */
export async function logBattlesBulk(battleLogs: Omit<BattleLog, '_id'>[]): Promise<string[]> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    const entries: BattleLog[] = battleLogs.map(log => ({
      ...log,
      timestamp: log.timestamp || new Date()
    }));
    
    const result = await collection.insertMany(entries);
    
    return Object.values(result.insertedIds).map(id => id.toString());
  } catch (error) {
    console.error('[BattleLog] Error bulk logging battles:', error);
    return [];
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Query battle logs with filtering and pagination
 * 
 * @param query - Query parameters for filtering battles
 * @returns Promise resolving to array of matching battle logs
 * 
 * @example
 * const battles = await queryBattleLogs({
 *   playerId: '12345',
 *   battleType: BattleType.PLAYER_VS_PLAYER,
 *   startDate: new Date('2025-10-01'),
 *   limit: 20
 * });
 */
export async function queryBattleLogs(query: BattleLogQuery): Promise<BattleLog[]> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    // Build MongoDB filter
    const filter: any = {};
    
    // Player ID matches either attacker or defender
    if (query.playerId) {
      filter.$or = [
        { attackerId: query.playerId },
        { defenderId: query.playerId }
      ];
    }
    
    if (query.battleType) {
      filter.battleType = query.battleType;
    }
    
    if (query.outcome) {
      filter.outcome = query.outcome;
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
    
    if (query.tileX !== undefined && query.tileY !== undefined) {
      filter.tileX = query.tileX;
      filter.tileY = query.tileY;
    }
    
    // Apply limits
    const limit = Math.min(query.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    const offset = query.offset || 0;
    
    // Execute query
    const battles = await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
    
    return battles;
  } catch (error) {
    console.error('[BattleLog] Error querying battle logs:', error);
    throw new Error('Failed to query battle logs');
  }
}

/**
 * Get battle logs for a specific player
 * 
 * @param playerId - Player ID to get battles for
 * @param limit - Maximum number of battles to return
 * @returns Promise resolving to player's recent battles
 * 
 * @example
 * const playerBattles = await getPlayerBattleLogs('12345', 20);
 */
export async function getPlayerBattleLogs(playerId: string, limit: number = 50): Promise<BattleLog[]> {
  return queryBattleLogs({ playerId, limit });
}

/**
 * Get recent battles (last 24 hours)
 * 
 * @param limit - Maximum number of battles to return
 * @returns Promise resolving to recent battles
 * 
 * @example
 * const recentBattles = await getRecentBattles(50);
 */
export async function getRecentBattles(limit: number = 50): Promise<BattleLog[]> {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  return queryBattleLogs({
    startDate: oneDayAgo,
    limit
  });
}

/**
 * Get battle by ID
 * 
 * @param battleId - Unique battle identifier
 * @returns Promise resolving to battle log or null
 * 
 * @example
 * const battle = await getBattleById('battle_1729234567890');
 */
export async function getBattleById(battleId: string): Promise<BattleLog | null> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    const battle = await collection.findOne({ battleId });
    
    return battle;
  } catch (error) {
    console.error('[BattleLog] Error getting battle by ID:', error);
    return null;
  }
}

/**
 * Get battles at specific location
 * 
 * @param tileX - X coordinate
 * @param tileY - Y coordinate
 * @param limit - Maximum number of battles to return
 * @returns Promise resolving to battles at location
 * 
 * @example
 * const locationBattles = await getBattlesAtLocation(10, 15, 10);
 */
export async function getBattlesAtLocation(tileX: number, tileY: number, limit: number = 20): Promise<BattleLog[]> {
  return queryBattleLogs({ tileX, tileY, limit });
}

// ============================================================================
// STATISTICS FUNCTIONS
// ============================================================================

/**
 * Get battle log statistics
 * 
 * @param query - Optional query to filter statistics
 * @returns Promise resolving to battle log statistics
 * 
 * @example
 * const stats = await getBattleLogStats({
 *   playerId: '12345',
 *   startDate: new Date('2025-10-01')
 * });
 */
export async function getBattleLogStats(query?: BattleLogQuery): Promise<BattleLogStats> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    // Build filter from query
    const filter: any = {};
    if (query?.playerId) {
      filter.$or = [
        { attackerId: query.playerId },
        { defenderId: query.playerId }
      ];
    }
    if (query?.startDate || query?.endDate) {
      filter.timestamp = {};
      if (query.startDate) filter.timestamp.$gte = query.startDate;
      if (query.endDate) filter.timestamp.$lte = query.endDate;
    }
    
    // Total battles
    const totalBattles = await collection.countDocuments(filter);
    
    // Battles by type
    const typeStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$battleType', count: { $sum: 1 } } }
    ]).toArray();
    
    const battlesByType: Record<BattleType, number> = {} as any;
    typeStats.forEach(stat => {
      battlesByType[stat._id as BattleType] = stat.count;
    });
    
    // Win rates
    const outcomeStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: '$outcome', count: { $sum: 1 } } }
    ]).toArray();
    
    const attackerWins = outcomeStats.find(s => s._id === BattleOutcome.ATTACKER_WIN)?.count || 0;
    const defenderWins = outcomeStats.find(s => s._id === BattleOutcome.DEFENDER_WIN)?.count || 0;
    const draws = outcomeStats.find(s => s._id === BattleOutcome.DRAW)?.count || 0;
    
    const winRate = {
      attacker: totalBattles > 0 ? (attackerWins / totalBattles) * 100 : 0,
      defender: totalBattles > 0 ? (defenderWins / totalBattles) * 100 : 0,
      draw: totalBattles > 0 ? (draws / totalBattles) * 100 : 0
    };
    
    // Average damage
    const damageStats = await collection.aggregate([
      { $match: filter },
      { $group: { _id: null, avgDamage: { $avg: '$totalDamage' } } }
    ]).toArray();
    
    const averageDamage = damageStats[0]?.avgDamage || 0;
    
    // Total units lost
    const unitsLostStats = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalLost: { $sum: { $add: ['$attackerUnitsLost', '$defenderUnitsLost'] } }
        }
      }
    ]).toArray();
    
    const totalUnitsLost = unitsLostStats[0]?.totalLost || 0;
    
    // Most active players
    const activePlayersStats = await collection.aggregate([
      { $match: filter },
      {
        $facet: {
          attackers: [
            {
              $group: {
                _id: { playerId: '$attackerId', username: '$attackerUsername' },
                battlesAsAttacker: { $sum: 1 },
                winsAsAttacker: {
                  $sum: { $cond: [{ $eq: ['$outcome', BattleOutcome.ATTACKER_WIN] }, 1, 0] }
                }
              }
            }
          ],
          defenders: [
            {
              $group: {
                _id: { playerId: '$defenderId', username: '$defenderUsername' },
                battlesAsDefender: { $sum: 1 },
                winsAsDefender: {
                  $sum: { $cond: [{ $eq: ['$outcome', BattleOutcome.DEFENDER_WIN] }, 1, 0] }
                }
              }
            }
          ]
        }
      }
    ]).toArray();
    
    // Combine attacker and defender stats
    const playerMap = new Map<string, any>();
    
    if (activePlayersStats[0]) {
      activePlayersStats[0].attackers.forEach((stat: any) => {
        playerMap.set(stat._id.playerId, {
          playerId: stat._id.playerId,
          username: stat._id.username,
          battlesParticipated: stat.battlesAsAttacker,
          wins: stat.winsAsAttacker,
          losses: 0
        });
      });
      
      activePlayersStats[0].defenders.forEach((stat: any) => {
        const existing = playerMap.get(stat._id.playerId);
        if (existing) {
          existing.battlesParticipated += stat.battlesAsDefender;
          existing.wins += stat.winsAsDefender;
        } else {
          playerMap.set(stat._id.playerId, {
            playerId: stat._id.playerId,
            username: stat._id.username,
            battlesParticipated: stat.battlesAsDefender,
            wins: stat.winsAsDefender,
            losses: 0
          });
        }
      });
    }
    
    // Calculate losses for each player
    playerMap.forEach(player => {
      player.losses = player.battlesParticipated - player.wins;
    });
    
    const mostActivePlayers = Array.from(playerMap.values())
      .sort((a, b) => b.battlesParticipated - a.battlesParticipated)
      .slice(0, 10);
    
    // Deadliest units (aggregate unit performance)
    // This requires unwinding unit arrays - placeholder for now
    const deadliestUnits: Array<{
      unitType: string;
      totalDamageDealt: number;
      battlesUsed: number;
    }> = [];
    
    return {
      totalBattles,
      battlesByType,
      winRate,
      averageDamage,
      totalUnitsLost,
      mostActivePlayers,
      deadliestUnits
    };
  } catch (error) {
    console.error('[BattleLog] Error calculating battle statistics:', error);
    throw new Error('Failed to calculate battle statistics');
  }
}

/**
 * Get player combat statistics
 * 
 * @param playerId - Player ID to get stats for
 * @returns Promise resolving to player's combat statistics
 * 
 * @example
 * const playerStats = await getPlayerCombatStats('12345');
 */
export async function getPlayerCombatStats(playerId: string): Promise<{
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  totalUnitsLost: number;
  favoriteUnit?: string;
}> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    const battles = await collection.find({
      $or: [{ attackerId: playerId }, { defenderId: playerId }]
    }).toArray();
    
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    let totalUnitsLost = 0;
    
    battles.forEach(battle => {
      const isAttacker = battle.attackerId === playerId;
      
      if (battle.winner === playerId) {
        wins++;
      } else if (battle.loser === playerId) {
        losses++;
      } else {
        draws++;
      }
      
      if (isAttacker) {
        totalDamageDealt += battle.attackerDamageDealt;
        totalDamageTaken += battle.defenderDamageDealt;
        totalUnitsLost += battle.attackerUnitsLost;
      } else {
        totalDamageDealt += battle.defenderDamageDealt;
        totalDamageTaken += battle.attackerDamageDealt;
        totalUnitsLost += battle.defenderUnitsLost;
      }
    });
    
    const totalBattles = battles.length;
    const winRate = totalBattles > 0 ? (wins / totalBattles) * 100 : 0;
    
    return {
      totalBattles,
      wins,
      losses,
      draws,
      winRate,
      totalDamageDealt,
      totalDamageTaken,
      totalUnitsLost
    };
  } catch (error) {
    console.error('[BattleLog] Error calculating player combat stats:', error);
    throw new Error('Failed to calculate player combat stats');
  }
}

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

/**
 * Create MongoDB indexes for optimal query performance
 * 
 * @returns Promise resolving when indexes are created
 * 
 * @example
 * await createBattleLogIndexes();
 */
export async function createBattleLogIndexes(): Promise<void> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection<BattleLog>(COLLECTION_NAME);
    
    // Index for attacker queries
    await collection.createIndex(
      { attackerId: 1, timestamp: -1 },
      { name: 'attacker_timestamp_idx' }
    );
    
    // Index for defender queries
    await collection.createIndex(
      { defenderId: 1, timestamp: -1 },
      { name: 'defender_timestamp_idx' }
    );
    
    // Index for battle ID lookups
    await collection.createIndex(
      { battleId: 1 },
      { name: 'battleId_idx', unique: true }
    );
    
    // Index for location queries
    await collection.createIndex(
      { tileX: 1, tileY: 1, timestamp: -1 },
      { name: 'location_timestamp_idx' }
    );
    
    // Index for battle type queries
    await collection.createIndex(
      { battleType: 1, timestamp: -1 },
      { name: 'battleType_timestamp_idx' }
    );
    
    // Index for timestamp queries
    await collection.createIndex(
      { timestamp: 1 },
      { name: 'timestamp_idx' }
    );
    
    console.log('[BattleLog] Indexes created successfully');
  } catch (error) {
    console.error('[BattleLog] Error creating indexes:', error);
    throw error;
  }
}

/**
 * FOOTER:
 * 
 * Implementation Notes:
 * - Battle logs provide detailed combat analytics for game balancing
 * - Player statistics track performance across all battle types
 * - MongoDB indexes optimize queries for player lookups and leaderboards
 * - Unit performance tracking enables meta-game analysis
 * 
 * Performance Considerations:
 * - Battle logs are more detailed than activity logs (larger documents)
 * - Consider implementing battle log aggregation for historical analysis
 * - Unit performance queries may require additional optimization
 * 
 * Future Enhancements:
 * - Implement deadliest units aggregation (currently placeholder)
 * - Add battle replay data structure
 * - Implement real-time battle streaming for spectators
 * - Add ML-based battle outcome prediction
 */
