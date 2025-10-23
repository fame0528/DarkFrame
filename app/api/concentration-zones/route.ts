/**
 * @file app/api/concentration-zones/route.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * API endpoints for Bot Concentration Zone management.
 * 
 * ENDPOINTS:
 * - GET: Get player's current zones
 * - POST: Set new zones (replaces existing)
 * - DELETE: Clear all zones
 * 
 * AUTH: All endpoints require authentication
 * TECH: POST requires 'bot-concentration-zones' technology
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { type Player } from '@/types/game.types';
import {
  setConcentrationZones,
  getConcentrationZones,
  clearConcentrationZones,
  type ConcentrationZone,
} from '@/lib/concentrationZoneService';

/**
 * GET - Get player's concentration zones
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const zones = await getConcentrationZones(player._id);

    return NextResponse.json({
      success: true,
      zones,
    });
  } catch (error) {
    console.error('Error getting concentration zones:', error);
    return NextResponse.json(
      { error: 'Failed to get concentration zones' },
      { status: 500 }
    );
  }
}

/**
 * POST - Set concentration zones
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Check tech requirement
    const unlockedTechs = player.unlockedTechs || [];
    if (!unlockedTechs.includes('bot-concentration-zones')) {
      return NextResponse.json(
        { error: 'Requires Bot Concentration Zones technology' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { zones } = body;

    // Validate zones array
    if (!Array.isArray(zones)) {
      return NextResponse.json(
        { error: 'Zones must be an array' },
        { status: 400 }
      );
    }

    // Validate zone structure
    for (const zone of zones) {
      if (
        typeof zone.centerX !== 'number' ||
        typeof zone.centerY !== 'number' ||
        !Number.isInteger(zone.centerX) ||
        !Number.isInteger(zone.centerY)
      ) {
        return NextResponse.json(
          { error: 'Invalid zone coordinates. Must be integers.' },
          { status: 400 }
        );
      }
    }

    const result = await setConcentrationZones(player._id, zones);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      zones: result.zones,
    });
  } catch (error) {
    console.error('Error setting concentration zones:', error);
    return NextResponse.json(
      { error: 'Failed to set concentration zones' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Clear concentration zones
 */
export async function DELETE(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser();

    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const result = await clearConcentrationZones(player._id);

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error clearing concentration zones:', error);
    return NextResponse.json(
      { error: 'Failed to clear concentration zones' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - GET: Returns array of player's zones (empty if none)
 * - POST: Validates tech, zone count (max 3), coordinates, overlaps, bounds
 * - DELETE: Removes all zones (no tech check required)
 * - All endpoints require authentication
 * - Tech requirement: 'bot-concentration-zones'
 * - Zone validation: no overlaps, within map bounds, max 3 zones
 * - Replaces all existing zones (not additive)
 */
