/**
 * @file app/api/inventory/route.ts
 * @created 2025-10-16
 * @overview Player inventory API endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { Player } from '@/types';

/**
 * GET /api/inventory?username=<username>
 * 
 * Retrieve player's inventory, gathering bonuses, and active boosts
 * 
 * Response:
 * {
 *   success: boolean,
 *   inventory: PlayerInventory,
 *   gatheringBonus: GatheringBonus,
 *   activeBoosts: ActiveBoosts
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');
    
    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }
    
    // Get player
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });
    
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      inventory: player.inventory,
      gatheringBonus: player.gatheringBonus,
      activeBoosts: player.activeBoosts
    });
    
  } catch (error) {
    console.error('❌ Error in inventory API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch inventory',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Returns full inventory data including items array
// - Includes gathering bonuses and active temporary boosts
// - Used by InventoryPanel component to display items
// ============================================================
// END OF FILE
// ============================================================
