/**
 * BattleTrackingService - Tracks and aggregates player battle stats
 * @created 2025-10-19
 * @author ECHO v5.1
 *
 * OVERVIEW: Provides functions to record battles, fetch player stats, and get recent battles. Used by /api/battle/attack and /api/stats/battles endpoints.
 */
import { ObjectId } from 'mongodb';
import { getDatabase } from './mongodb';

export interface BattleRecord {
  attacker: string;
  defender: string;
  winner: string;
  factoryLocation: { x: number; y: number };
  attackerPower: number;
  defenderPower: number;
  factoryCaptured: boolean;
  timestamp: Date;
  details: any;
}

export interface PlayerBattleStats {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalBattles: number;
}

/**
 * Records a battle in the battleLogs collection
 */
/**
 * Records a battle in the battleLogs collection
 */
export async function recordBattle(battle: BattleRecord): Promise<void> {
  const db = await getDatabase();
  await db.collection('battleLogs').insertOne(battle);
}

/**
 * Gets aggregated battle stats for a player
 */
/**
 * Gets aggregated battle stats for a player
 */
export async function getPlayerBattleStats(username: string): Promise<PlayerBattleStats> {
  const db = await getDatabase();
  const wins = await db.collection('battleLogs').countDocuments({ winner: username });
  const losses = await db.collection('battleLogs').countDocuments({ $or: [{ attacker: username }, { defender: username }], winner: { $ne: username } });
  const draws = await db.collection('battleLogs').countDocuments({ $or: [{ attacker: username }, { defender: username }], winner: null });
  const totalBattles = await db.collection('battleLogs').countDocuments({ $or: [{ attacker: username }, { defender: username }] });
  const winRate = totalBattles > 0 ? wins / totalBattles : 0;
  return { username, wins, losses, draws, winRate, totalBattles };
}

/**
 * Gets the most recent battles
 * @param limit - Number of battles to return (default: 10)
 * @returns Array of BattleRecord
 */
export async function getRecentBattles(limit: number = 10): Promise<BattleRecord[]> {
  const db = await getDatabase();
  const docs = await db.collection('battleLogs')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  // Map raw documents to BattleRecord type
  return docs.map(doc => ({
    attacker: doc.attacker ?? '',
    defender: doc.defender ?? '',
    winner: doc.winner ?? '',
    factoryLocation: doc.factoryLocation ?? { x: 0, y: 0 },
    attackerPower: doc.attackerPower ?? 0,
    defenderPower: doc.defenderPower ?? 0,
    factoryCaptured: doc.factoryCaptured ?? false,
    timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date(),
    details: doc.details ?? {},
  }));
}

/**
 * IMPLEMENTATION NOTES:
 * - All stats are recalculated live for accuracy.
 * - Draws are defined as battles with winner: null.
 * - Extend for advanced stats as needed.
 */
