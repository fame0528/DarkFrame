/**
 * Combat Event Handler
 * Created: 2025-10-19
 * 
 * OVERVIEW:
 * Handles combat-related WebSocket events including attack notifications,
 * battle results, and defense alerts.
 */

import type { Server, Socket } from 'socket.io';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedUser } from '../auth';
import {
  broadcastAttackStarted,
  broadcastBattleResult,
  notifyDefenseAlert,
} from '../broadcast';
import { joinBattleRoom } from '../rooms';
import type {
  CombatAttackStartedPayload,
  CombatBattleResultPayload,
  CombatDefenseAlertPayload,
} from '@/types/websocket';

/**
 * Handles battle initiation
 * Creates battle document and notifies participants
 */
export async function handleBattleStart(
  io: Server,
  attackerId: string,
  defenderId: string,
  location: { x: number; y: number }
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    // Fetch participants
    const [attacker, defender] = await Promise.all([
      db.collection('users').findOne({ _id: new ObjectId(attackerId) }),
      db.collection('users').findOne({ _id: new ObjectId(defenderId) }),
    ]);
    
    if (!attacker || !defender) return;
    
    // Create battle document
    const battleId = new ObjectId().toString();
    await db.collection('battles').insertOne({
      _id: new ObjectId(battleId),
      attackerId,
      defenderId,
      location,
      startedAt: Date.now(),
      status: 'ongoing',
    });
    
    // Broadcast attack started
    const payload: CombatAttackStartedPayload = {
      battleId,
      attackerId,
      attackerName: attacker.username,
      defenderId,
      defenderName: defender.username,
      attackerClanId: attacker.clanId,
      defenderClanId: defender.clanId,
      location,
      startedAt: Date.now(),
    };
    
    await broadcastAttackStarted(io, payload);
    
  } catch (error) {
    console.error('[Combat Handler] Failed to handle battle start:', error);
  }
}

/**
 * Handles battle completion
 * Updates database and broadcasts result
 */
export async function handleBattleEnd(
  io: Server,
  battleId: string,
  winner: string,
  loser: string,
  casualties: { winner: number; loser: number }
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    // Update battle document
    await db.collection('battles').updateOne(
      { _id: new ObjectId(battleId) },
      { 
        $set: { 
          status: 'completed',
          winner,
          completedAt: Date.now(),
          casualties,
        } 
      }
    );
    
    // Broadcast result
    const payload: CombatBattleResultPayload = {
      battleId,
      winner,
      loser,
      casualties,
      resourcesLost: { winner: {}, loser: {} },
      experienceGained: { winner: 100, loser: 25 },
      completedAt: Date.now(),
    };
    
    await broadcastBattleResult(io, payload);
    
  } catch (error) {
    console.error('[Combat Handler] Failed to handle battle end:', error);
  }
}
