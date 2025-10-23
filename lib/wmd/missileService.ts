/**
 * @file lib/wmd/missileService.ts
 * @created 2025-10-22
 * @overview WMD Missile Service - Clan Treasury Integrated
 * 
 * OVERVIEW:
 * Handles missile assembly, launch operations, and lifecycle management.
 * ALL costs deducted from CLAN TREASURY with equal cost sharing among members.
 * 
 * Features:
 * - Missile creation via clan bank funding
 * - Component assembly with per-member cost tracking
 * - Launch mechanics with clan authorization
 * - Status tracking
 * 
 * Clan Treasury Integration:
 * - All component purchases deducted from clan bank (NOT player resources)
 * - Per-member cost calculated: totalCost / memberCount
 * - Minimum 3 clan members required (prevents solo WMD)
 * - Transaction transparency (shows per-member contribution)
 * 
 * Dependencies:
 * - /types/wmd for missile types
 * - clanTreasuryWMDService for funding validation/deduction
 * - MongoDB for persistence
 */

import { Db, ObjectId } from 'mongodb';
import {
  Missile,
  MissileStatus,
  WarheadType,
  WARHEAD_CONFIGS,
  MissileComponent,
  COMPONENT_COSTS,
} from '@/types/wmd';
import {
  validateClanWMDFunds,
  deductWMDCost,
  WMDPurchaseType,
} from './clanTreasuryWMDService';

/**
 * Create a new missile (clan treasury funded)
 */
