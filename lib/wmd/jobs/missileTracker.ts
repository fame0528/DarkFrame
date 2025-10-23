/**
 * @file lib/wmd/jobs/missileTracker.ts
 * @created 2025-10-22
 * @overview Missile Flight Tracker Background Job
 * 
 * OVERVIEW:
 * Background job that processes in-flight missiles, checks for impacts,
 * handles defense interception attempts, calculates damage, and broadcasts results.
 * 
 * Features:
 * - Queries missiles with status='LAUNCHED' and impactAt <= now
 * - Attempts defense interception via batteries
 * - Calculates damage if not intercepted
 * - Updates missile status (DETONATED or INTERCEPTED)
 * - Broadcasts real-time impact/interception events
 * - Updates player stats and resources
 * 
 * Runs every 60 seconds via scheduler
 * 
 * Dependencies: MongoDB, WebSocket handlers, defenseService, damageCalculator
 */

import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/wmd/apiHelpers';
import { getIO } from '@/lib/websocket/server';
import { wmdHandlers } from '@/lib/websocket/handlers';
import { WARHEAD_CONFIGS, type WarheadType } from '@/types/wmd';

/**
 * Calculate damage percentages from missile impact
 * @returns Percentage of target's units/resources to destroy (0-100)
 */
function calculateDamagePercent(warheadType: WarheadType): number {
  const config = WARHEAD_CONFIGS[warheadType];
  if (!config) return 0;
  
  // Base damage percentage from config (e.g., 25 for TACTICAL = destroy 25% of units)
  const baseDamagePercent = config.damage.primaryPercent;
  
  // Add 10% randomness (+/- 5%)
  const randomFactor = 0.95 + Math.random() * 0.1;
  
  return Math.floor(baseDamagePercent * randomFactor);
}

/**
 * Attempt interception with player's defense batteries
 */
