/**
 * @file app/api/harvest/status/route.ts
 * @created 2025-10-16
 * @overview API endpoint to check harvest availability for current tile
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlayer } from '@/lib/playerService';
import { getTileAt } from '@/lib/movementService';
import { getHarvestStatus } from '@/lib/harvestService';

/**
 * GET /api/harvest/status
 * 
 * Query Parameters:
 * - username: Player username
 * 
 * Returns harvest availability status for current tile
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    if (!username) {
      return NextResponse.json(
        { success: false, message: 'Username is required' },
        { status: 400 }
      );
    }
    
    // Get player
    const player = await getPlayer(username);
    if (!player) {
      return NextResponse.json(
        { success: false, message: 'Player not found' },
        { status: 404 }
      );
    }
    
    // Get current tile
    const tile = await getTileAt(
      player.currentPosition.x,
      player.currentPosition.y
    );
    
    if (!tile) {
      return NextResponse.json(
        { success: false, message: 'Tile not found' },
        { status: 404 }
      );
    }
    
    // Get harvest status
    const status = await getHarvestStatus(player.username, tile);
    
    // Calculate next reset time as Date
    const nextResetTime = new Date(Date.now() + status.timeUntilReset);
    
    return NextResponse.json({
      success: true,
      canHarvest: status.canHarvest,
      resetPeriod: status.resetPeriod,
      timeUntilReset: status.timeUntilReset,
      nextResetTime: nextResetTime.toISOString()
    });
    
  } catch (error) {
    console.error('Harvest status check error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to check harvest status' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
