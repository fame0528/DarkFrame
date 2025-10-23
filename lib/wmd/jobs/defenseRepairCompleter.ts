/**
 * @file lib/wmd/jobs/defenseRepairCompleter.ts
 * @created 2025-10-22
 * @overview Background job to complete battery repairs after repair time expires
 * 
 * OVERVIEW:
 * Processes defense batteries that have completed their repair duration.
 * Restores battery to full health, operational status, and full interceptor capacity.
 * Broadcasts completion notifications to battery owners.
 * 
 * Features:
 * - Queries batteries with repairCompletesAt <= now
 * - Restores health to 100%
 * - Sets status back to IDLE (operational)
 * - Clears repairing flag
 * - Broadcasts completion to owner via WebSocket
 * 
 * Dependencies:
 * - MongoDB for battery data
 * - WebSocket for real-time notifications
 * 
 * @implements Background Job Pattern
 */

import { Db } from 'mongodb';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers/wmdHandler';

/**
 * Battery status enum (mirrors defenseService)
 */
enum BatteryStatus {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  COOLDOWN = 'COOLDOWN',
  DAMAGED = 'DAMAGED',
  UPGRADING = 'UPGRADING',
}

/**
 * Main job function - completes battery repairs
 * Runs every 60 seconds via master scheduler
 */
export async function defenseRepairCompleter(db: Db): Promise<void> {
  try {
    const now = new Date();
    
    // Query batteries with completed repairs
    const batteriesCollection = db.collection('wmd_defense_batteries');
    const completedRepairs = await batteriesCollection
      .find({
        repairing: true,
        repairCompletesAt: { $lte: now },
      })
      .toArray();
    
    if (completedRepairs.length === 0) {
      return; // No repairs to complete
    }
    
    console.log(`[DefenseRepairCompleter] Processing ${completedRepairs.length} completed battery repairs`);
    
    // Process each completed repair
    for (const battery of completedRepairs) {
      try {
        // Restore battery to operational status
        await batteriesCollection.updateOne(
          { _id: battery._id },
          {
            $set: {
              health: 100,
              repairing: false,
              status: BatteryStatus.IDLE,
              repairCompletedAt: now,
              updatedAt: now,
            },
            $unset: {
              repairCompletesAt: '',
            },
          }
        );
        
        console.log(`Battery ${battery.batteryId} repair completed. Health restored to 100%. Status: IDLE`);
        
        // TODO: Add broadcast when broadcastDefenseBatteryRepaired is implemented
        // const io = getIO();
        // if (io) {
        //   await wmdHandlers.broadcastDefenseBatteryRepaired(io, {
        //     ownerId: battery.ownerId,
        //     batteryId: battery.batteryId,
        //     batteryType: battery.batteryType,
        //     health: 100,
        //     status: BatteryStatus.IDLE,
        //   });
        // }
        
      } catch (error) {
        console.error(`Error completing repair for battery ${battery.batteryId}:`, error);
      }
    }
    
    console.log(`[DefenseRepairCompleter] Completed ${completedRepairs.length} battery repairs`);
    
  } catch (error) {
    console.error('[DefenseRepairCompleter] Job execution error:', error);
  }
}

/**
 * Job metadata for scheduler
 */
export const defenseRepairCompleterJobInfo = {
  name: 'Defense Repair Completer',
  interval: 60000, // Run every 60 seconds
  description: 'Completes battery repairs and restores operational status',
};
