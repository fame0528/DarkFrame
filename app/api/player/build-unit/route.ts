/**
 * @file app/api/player/build-unit/route.ts
 * @created 2025-10-17
 * @overview API endpoint for building units from the unit factory
 * 
 * OVERVIEW:
 * Handles unit building requests from the unit factory interface.
 * Validates resources, unlock status, and slot capacity before creating units.
 * Updates player's unit array and total STR/DEF stats.
 * 
 * Endpoints:
 * - POST: Build unit(s) by spending resources
 * - GET: Fetch available units and player unlock status
 */

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPlayer } from '@/lib/playerService';
import { UNIT_BLUEPRINTS, UnitBlueprint, UnitCategory } from '@/types/units.types';

/**
 * GET /api/player/build-unit
 * Fetches available units and player's unlock status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    const player = await getPlayer(username);
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Calculate which units are unlocked
    const playerLevel = player.level || 1;
    const playerRP = player.researchPoints || 0;

    const unitsWithStatus = Object.values(UNIT_BLUEPRINTS).map(unit => {
      const isUnlocked = !unit.unlockRequirement || (
        playerRP >= unit.unlockRequirement.researchPoints &&
        (!unit.unlockRequirement.level || playerLevel >= unit.unlockRequirement.level)
      );

      return {
        ...unit,
        isUnlocked,
        playerOwned: player.units?.filter((u) => u.unitId === unit.id).length || 0
      };
    });

    // Calculate unit slots: 100 base + (factoryCount * 50) additional slots
    const baseSlots = 100;
    const factoryBonus = (player.factoryCount || 0) * 50;
    const totalSlots = baseSlots + factoryBonus;
    const usedSlots = player.units?.length || 0;

    return NextResponse.json({
      success: true,
      units: unitsWithStatus,
      playerStats: {
        level: playerLevel,
        researchPoints: playerRP,
        resources: player.resources,
        totalStrength: player.totalStrength || 0,
        totalDefense: player.totalDefense || 0,
        availableSlots: totalSlots,
        usedSlots: usedSlots
      }
    });
  } catch (error) {
    console.error('Error fetching unit data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch unit data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/player/build-unit
 * Builds unit(s) by spending resources
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, unitTypeId, quantity = 1 } = body;

    // Validate input
    if (!username || !unitTypeId) {
      return NextResponse.json(
        { success: false, error: 'Username and unitTypeId are required' },
        { status: 400 }
      );
    }

    if (quantity < 1 || quantity > 100) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Get unit blueprint
    const unitBlueprint = UNIT_BLUEPRINTS[unitTypeId];
    if (!unitBlueprint) {
      return NextResponse.json(
        { success: false, error: 'Invalid unit type' },
        { status: 400 }
      );
    }

    // Get player data with factory count
    const player = await getPlayer(username);
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    // Check unlock status
    const playerLevel = player.level || 1;
    const playerRP = player.researchPoints || 0;

    if (unitBlueprint.unlockRequirement) {
      const rpRequired = unitBlueprint.unlockRequirement.researchPoints;
      const levelRequired = unitBlueprint.unlockRequirement.level || 0;

      if (playerRP < rpRequired) {
        return NextResponse.json(
          { success: false, error: `Requires ${rpRequired} research points (you have ${playerRP})` },
          { status: 403 }
        );
      }

      if (playerLevel < levelRequired) {
        return NextResponse.json(
          { success: false, error: `Requires level ${levelRequired} (you are level ${playerLevel})` },
          { status: 403 }
        );
      }
    }

    // Calculate unit slots: 100 base + (factoryCount * 50) additional slots
    const baseSlots = 100;
    const factoryBonus = (player.factoryCount || 0) * 50;
    const totalSlots = baseSlots + factoryBonus;
    const currentUnits = player.units || [];
    const usedSlots = currentUnits.length;

    if (usedSlots + quantity > totalSlots) {
      return NextResponse.json(
        { success: false, error: `Insufficient slots (${totalSlots - usedSlots} available, ${quantity} needed)` },
        { status: 400 }
      );
    }

    // Calculate total cost
    const totalMetalCost = unitBlueprint.metalCost * quantity;
    const totalEnergyCost = unitBlueprint.energyCost * quantity;

    const playerMetal = player.resources?.metal || 0;
    const playerEnergy = player.resources?.energy || 0;

    // Check resources
    if (playerMetal < totalMetalCost) {
      return NextResponse.json(
        { success: false, error: `Insufficient metal (need ${totalMetalCost.toLocaleString()}, have ${playerMetal.toLocaleString()})` },
        { status: 400 }
      );
    }

    if (playerEnergy < totalEnergyCost) {
      return NextResponse.json(
        { success: false, error: `Insufficient energy (need ${totalEnergyCost.toLocaleString()}, have ${playerEnergy.toLocaleString()})` },
        { status: 400 }
      );
    }

    // Create unit instances
    const newUnits = Array.from({ length: quantity }, () => ({
      unitId: unitBlueprint.id,
      name: unitBlueprint.name,
      category: unitBlueprint.category,
      rarity: unitBlueprint.rarity,
      strength: unitBlueprint.strength,
      defense: unitBlueprint.defense,
      createdAt: new Date()
    }));

    // Calculate new totals
    const strengthGained = unitBlueprint.strength * quantity;
    const defenseGained = unitBlueprint.defense * quantity;

    const newTotalStrength = (player.totalStrength || 0) + strengthGained;
    const newTotalDefense = (player.totalDefense || 0) + defenseGained;

    // Get database connection for update
    const client = await clientPromise;
    const db = client.db('darkframe');
    const playersCollection = db.collection('players');

    // Update player in database
    const updateResult = await playersCollection.updateOne(
      { username },
      {
        $push: { units: { $each: newUnits } } as any,
        $inc: {
          'resources.metal': -totalMetalCost,
          'resources.energy': -totalEnergyCost
        },
        $set: {
          totalStrength: newTotalStrength,
          totalDefense: newTotalDefense
        }
      }
    );

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to build units' },
        { status: 500 }
      );
    }

    // Return success with updated data
    return NextResponse.json({
      success: true,
      message: `Successfully built ${quantity}x ${unitBlueprint.name}!`,
      unitsBuilt: newUnits,
      costPaid: {
        metal: totalMetalCost,
        energy: totalEnergyCost
      },
      newStats: {
        totalStrength: newTotalStrength,
        totalDefense: newTotalDefense,
        resources: {
          metal: playerMetal - totalMetalCost,
          energy: playerEnergy - totalEnergyCost
        },
        usedSlots: usedSlots + quantity,
        availableSlots: totalSlots
      },
      statsGained: {
        strength: strengthGained,
        defense: defenseGained
      }
    });
  } catch (error) {
    console.error('Error building unit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to build unit' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// Implementation Notes:
// - Validates unlock requirements (RP + level)
// - Checks resource availability and slot capacity
// - Creates multiple unit instances for quantity > 1
// - Updates totalStrength/totalDefense immediately
// - Returns detailed success response with new stats
// ============================================================