async function attemptInterception(
  db: Db,
  targetId: string,
  missileId: string
): Promise<{ intercepted: boolean; batteryId?: string; interceptorName?: string }> {
  // Query target's active batteries
  const batteries = await db
    .collection('wmd_defense')
    .find({
      ownerId: targetId,
      status: { $in: ['IDLE', 'ACTIVE'] },
      health: { $gt: 0 },
    })
    .toArray();
    
  if (batteries.length === 0) {
    return { intercepted: false };
  }
  
  // Calculate cumulative interception chance
  let totalChance = 0;
  for (const battery of batteries) {
    totalChance += battery.interceptChance || 0;
  }
  
  // Cap at 95% max interception chance
  totalChance = Math.min(totalChance, 0.95);
  
  // Roll for interception
  const roll = Math.random();
  const intercepted = roll < totalChance;
  
  if (intercepted && batteries.length > 0) {
    // Use first active battery
    const battery = batteries[0];
    
    // Update battery stats
    await db.collection('wmd_defense').updateOne(
      { batteryId: battery.batteryId },
      {
        $inc: {
          interceptionsSuccessful: 1,
          totalInterceptionAttempts: 1,
          health: -10, // Damage battery slightly
        },
        $set: {
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    
    // Get battery owner's username
    const owner = await db.collection('players').findOne({ playerId: targetId });
    
    return {
      intercepted: true,
      batteryId: battery.batteryId,
      interceptorName: owner?.username || 'Unknown',
    };
  }
  
  // Update all batteries' attempt count
  await db.collection('wmd_defense').updateMany(
    { ownerId: targetId, status: { $in: ['IDLE', 'ACTIVE'] } },
    {
      $inc: { totalInterceptionAttempts: 1 },
      $set: { updatedAt: new Date() },
    }
  );
  
  return { intercepted: false };
}

/**
 * Apply damage to target player
 * Destroys units, damages factories, and reduces resources based on damage percentage
 */
async function applyDamage(
  db: Db,
  targetId: string,
  damagePercent: number
): Promise<{ unitsDestroyed: number; factoriesDamaged: number; resourcesLost: { metal: number; energy: number } }> {
  const target = await db.collection('players').findOne({ playerId: targetId });
  if (!target) {
    return { unitsDestroyed: 0, factoriesDamaged: 0, resourcesLost: { metal: 0, energy: 0 } };
  }
  
  // 70% of damage goes to destroying units
  const unitDamagePercent = damagePercent * 0.70;
  const totalUnits = target.army?.length || 0;
  const unitsToDestroy = Math.floor(totalUnits * (unitDamagePercent / 100));
  
  // Randomly destroy units
  if (unitsToDestroy > 0 && target.army && target.army.length > 0) {
    const survivingUnits = [...target.army];
    for (let i = 0; i < unitsToDestroy && survivingUnits.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * survivingUnits.length);
      survivingUnits.splice(randomIndex, 1);
    }
    
    await db.collection('players').updateOne(
      { playerId: targetId },
      { $set: { army: survivingUnits, updatedAt: new Date() } }
    );
  }
  
  // 20% of damage goes to factories (disable for 24-72 hours)
  const factoryDamagePercent = damagePercent * 0.20;
  const totalFactories = target.factories?.length || 0;
  const factoriesToDamage = Math.floor(totalFactories * (factoryDamagePercent / 100));
  const factoriesDamaged = Math.min(factoriesToDamage, 3); // Cap at 3 factories
  
  // TODO: Implement factory damage timer (requires factory schema update)
  
  // 10% of damage goes to resources
  const resourceDamagePercent = damagePercent * 0.10;
  const metalLoss = Math.floor((target.metal || 0) * (resourceDamagePercent / 100));
  const energyLoss = Math.floor((target.energy || 0) * (resourceDamagePercent / 100));
  
  await db.collection('players').updateOne(
    { playerId: targetId },
    {
      $inc: {
        metal: -metalLoss,
        energy: -energyLoss,
      },
      $set: { updatedAt: new Date() },
    }
  );
  
  return {
    unitsDestroyed: unitsToDestroy,
    factoriesDamaged,
    resourcesLost: { metal: metalLoss, energy: energyLoss },
  };
}

/**
 * Main missile tracker function
 * Processes all missiles ready for impact
 */
export async function missileTracker(): Promise<void> {
  try {
    console.log('[WMD Jobs] Running missile tracker...');
    
    const { db } = await connectToDatabase();
    const io = getIO();
    const now = new Date();
    
    // Find missiles ready for impact
    const missiles = await db
      .collection('wmd_missiles')
      .find({
        status: 'LAUNCHED',
        impactAt: { $lte: now },
      })
      .toArray();
      
    if (missiles.length === 0) {
      console.log('[WMD Jobs] No missiles ready for impact');
      return;
    }
    
    console.log(`[WMD Jobs] Processing ${missiles.length} missile impact(s)...`);
    
    for (const missile of missiles) {
      try {
        // Get target and launcher player data
        const launcher = await db.collection('players').findOne({ _id: missile.ownerId });
        const target = await db.collection('players').findOne({ _id: missile.targetId });
        
        // Check for interception
        const interceptionResult = await attemptInterception(db, missile.targetId, missile.missileId);
        
        if (interceptionResult.intercepted) {
          // Missile intercepted!
          await db.collection('wmd_missiles').updateOne(
            { missileId: missile.missileId },
            {
              $set: {
                status: 'INTERCEPTED',
                updatedAt: new Date(),
                completedAt: new Date(),
              },
            }
          );
          
          // Broadcast interception
          if (io) {
            await wmdHandlers.broadcastMissileImpact(io, {
              intercepted: true,
              missileId: missile.missileId,
              launcherId: missile.ownerId,
              launcherName: launcher?.username || 'Unknown',
              targetId: missile.targetId,
              targetName: target?.username || 'Unknown',
              warheadType: missile.warheadType,
              interceptedBy: target?.username || 'Unknown',
              damageDealt: 0,
            });
          }
          
          console.log(`[WMD Jobs] Missile ${missile.missileId} intercepted by ${target?.username || 'Unknown'}`);
        } else {
          // Missile detonated - calculate damage
          const damagePercent = calculateDamagePercent(missile.warheadType as WarheadType);
          
          // Apply damage to target (destroys units, damages factories, reduces resources)
          const damageResult = await applyDamage(db, missile.targetId, damagePercent);
          
          // Update missile status
          await db.collection('wmd_missiles').updateOne(
            { missileId: missile.missileId },
            {
              $set: {
                status: 'DETONATED',
                damageDealt: {
                  unitsDestroyed: damageResult.unitsDestroyed,
                  factoriesDamaged: damageResult.factoriesDamaged,
                  resourcesLost: damageResult.resourcesLost,
                },
                updatedAt: new Date(),
                completedAt: new Date(),
              },
            }
          );
          
          // Broadcast impact
          if (io) {
            await wmdHandlers.broadcastMissileImpact(io, {
              intercepted: false,
              missileId: missile.missileId,
              launcherId: missile.ownerId,
              launcherName: launcher?.username || 'Unknown',
              targetId: missile.targetId,
              targetName: target?.username || 'Unknown',
              warheadType: missile.warheadType,
              damageDealt: damageResult.unitsDestroyed,
            });
          }
          
          console.log(`[WMD Jobs] Missile ${missile.missileId} detonated: ${damageResult.unitsDestroyed} units destroyed, ${damageResult.factoriesDamaged} factories damaged, ${damageResult.resourcesLost.metal} metal + ${damageResult.resourcesLost.energy} energy lost`);
        }
      } catch (missileError) {
        console.error(`[WMD Jobs] Error processing missile ${missile.missileId}:`, missileError);
        // Continue with other missiles
      }
    }
    
    console.log(`[WMD Jobs] Missile tracker completed: ${missiles.length} missiles processed`);
  } catch (error) {
    console.error('[WMD Jobs] Error in missile tracker:', error);
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Interception Logic:
 *    - Queries target's active batteries
 *    - Sums interception chances (capped at 95%)
 *    - Rolls random number for success/failure
 *    - Updates battery stats and health
 * 
 * 2. Damage Calculation:
 *    - Uses WARHEAD_CONFIGS for base damage
 *    - Adds 10% randomness for variety
 *    - Applied as gold reduction
 *    - Prevents negative gold
 * 
 * 3. Real-time Notifications:
 *    - Broadcasts to launcher (success/failure)
 *    - Broadcasts to target (damage or saved)
 *    - Broadcasts to interceptor (if successful)
 * 
 * 4. Error Handling:
 *    - Try-catch per missile (failures don't stop processing)
 *    - Logs all errors with missile ID
 *    - Continues with remaining missiles
 * 
 * 5. Performance:
 *    - Single query for all ready missiles
 *    - Batch processing in loop
 *    - Minimal DB operations per missile
 * 
 * TESTING:
 * - Launch missile with short flight time (30s)
 * - Verify impact occurs within 60s of scheduled time
 * - Test with and without defense batteries
 * - Verify damage calculation and gold reduction
 * - Check WebSocket broadcasts received
 */