export async function createMissile(
  db: Db,
  playerId: string,
  playerUsername: string,
  clanId: string,
  warheadType: WarheadType
): Promise<{ success: boolean; message: string; missileId?: string; perMemberCost?: { metal: number; energy: number } }> {
  try {
    const warheadConfig = WARHEAD_CONFIGS[warheadType];
    
    if (!warheadConfig) {
      return { success: false, message: 'Invalid warhead type' };
    }
    
    // Initial missile creation cost (warhead base cost)
    const initialCost = warheadConfig.cost;
    
    // Validate clan has funds
    const validation = await validateClanWMDFunds(db, clanId, initialCost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // Deduct from clan treasury
    const deduction = await deductWMDCost(
      db,
      clanId,
      WMDPurchaseType.MISSILE_COMPONENT,
      playerId,
      playerUsername,
      initialCost,
      `${warheadType} Missile Creation`
    );
    
    if (!deduction.success) {
      return { success: false, message: deduction.message || 'Failed to deduct funds' };
    }
    
    // Create missile
    const missileId = `missile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const missile: Missile = {
      ownerId: playerId,
      ownerClanId: clanId,
      warheadType,
      status: MissileStatus.ASSEMBLING,
      components: {
        warhead: false,
        propulsion: false,
        guidance: false,
        payload: false,
        stealth: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await db.collection('wmd_missiles').insertOne({ ...missile, missileId });
    
    console.log(`Missile created by ${playerUsername} (Clan: ${clanId}). Per-member cost: ${deduction.perMemberCost?.metal || 0} metal, ${deduction.perMemberCost?.energy || 0} energy`);
    
    return {
      success: true,
      message: `${warheadType} missile created. Clan cost: ${initialCost.metal} metal, ${initialCost.energy} energy`,
      missileId,
      perMemberCost: deduction.perMemberCost,
    };
  } catch (error) {
    console.error('Error creating missile:', error);
    return { success: false, message: 'Failed to create missile' };
  }
}

/**
 * Assemble a component (clan treasury funded)
 */
export async function assembleComponent(
  db: Db,
  missileId: string,
  component: MissileComponent,
  playerId: string,
  playerUsername: string
): Promise<{ success: boolean; message: string; perMemberCost?: { metal: number; energy: number } }> {
  try {
    const missile = await db.collection('wmd_missiles').findOne({ missileId }) as unknown as any;
    
    if (!missile) {
      return { success: false, message: 'Missile not found' };
    }
    
    if (missile.components[component]) {
      return { success: false, message: 'Component already assembled' };
    }
    
    // Get component cost
    const componentConfig = COMPONENT_COSTS[component];
    const warheadConfig = WARHEAD_CONFIGS[missile.warheadType as WarheadType];
    
    if (!warheadConfig) {
      return { success: false, message: 'Invalid warhead type' };
    }
    
    // Calculate cost with tier multiplier
    const componentCost = {
      metal: Math.floor(componentConfig.baseCost.metal * Math.pow(componentConfig.tierMultiplier, warheadConfig.tier - 1)),
      energy: Math.floor(componentConfig.baseCost.energy * Math.pow(componentConfig.tierMultiplier, warheadConfig.tier - 1)),
    };
    
    // Validate clan funds
    const validation = await validateClanWMDFunds(db, missile.ownerClanId, componentCost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // Deduct from clan treasury
    const deduction = await deductWMDCost(
      db,
      missile.ownerClanId,
      WMDPurchaseType.MISSILE_COMPONENT,
      playerId,
      playerUsername,
      componentCost,
      `${component} component for ${missile.warheadType} missile`
    );
    
    if (!deduction.success) {
      return { success: false, message: deduction.message || 'Failed to deduct funds' };
    }
    
    // Assemble component
    await db.collection('wmd_missiles').updateOne(
      { missileId },
      {
        $set: {
          [`components.${component}`]: true,
          updatedAt: new Date(),
        },
      }
    );
    
    // Check if all components ready
    const updatedMissile = await db.collection('wmd_missiles').findOne({ missileId });
    if (updatedMissile) {
      const allReady = Object.values(updatedMissile.components).every((c: any) => c === true);
      
      if (allReady) {
        await db.collection('wmd_missiles').updateOne(
          { missileId },
          {
            $set: {
              status: MissileStatus.READY,
              completedAt: new Date(),
            },
          }
        );
      }
    }
    
    console.log(`Component ${component} assembled by ${playerUsername}. Per-member cost: ${deduction.perMemberCost?.metal || 0} metal, ${deduction.perMemberCost?.energy || 0} energy`);
    
    return {
      success: true,
      message: `${component} component assembled. Clan cost: ${componentCost.metal} metal, ${componentCost.energy} energy`,
      perMemberCost: deduction.perMemberCost,
    };
  } catch (error) {
    console.error('Error assembling component:', error);
    return { success: false, message: 'Failed to assemble component' };
  }
}

/**
 * Launch a missile
 */
export async function launchMissile(
  db: Db,
  missileId: string,
  targetId: string,
  launchedBy: string
): Promise<{ success: boolean; message: string }> {
  try {
    const missile = await db.collection('wmd_missiles').findOne({ missileId });
    
    if (!missile) {
      return { success: false, message: 'Missile not found' };
    }
    
    if (missile.status !== MissileStatus.READY) {
      return { success: false, message: 'Missile not ready for launch' };
    }
    
    const warheadConfig = WARHEAD_CONFIGS[missile.warheadType as WarheadType];
    const flightTime = warheadConfig.flightTime;
    const impactAt = new Date(Date.now() + flightTime);
    
    await db.collection('wmd_missiles').updateOne(
      { missileId },
      {
        $set: {
          status: MissileStatus.LAUNCHED,
          targetId,
          launchedBy,
          launchedAt: new Date(),
          impactAt,
          flightTime,
          updatedAt: new Date(),
        },
      }
    );
    
    return {
      success: true,
      message: `Missile launched. Impact in ${Math.floor(flightTime / 1000 / 60)} minutes`,
    };
  } catch (error) {
    console.error('Error launching missile:', error);
    return { success: false, message: 'Failed to launch missile' };
  }
}

/**
 * Get player's missiles
 */
export async function getPlayerMissiles(
  db: Db,
  ownerId: string
): Promise<any[]> {
  try {
    return await db
      .collection('wmd_missiles')
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .toArray();
  } catch (error) {
    console.error('Error fetching missiles:', error);
    return [];
  }
}

/**
 * Dismantle missile
 */
export async function dismantleMissile(
  db: Db,
  missileId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.collection('wmd_missiles').deleteOne({ missileId });
    
    if (result.deletedCount === 0) {
      return { success: false, message: 'Missile not found' };
    }
    
    return {
      success: true,
      message: 'Missile dismantled',
    };
  } catch (error) {
    console.error('Error dismantling missile:', error);
    return { success: false, message: 'Failed to dismantle missile' };
  }
}
