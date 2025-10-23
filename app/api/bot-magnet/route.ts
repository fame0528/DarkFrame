/**
 * @file app/api/bot-magnet/route.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * API endpoints for Bot Magnet beacon deployment and management.
 * 
 * ENDPOINTS:
 * - GET: Get beacon status for authenticated player
 * - POST: Deploy new beacon (requires bot-magnet tech)
 * - DELETE: Deactivate current beacon
 * 
 * AUTH: All endpoints require authentication
 * TECH: POST requires 'bot-magnet' technology unlocked
 */

import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { type Player } from '@/types/game.types';
import {
  deployBeacon,
  getBeaconStatus,
  deactivateBeacon,
} from '@/lib/botMagnetService';

/**
 * GET - Get beacon status
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

    // Fetch full player from database
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const status = await getBeaconStatus(player._id);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Error getting beacon status:', error);
    return NextResponse.json(
      { error: 'Failed to get beacon status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Deploy new beacon
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

    // Fetch full player from database
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
    if (!unlockedTechs.includes('bot-magnet')) {
      return NextResponse.json(
        { error: 'Requires Bot Magnet technology' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { x, y } = body;

    // Validate coordinates
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      return NextResponse.json(
        { error: 'Invalid coordinates. Must be integers.' },
        { status: 400 }
      );
    }

    // Deploy beacon
    const result = await deployBeacon(
      player._id,
      player.username,
      x,
      y
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      beacon: result.beacon,
    });
  } catch (error) {
    console.error('Error deploying beacon:', error);
    return NextResponse.json(
      { error: 'Failed to deploy beacon' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Deactivate beacon
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

    // Fetch full player from database
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username: tokenPayload.username });

    if (!player || !player._id) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    const result = await deactivateBeacon(player._id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Error deactivating beacon:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate beacon' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - GET: Returns beacon status, cooldown, and deployment ability
 * - POST: Validates tech unlock, coordinates, and cooldown
 * - DELETE: Allows early beacon removal (cooldown persists)
 * - All endpoints require authentication via getAuthenticatedUser()
 * - Tech requirement: 'bot-magnet' must be in user.unlockedTechs
 * - Coordinates must be valid integers
 * - Returns appropriate error messages for all failure cases
 */
