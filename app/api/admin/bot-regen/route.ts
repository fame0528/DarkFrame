/**
 * @fileoverview Admin Bot Regeneration API - Force resource regeneration
 * @module app/api/admin/bot-regen/route
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * Admin-only endpoint for forcing bot resource regeneration cycles.
 * Allows admins to manually trigger hourly resource growth for bots.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import clientPromise from '@/lib/mongodb';

// ============================================================================
// POST - Force Bot Resource Regeneration
// ============================================================================

/**
 * POST /api/admin/bot-regen
 * Manually triggers resource regeneration for all bots or specific bot
 * Requires admin privileges (rank >= 5)
 * 
 * Request body (optional):
 * {
 *   username?: string // Specific bot username, or omit for all bots
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
    const body = await request.json().catch(() => ({}));
    const { username } = body;

    // Build query
    const query: Record<string, unknown> = { isBot: true };
    if (username) {
      query.username = username;
    }

    // Get bots to regenerate
    const bots = await db.collection('players').find(query).toArray();

    if (bots.length === 0) {
      return NextResponse.json(
        { error: username ? 'Bot not found' : 'No bots found' },
        { status: 404 }
      );
    }

    // Resource tier mapping
    const TIER_RESOURCES = [
      { metal: 10000, energy: 6000 },   // Tier 1
      { metal: 25000, energy: 15000 },  // Tier 2
      { metal: 50000, energy: 30000 },  // Tier 3
      { metal: 100000, energy: 60000 }, // Tier 4
      { metal: 200000, energy: 120000 }, // Tier 5
      { metal: 400000, energy: 240000 }, // Tier 6
    ];

    // Regenerate resources for each bot
    let regeneratedCount = 0;

    for (const bot of bots) {
      const tier = bot.botConfig?.tier || 1;
      const isSpecialBase = bot.botConfig?.isSpecialBase || false;
      const tierResources = TIER_RESOURCES[tier - 1] || TIER_RESOURCES[0];

      // Special bases have 3x resources
      const multiplier = isSpecialBase ? 3 : 1;
      const maxMetal = tierResources.metal * multiplier;
      const maxEnergy = tierResources.energy * multiplier;

      // Set resources to max and reset regen timestamp
      await db.collection('players').updateOne(
        { _id: bot._id },
        {
          $set: {
            'resources.metal': maxMetal,
            'resources.energy': maxEnergy,
            'botConfig.lastResourceRegen': new Date(),
            'botConfig.lastGrowth': new Date(),
          },
        }
      );

      regeneratedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Regenerated resources for ${regeneratedCount} bot(s)`,
      botsAffected: regeneratedCount,
    });
  } catch (error) {
    console.error('Bot regeneration error:', error);
    return NextResponse.json(
      {
        error: 'Failed to regenerate bot resources',
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
 * - Requires rank >= 5 to trigger regeneration
 * - Can target specific bot or all bots
 * - Sets resources to tier maximum instantly
 * 
 * USAGE:
 * Regenerate all bots:
 * POST /api/admin/bot-regen
 * {}
 * 
 * Regenerate specific bot:
 * POST /api/admin/bot-regen
 * { "username": "HoarderBot_42" }
 * 
 * INTEGRATION:
 * This resets both lastResourceRegen and lastGrowth timestamps,
 * ensuring bots are ready for next hourly cycle.
 * 
 * FUTURE ENHANCEMENTS:
 * - Partial regeneration (percentage-based)
 * - Regeneration preview (show what will change)
 * - Scheduled regeneration cycles
 * - Regeneration cooldown limits
 */
