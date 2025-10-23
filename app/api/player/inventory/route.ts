/**
 * API Route: Player Inventory
 * Created: 2025-01-19
 * 
 * OVERVIEW:
 * Provides player inventory data including items, resources, and equipment.
 * Returns empty inventory structure if player not found or has no items.
 */

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

/**
 * GET /api/player/inventory
 * Fetches the authenticated player's inventory
 */
export async function GET(request: NextRequest) {
  try {
    const playerId = request.cookies.get('playerId')?.value;

    if (!playerId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const client = await clientPromise;
    const db = client.db('darkframe');
    
    const player = await db.collection('players').findOne(
      { username: playerId },
      { projection: { inventory: 1 } }
    );

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Return inventory or empty structure if none exists
    const inventory = player.inventory || {
      items: [],
      resources: [],
      equipment: {
        weapon: null,
        armor: null,
        accessory: null
      },
      capacity: 100,
      used: 0,
      gatheringBonus: {
        metalBonus: 0,
        energyBonus: 0
      },
      activeBoosts: {
        gatheringBoost: null,
        expiresAt: null
      },
      metalDiggerCount: 0,
      energyDiggerCount: 0
    };

    // Ensure gatheringBonus exists (for older player records)
    if (!inventory.gatheringBonus) {
      inventory.gatheringBonus = {
        metalBonus: 0,
        energyBonus: 0
      };
    }

    // Ensure activeBoosts exists (for older player records)
    if (!inventory.activeBoosts) {
      inventory.activeBoosts = {
        gatheringBoost: null,
        expiresAt: null
      };
    }

    // Ensure digger counts exist (for older player records)
    if (typeof inventory.metalDiggerCount === 'undefined') {
      inventory.metalDiggerCount = 0;
    }
    if (typeof inventory.energyDiggerCount === 'undefined') {
      inventory.energyDiggerCount = 0;
    }

    return NextResponse.json(inventory);

  } catch (error) {
    console.error('Error fetching player inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - Returns structured inventory data with items, resources, and equipment
 * - Gracefully handles missing inventory by returning empty structure
 * - Authentication via playerId cookie
 * - TODO: Add inventory update endpoints (POST/PUT) when needed
 * - TODO: Add inventory capacity management
 */
