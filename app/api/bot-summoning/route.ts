/**
 * @file app/api/bot-summoning/route.ts
 * @created 2025-01-18
 * 
 * OVERVIEW:
 * API endpoints for Bot Summoning Circle functionality.
 * 
 * ENDPOINTS:
 * - GET: Get summoning cooldown status
 * - POST: Summon bots of chosen specialization
 * 
 * AUTH: All endpoints require authentication
 * TECH: POST requires 'bot-summoning-circle' technology
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { type Player, BotSpecialization } from '@/types/game.types';
import {
  summonBots,
  getSummoningStatus,
} from '@/lib/botSummoningService';

/**
 * GET - Get summoning status
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

    const status = await getSummoningStatus(player._id);

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('Error getting summoning status:', error);
    return NextResponse.json(
      { error: 'Failed to get summoning status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Summon bots
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

    const body = await request.json();
    const { specialization } = body;

    // Validate specialization
    const validSpecializations: BotSpecialization[] = [
      BotSpecialization.Hoarder,
      BotSpecialization.Fortress,
      BotSpecialization.Raider,
      BotSpecialization.Balanced,
      BotSpecialization.Ghost,
    ];

    if (!specialization || !validSpecializations.includes(specialization)) {
      return NextResponse.json(
        { error: 'Invalid specialization. Must be: Hoarder, Fortress, Raider, Balanced, or Ghost' },
        { status: 400 }
      );
    }

    // Get player position
    const playerPosition = player.currentPosition || player.base;

    if (!playerPosition) {
      return NextResponse.json(
        { error: 'Player position not found' },
        { status: 400 }
      );
    }

    // Summon bots
    const result = await summonBots(
      player._id,
      playerPosition,
      specialization
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
      bots: result.bots,
    });
  } catch (error) {
    console.error('Error summoning bots:', error);
    return NextResponse.json(
      { error: 'Failed to summon bots' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - GET: Returns cooldown status (canSummon, hoursRemaining, lastSummon, nextSummonTime)
 * - POST: Validates specialization, player position, tech unlock, cooldown
 * - Specializations: Hoarder, Fortress, Raider, Balanced, Ghost
 * - Uses player.currentPosition or player.base as spawn center
 * - Returns array of spawned bot info (username, position)
 * - All validation and business logic in botSummoningService.ts
 * - Tech requirement checked in service layer
 */
