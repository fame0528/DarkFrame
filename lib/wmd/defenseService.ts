/**
 * @file lib/wmd/defenseService.ts
 * @created 2025-10-22
 * @overview WMD Defense Service - Clan Treasury Integrated
 * 
 * OVERVIEW:
 * Handles defense battery deployment and interception mechanics.
 * ALL costs deducted from CLAN TREASURY with equal cost sharing among members.
 * 
 * Features:
 * - Battery deployment via clan bank funding
 * - Battery repairs funded by clan treasury
 * - Interception attempts
 * - Defense status tracking
 * 
 * Clan Treasury Integration:
 * - All battery purchases deducted from clan bank (NOT player resources)
 * - Repair costs paid from clan treasury
 * - Per-member cost calculated: totalCost / memberCount
 * - Minimum 3 clan members required (prevents solo WMD)
 * - Transaction transparency (shows per-member contribution)
 * 
 * Dependencies:
 * - /types/wmd for defense types
 * - clanTreasuryWMDService for funding validation/deduction
 * - MongoDB for persistence
 */

import { Db } from 'mongodb';
import {
  DefenseBattery,
  BatteryType,
  BatteryStatus,
  InterceptionResult,
  BATTERY_CONFIGS,
} from '@/types/wmd';
import {
  validateClanWMDFunds,
  deductWMDCost,
  WMDPurchaseType,
} from './clanTreasuryWMDService';

/**
 * Deploy a defense battery (clan treasury funded)
 */
