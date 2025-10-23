// ============================================================
// FILE: app/api/beer-bases/list/route.ts
// CREATED: 2025-01-23
// ============================================================
// OVERVIEW:
// API endpoint for fetching active Beer Bases with distance
// calculations from requesting player. Returns sorted list
// of Beer Bases with stats, location, and loot information.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Player } from '@/types/game.types';

/**
 * GET /api/beer-bases/list
 * Fetch all active Beer Bases with distance from player
 * 
 * Query params:
 * - username: Player username for distance calculations
 * 
 * Returns:
 * - success: boolean
 * - beerBases: Array of Beer Base data with distances
 * - totalCount: Total number of Beer Bases
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { success: false, error: 'Username required' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();

    // Get requesting player's position
    const player = await db.collection<Player>('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerPos = player.currentPosition;

    // Find all Beer Bases (special bots)
    const beerBases = await db
      .collection<Player>('players')
      .find({ isSpecialBase: true })
      .toArray();

    // Calculate distances and format response
    const beerBasesWithDistance = beerBases.map((base: Player) => {
      const dx = Math.abs(base.currentPosition.x - playerPos.x);
      const dy = Math.abs(base.currentPosition.y - playerPos.y);
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Determine power tier from username
      const powerTier = base.username.includes('-LEGENDARY-')
        ? 'LEGENDARY'
        : base.username.includes('-ULTRA-')
        ? 'ULTRA'
        : base.username.includes('-ELITE-')
        ? 'ELITE'
        : base.username.includes('-STRONG-')
        ? 'STRONG'
        : base.username.includes('-MID-')
        ? 'MID'
        : 'WEAK';

      return {
        username: base.username,
        position: base.currentPosition,
        distance: Math.round(distance),
        totalStrength: base.totalStrength,
        totalDefense: base.totalDefense,
        resources: base.resources,
        armySize: base.units?.reduce((sum: number, u: any) => sum + (u.quantity || 0), 0) || 0,
        powerTier,
        specialization: base.specialization || 'balanced',
        tier: base.rank || 1,
      };
    });

    // Sort by distance by default
    beerBasesWithDistance.sort((a: any, b: any) => a.distance - b.distance);

    return NextResponse.json({
      success: true,
      beerBases: beerBasesWithDistance,
      totalCount: beerBasesWithDistance.length,
    });
  } catch (error) {
    console.error('Error fetching Beer Bases:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Beer Bases' },
      { status: 500 }
    );
  }
}
