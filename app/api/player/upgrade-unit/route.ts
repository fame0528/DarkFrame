/**
 * @file app/api/player/upgrade-unit/route.ts
 * @created 2025-10-17
 * @overview API endpoint for purchasing STR/DEF unit upgrades
 * 
 * OVERVIEW:
 * Allows players to spend resources (metal + energy) to permanently increase
 * their total strength or defense. Cost scales exponentially with current level.
 * 
 * Upgrade Costs:
 * - Base cost: 1000 metal + 1000 energy
 * - Cost multiplier: 1.15x per existing point
 * - Formula: baseCost * (1.15 ^ currentValue)
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

/**
 * Calculate upgrade cost based on current stat value
 */
function calculateUpgradeCost(currentValue: number): { metal: number; energy: number } {
  const baseCost = 1000;
  const multiplier = Math.pow(1.15, currentValue);
  const cost = Math.floor(baseCost * multiplier);
  
  return {
    metal: cost,
    energy: cost
  };
}

/**
 * POST /api/player/upgrade-unit
 * Purchase a single point of STR or DEF
 * 
 * Body: {
 *   username: string,
 *   type: 'strength' | 'defense'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, type } = body;

    // Validation
    if (!username || !type) {
      return NextResponse.json(
        { error: 'Username and type are required' },
        { status: 400 }
      );
    }

    if (type !== 'strength' && type !== 'defense') {
      return NextResponse.json(
        { error: 'Type must be "strength" or "defense"' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const playersCollection = db.collection('players');

    // Get player
    const player = await playersCollection.findOne({ username });
    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Calculate cost
    const currentValue = type === 'strength' ? (player.totalStrength || 0) : (player.totalDefense || 0);
    const cost = calculateUpgradeCost(currentValue);

    // Check if player has enough resources
    const playerMetal = player.resources?.metal || 0;
    const playerEnergy = player.resources?.energy || 0;
    
    if (playerMetal < cost.metal || playerEnergy < cost.energy) {
      return NextResponse.json(
        { 
          error: 'Insufficient resources',
          required: cost,
          available: { metal: playerMetal, energy: playerEnergy }
        },
        { status: 400 }
      );
    }

    // Perform upgrade
    const updateField = type === 'strength' ? 'totalStrength' : 'totalDefense';
    const result = await playersCollection.updateOne(
      { _id: new ObjectId(player._id) },
      {
        $inc: {
          [updateField]: 1,
          'resources.metal': -cost.metal,
          'resources.energy': -cost.energy
        }
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to upgrade' },
        { status: 500 }
      );
    }

    // Calculate next upgrade cost
    const nextCost = calculateUpgradeCost(currentValue + 1);

    return NextResponse.json({
      success: true,
      type,
      newValue: currentValue + 1,
      cost,
      nextCost,
      remainingResources: {
        metal: playerMetal - cost.metal,
        energy: playerEnergy - cost.energy
      }
    });

  } catch (error) {
    console.error('❌ Error upgrading unit:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/player/upgrade-unit?username=X&type=strength
 * Get upgrade cost without purchasing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const type = searchParams.get('type');

    if (!username || !type) {
      return NextResponse.json(
        { error: 'Username and type are required' },
        { status: 400 }
      );
    }

    if (type !== 'strength' && type !== 'defense') {
      return NextResponse.json(
        { error: 'Type must be "strength" or "defense"' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const player = await db.collection('players').findOne({ username });

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const currentValue = type === 'strength' ? (player.totalStrength || 0) : (player.totalDefense || 0);
    const cost = calculateUpgradeCost(currentValue);

    return NextResponse.json({
      type,
      currentValue,
      cost,
      canAfford: (player.resources?.metal || 0) >= cost.metal && (player.resources?.energy || 0) >= cost.energy,
      available: { metal: player.resources?.metal || 0, energy: player.resources?.energy || 0 }
    });

  } catch (error) {
    console.error('❌ Error getting upgrade cost:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