export async function deployBattery(
  db: Db,
  playerId: string,
  playerUsername: string,
  clanId: string,
  batteryType: BatteryType
): Promise<{ success: boolean; message: string; batteryId?: string; perMemberCost?: { metal: number; energy: number } }> {
  try {
    const batteryConfig = BATTERY_CONFIGS[batteryType];
    
    if (!batteryConfig) {
      return { success: false, message: 'Invalid battery type' };
    }
    
    // Validate clan has funds
    const validation = await validateClanWMDFunds(db, clanId, batteryConfig.cost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // Deduct from clan treasury
    const deduction = await deductWMDCost(
      db,
      clanId,
      WMDPurchaseType.DEFENSE_BATTERY,
      playerId,
      playerUsername,
      batteryConfig.cost,
      `${batteryType} Defense Battery Deployment`
    );
    
    if (!deduction.success) {
      return { success: false, message: deduction.message || 'Failed to deduct funds' };
    }
    
    const batteryId = `battery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const battery: DefenseBattery = {
      ownerId: playerId,
      ownerClanId: clanId,
      batteryType,
      tier: batteryConfig.tier,
      status: BatteryStatus.IDLE,
      interceptChance: batteryConfig.interceptChance,
      successfulIntercepts: 0,
      failedIntercepts: 0,
      totalAttempts: 0,
      cooldownDuration: batteryConfig.cooldownDuration,
      health: 100,
      repairing: false,
      upgrading: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await db.collection('wmd_defense_batteries').insertOne({ ...battery, batteryId });
    
    console.log(`Battery deployed by ${playerUsername} (Clan: ${clanId}). Per-member cost: ${deduction.perMemberCost?.metal || 0} metal, ${deduction.perMemberCost?.energy || 0} energy`);
    
    return {
      success: true,
      message: `${batteryType} battery deployed. Clan cost: ${batteryConfig.cost.metal} metal, ${batteryConfig.cost.energy} energy`,
      batteryId,
      perMemberCost: deduction.perMemberCost,
    };
  } catch (error) {
    console.error('Error deploying battery:', error);
    return { success: false, message: 'Failed to deploy battery' };
  }
}

/**
 * Attempt missile interception
 */
export async function attemptInterception(
  db: Db,
  missileId: string,
  defenderId: string
): Promise<{ success: boolean; result: InterceptionResult; message: string }> {
  try {
    // Get defender's active batteries
    const batteries = await db
      .collection('wmd_defense_batteries')
      .find({
        ownerId: defenderId,
        status: BatteryStatus.IDLE,
        health: { $gt: 0 },
      })
      .toArray();
    
    if (batteries.length === 0) {
      return {
        success: false,
        result: InterceptionResult.FAILURE,
        message: 'No active defenses available',
      };
    }
    
    // Try each battery
    for (const battery of batteries) {
      const success = Math.random() < battery.interceptChance;
      
      // Update battery stats
      await db.collection('wmd_defense_batteries').updateOne(
        { _id: battery._id },
        {
          $inc: {
            totalAttempts: 1,
            successfulIntercepts: success ? 1 : 0,
            failedIntercepts: success ? 0 : 1,
          },
          $set: {
            status: BatteryStatus.COOLDOWN,
            lastFired: new Date(),
            cooldownUntil: new Date(Date.now() + battery.cooldownDuration),
            updatedAt: new Date(),
          },
        }
      );
      
      if (success) {
        // Record successful interception
        await db.collection('wmd_interceptions').insertOne({
          interceptionId: `intercept_${Date.now()}`,
          missileId,
          defenderId,
          batteryId: battery._id.toString(),
          result: InterceptionResult.SUCCESS,
          timestamp: new Date(),
        });
        
        return {
          success: true,
          result: InterceptionResult.SUCCESS,
          message: 'Missile intercepted!',
        };
      }
    }
    
    return {
      success: false,
      result: InterceptionResult.FAILURE,
      message: 'All interception attempts failed',
    };
  } catch (error) {
    console.error('Error attempting interception:', error);
    return {
      success: false,
      result: InterceptionResult.MALFUNCTION,
      message: 'Interception system malfunction',
    };
  }
}

/**
 * Get player's defense batteries
 */
export async function getPlayerBatteries(
  db: Db,
  ownerId: string
): Promise<any[]> {
  try {
    return await db
      .collection('wmd_defense_batteries')
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .toArray();
  } catch (error) {
    console.error('Error fetching batteries:', error);
    return [];
  }
}

/**
 * Repair battery (clan treasury funded)
 */
export async function repairBattery(
  db: Db,
  batteryId: string,
  playerId: string,
  playerUsername: string
): Promise<{ success: boolean; message: string; perMemberCost?: { metal: number; energy: number } }> {
  try {
    const battery = await db.collection('wmd_defense_batteries').findOne({ batteryId }) as unknown as any;
    
    if (!battery) {
      return { success: false, message: 'Battery not found' };
    }
    
    if (battery.health >= 100) {
      return { success: false, message: 'Battery at full health' };
    }
    
    // Calculate repair cost based on damage
    const batteryConfig = BATTERY_CONFIGS[battery.batteryType as BatteryType];
    const damagePercent = (100 - battery.health) / 100;
    const repairCost = {
      metal: Math.floor(batteryConfig.cost.metal * damagePercent * 0.5), // 50% of deployment cost * damage%
      energy: Math.floor(batteryConfig.cost.energy * damagePercent * 0.5),
    };
    
    // Validate clan has funds
    const validation = await validateClanWMDFunds(db, battery.ownerClanId, repairCost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // Deduct from clan treasury
    const deduction = await deductWMDCost(
      db,
      battery.ownerClanId,
      WMDPurchaseType.DEFENSE_BATTERY,
      playerId,
      playerUsername,
      repairCost,
      `${battery.batteryType} Battery Repair (${Math.floor(damagePercent * 100)}% damage)`
    );
    
    if (!deduction.success) {
      return { success: false, message: deduction.message || 'Failed to deduct funds' };
    }
    
    // Calculate repair time (1 minute per 10% damage)
    const repairMinutes = Math.ceil(damagePercent * 10);
    const repairCompletesAt = new Date(Date.now() + repairMinutes * 60 * 1000);
    
    await db.collection('wmd_defense_batteries').updateOne(
      { batteryId },
      {
        $set: {
          repairing: true,
          repairCompletesAt,
          status: BatteryStatus.DAMAGED,
          updatedAt: new Date(),
        },
      }
    );
    
    console.log(`Battery repair started by ${playerUsername}. Completes in ${repairMinutes} minutes. Per-member cost: ${deduction.perMemberCost?.metal || 0} metal, ${deduction.perMemberCost?.energy || 0} energy`);
    
    return {
      success: true,
      message: `Battery repair initiated. Completes in ${repairMinutes} minutes. Clan cost: ${repairCost.metal} metal, ${repairCost.energy} energy`,
      perMemberCost: deduction.perMemberCost,
    };
  } catch (error) {
    console.error('Error repairing battery:', error);
    return { success: false, message: 'Failed to repair battery' };
  }
}

/**
 * Dismantle battery
 */
export async function dismantleBattery(
  db: Db,
  batteryId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.collection('wmd_defense_batteries').deleteOne({ batteryId });
    
    if (result.deletedCount === 0) {
      return { success: false, message: 'Battery not found' };
    }
    
    return {
      success: true,
      message: 'Battery dismantled',
    };
  } catch (error) {
    console.error('Error dismantling battery:', error);
    return { success: false, message: 'Failed to dismantle battery' };
  }
}
