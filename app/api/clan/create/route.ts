/**
 * Clan Creation API Route
 * POST /api/clan/create
 * 
 * Creates a new clan with the authenticated player as leader.
 * Validates clan name/tag uniqueness, checks resource balance,
 * and deducts creation cost (1.5M Metal + 1.5M Energy).
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import { createClan, initializeClanService } from '@/lib/clanService';
import { CLAN_NAMING_RULES } from '@/types/clan.types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * POST /api/clan/create
 * Create a new clan
 * 
 * Request body:
 * {
 *   name: string,        // Clan name (3-30 characters)
 *   tag: string,         // Clan tag (2-4 uppercase alphanumeric)
 *   description?: string // Optional description
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   clan: Clan           // Created clan object
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication via JWT cookie
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let username: string;
    try {
      const verified = await jwtVerify(token, JWT_SECRET);
      username = verified.payload.username as string;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, tag, description } = body;

    // Validate required fields
    if (!name || !tag) {
      return NextResponse.json(
        { success: false, error: 'Clan name and tag are required' },
        { status: 400 }
      );
    }

    // Validate name length
    if (name.length < CLAN_NAMING_RULES.NAME_MIN_LENGTH || name.length > CLAN_NAMING_RULES.NAME_MAX_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Clan name must be ${CLAN_NAMING_RULES.NAME_MIN_LENGTH}-${CLAN_NAMING_RULES.NAME_MAX_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    // Validate tag length and format
    if (tag.length < CLAN_NAMING_RULES.TAG_MIN_LENGTH || tag.length > CLAN_NAMING_RULES.TAG_MAX_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Clan tag must be ${CLAN_NAMING_RULES.TAG_MIN_LENGTH}-${CLAN_NAMING_RULES.TAG_MAX_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    if (!CLAN_NAMING_RULES.TAG_PATTERN.test(tag)) {
      return NextResponse.json(
        { success: false, error: 'Clan tag must be uppercase alphanumeric only' },
        { status: 400 }
      );
    }

    // Get database connection
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize clan service
    initializeClanService(client, db);

    // Get player by username
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerId = player._id.toString();

    // Create clan
    const clan = await createClan(
      playerId,
      name.trim(),
      tag.toUpperCase().trim(),
      description?.trim() || ''
    );

    return NextResponse.json({
      success: true,
      clan,
      message: `Clan ${clan.tag} created successfully!`,
    });

  } catch (error: any) {
    console.error('Clan creation error:', error);

    // Handle specific errors
    if (error.message?.includes('already exists')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }

    if (error.message?.includes('already in a clan')) {
      return NextResponse.json(
        { success: false, error: 'You are already in a clan' },
        { status: 400 }
      );
    }

    if (error.message?.includes('Insufficient')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create clan' },
      { status: 500 }
    );
  }
}
