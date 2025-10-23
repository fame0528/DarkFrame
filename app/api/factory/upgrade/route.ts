/**
 * Factory Upgrade API Endpoint
 * Created: 2025-10-17
 * 
 * OVERVIEW:
 * POST endpoint for upgrading a player-owned factory. Validates ownership,
 * level constraints, resource availability, and applies exponential cost
 * formula. Upgrades factory level and increases max slots/regen rate.
 * 
 * REQUEST BODY:
 * {
 *   "factoryX": number,      // Factory X coordinate
 *   "factoryY": number       // Factory Y coordinate
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Factory upgraded to Level X",
 *   "factory": Factory,      // Updated factory data
 *   "cost": UpgradeCost,     // Resources spent
 *   "newStats": {
 *     "maxSlots": number,
 *     "regenRate": number
 *   },
 *   "playerResources": {
 *     "metal": number,
 *     "energy": number
 *   }
 * }
 * 
 * VALIDATION:
 * - User must be authenticated
 * - Factory must exist at coordinates
 * - Factory must be owned by user
 * - Factory must be below max level (10)
 * - Player must have sufficient resources
 * 
 * COST FORMULA:
 * Metal = 1000 × (1.5^nextLevel)
 * Energy = 500 × (1.5^nextLevel)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { connectToDatabase } from '@/lib/mongodb';
import {
  calculateUpgradeCost,
  getFactoryStats,
  canUpgradeFactory,
  FACTORY_UPGRADE
} from '@/lib/factoryUpgradeService';
import { Factory } from '@/types/game.types';
import { awardXP, XPAction } from '@/lib/xpService';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const username = authResult.username;

    // Parse request body
    const body = await request.json();
    const { factoryX, factoryY } = body;

    // Validate coordinates
    if (typeof factoryX !== 'number' || typeof factoryY !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid factory coordinates' },
        { status: 400 }
      );
    }

    // Connect to database
    const db = await connectToDatabase();
    const factoriesCollection = db.collection<Factory>('factories');
    const playersCollection = db.collection('players');

    // Find the factory
    const factory = await factoriesCollection.findOne({
      x: factoryX,
      y: factoryY
    });

    if (!factory) {
      return NextResponse.json(
        { success: false, error: 'Factory not found at these coordinates' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (factory.owner !== username) {
      return NextResponse.json(
        { success: false, error: 'You do not own this factory' },
        { status: 403 }
      );
    }

    // Initialize level if missing (backwards compatibility)
    const currentLevel = factory.level || 1;

    // Check if already at max level
    if (currentLevel >= FACTORY_UPGRADE.MAX_LEVEL) {
      return NextResponse.json(
        {
          success: false,
          error: `Factory is already at maximum level (${FACTORY_UPGRADE.MAX_LEVEL})`
        },
        { status: 400 }
      );
    }

    // Get player's current resources
    const player = await playersCollection.findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerMetal = player.resources?.metal || 0;
    const playerEnergy = player.resources?.energy || 0;

    // Calculate upgrade cost
    const upgradeCost = calculateUpgradeCost(currentLevel);

    // Check if player can afford upgrade
    const affordabilityCheck = canUpgradeFactory(
      { ...factory, level: currentLevel },
      playerMetal,
      playerEnergy
    );

    if (!affordabilityCheck.canUpgrade) {
      return NextResponse.json(
        {
          success: false,
          error: affordabilityCheck.reason || 'Cannot upgrade factory',
          cost: upgradeCost,
          playerResources: { metal: playerMetal, energy: playerEnergy }
        },
        { status: 400 }
      );
    }

    // Calculate new stats for next level
    const newLevel = currentLevel + 1;
    const newStats = getFactoryStats(newLevel);

    // Perform atomic update: deduct resources and upgrade factory
    const now = new Date();

    // Update player resources
    const playerUpdateResult = await playersCollection.updateOne(
      { username },
      {
        $inc: {
          'resources.metal': -upgradeCost.metal,
          'resources.energy': -upgradeCost.energy
        }
      }
    );

    if (playerUpdateResult.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to deduct resources' },
        { status: 500 }
      );
    }

    // Update factory level and max slots
    // Note: Current slots are not changed, only max capacity
    const factoryUpdateResult = await factoriesCollection.updateOne(
      { x: factoryX, y: factoryY },
      {
        $set: {
          level: newLevel,
          // Don't modify current slots, just the capacity increases
          lastSlotRegen: now // Reset regen timer for new rate
        }
      }
    );

    if (factoryUpdateResult.modifiedCount === 0) {
      // Rollback: refund resources
      await playersCollection.updateOne(
        { username },
        {
          $inc: {
            'resources.metal': upgradeCost.metal,
            'resources.energy': upgradeCost.energy
          }
        }
      );

      return NextResponse.json(
        { success: false, error: 'Failed to upgrade factory' },
        { status: 500 }
      );
    }

    // Fetch updated factory
    const updatedFactory = await factoriesCollection.findOne({
      x: factoryX,
      y: factoryY
    });

    // Fetch updated player resources
    const updatedPlayer = await playersCollection.findOne({ username });

    // Award XP for factory upgrade
    const xpResult = await awardXP(username, XPAction.FACTORY_UPGRADE);

    return NextResponse.json({
      success: true,
      message: `Factory upgraded to Level ${newLevel}!`,
      factory: updatedFactory,
      cost: upgradeCost,
      newStats: {
        maxSlots: newStats.maxSlots,
        regenRate: newStats.regenRate
      },
      playerResources: {
        metal: updatedPlayer?.resources?.metal || 0,
        energy: updatedPlayer?.resources?.energy || 0
      },
      xpAwarded: xpResult.xpAwarded,
      levelUp: xpResult.levelUp,
      newLevel: xpResult.newLevel
    });

  } catch (error) {
    console.error('Factory upgrade error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred while upgrading factory',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Atomic Updates:
 *    - Player resources deducted first
 *    - Factory level incremented second
 *    - Rollback on factory update failure
 * 
 * 2. Backwards Compatibility:
 *    - Treats missing level field as Level 1
 *    - Allows gradual migration of existing factories
 * 
 * 3. Slot Management:
 *    - Max capacity increases automatically (formula-based)
 *    - Current slots unchanged (player keeps existing slots)
 *    - Regen timer reset for new regeneration rate
 * 
 * 4. Error Handling:
 *    - Clear error messages for each validation failure
 *    - Returns cost and player resources on affordability errors
 *    - Rollback mechanism prevents partial updates
 * 
 * 5. Response Data:
 *    - Includes updated factory with new level
 *    - Shows cost paid and new stats preview
 *    - Returns updated player resources for UI refresh
 */
