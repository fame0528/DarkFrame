/**
 * @fileoverview Admin Bot Spawn Control API - Manual bot creation
 * @module app/api/admin/bot-spawn/route
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * Admin-only endpoint for manually spawning bots with custom configurations.
 * Allows admins to create bots of specific types, tiers, and positions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import clientPromise from '@/lib/mongodb';

// ============================================================================
// POST - Spawn Bot
// ============================================================================

/**
 * POST /api/admin/bot-spawn
 * Manually spawn a bot with custom configuration
 * Requires admin privileges (rank >= 5)
 * 
 * Request body:
 * {
 *   specialization: 'Hoarder' | 'Fortress' | 'Raider' | 'Balanced' | 'Ghost',
 *   tier: 1-6,
 *   position?: { x: number, y: number },
 *   isSpecialBase?: boolean,
 *   count?: number (default 1, max 10)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const tokenPayload = await getAuthenticatedUser();
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check admin privileges
    const client = await clientPromise;
    const db = client.db('game');
    const player = await db.collection('players').findOne({ username: tokenPayload.username });

    if (!player || !player.rank || player.rank < 5) {
      return NextResponse.json(
        { error: 'Admin privileges required (rank 5+)' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { specialization, tier, position, isSpecialBase, count = 1 } = body;

    // Validate inputs
    const validSpecializations = ['Hoarder', 'Fortress', 'Raider', 'Balanced', 'Ghost'];
    if (!validSpecializations.includes(specialization)) {
      return NextResponse.json(
        { error: `Invalid specialization. Must be one of: ${validSpecializations.join(', ')}` },
        { status: 400 }
      );
    }

    if (!tier || tier < 1 || tier > 6) {
      return NextResponse.json(
        { error: 'Tier must be between 1 and 6' },
        { status: 400 }
      );
    }

    if (count < 1 || count > 10) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 10' },
        { status: 400 }
      );
    }

    // Generate bots
    const spawnedBots: string[] = [];
    const MAP_SIZE = 5000;

    for (let i = 0; i < count; i++) {
      // Generate bot username
      const botNumber = Math.floor(Math.random() * 100000);
      const username = `${specialization}Bot_${botNumber}`;

      // Determine position
      const botPosition = position || {
        x: Math.floor(Math.random() * MAP_SIZE),
        y: Math.floor(Math.random() * MAP_SIZE),
      };

      // Calculate resources based on tier
      const baseResources = [10000, 25000, 50000, 100000, 200000, 400000];
      const resourceAmount = baseResources[tier - 1] || 10000;
      const multiplier = isSpecialBase ? 3 : 1;

      // Create bot document
      const botDoc = {
        username,
        email: `${username}@bot.local`,
        passwordHash: 'BOT_NO_LOGIN',
        isBot: true,
        currentPosition: botPosition,
        resources: {
          metal: resourceAmount * multiplier,
          energy: Math.floor(resourceAmount * 0.6 * multiplier),
        },
        units: {
          soldiers: { ATK: 0, DEF: 0, count: 0 },
          tanks: { ATK: 0, DEF: 0, count: 0 },
          aircraft: { ATK: 0, DEF: 0, count: 0 },
        },
        totalAttack: 0,
        totalDefense: 0,
        xp: 0,
        level: 1,
        researchPoints: 0,
        unlockedTiers: [1],
        botConfig: {
          specialization,
          tier,
          lastGrowth: new Date(),
          lastResourceRegen: new Date(),
          attackCooldown: new Date(0),
          revengeTarget: null,
          isSpecialBase: isSpecialBase || false,
        },
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      // Insert bot
      await db.collection('players').insertOne(botDoc);
      spawnedBots.push(username);
    }

    return NextResponse.json({
      success: true,
      message: `Spawned ${count} bot(s) successfully`,
      bots: spawnedBots,
    });
  } catch (error) {
    console.error('Bot spawn error:', error);
    return NextResponse.json(
      {
        error: 'Failed to spawn bot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * ADMIN PERMISSIONS:
 * - Requires rank >= 5 to spawn bots
 * - Max 10 bots per request to prevent abuse
 * - Special bases have 3x resources
 * 
 * USAGE:
 * Spawn a single Raider bot at position:
 * POST /api/admin/bot-spawn
 * { "specialization": "Raider", "tier": 4, "position": { "x": 1000, "y": 1000 } }
 * 
 * Spawn 5 random Hoarder bots:
 * POST /api/admin/bot-spawn
 * { "specialization": "Hoarder", "tier": 3, "count": 5 }
 * 
 * FUTURE ENHANCEMENTS:
 * - Custom bot names
 * - Predefined bot templates
 * - Spawn in formations (circle, line, grid)
 * - Immediate army composition
 */
