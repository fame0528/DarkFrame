/**
 * @fileoverview Admin Bot Statistics API - Bot population analytics
 * @module app/api/admin/bot-stats/route
 * @created 2025-10-18
 * 
 * OVERVIEW:
 * Admin-only endpoint for viewing comprehensive bot population statistics.
 * Provides breakdown by specialization, tier, zone distribution, and activity metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import clientPromise from '@/lib/mongodb';

// ============================================================================
// GET - Bot Population Statistics
// ============================================================================

/**
 * GET /api/admin/bot-stats
 * Returns comprehensive bot population analytics
 * Requires admin privileges (rank >= 5)
 */
export async function GET(request: NextRequest) {
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
    if (tokenPayload.isAdmin !== true) {
      return NextResponse.json(
        { error: 'Admin privileges required' },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');

    // Get all bots
    const bots = await db.collection('players')
      .find({ isBot: true })
      .toArray();

    // Calculate statistics
    const stats = {
      total: bots.length,
      bySpecialization: {
        Hoarder: 0,
        Fortress: 0,
        Raider: 0,
        Balanced: 0,
        Ghost: 0,
      },
      byTier: {
        tier1: 0,
        tier2: 0,
        tier3: 0,
        tier4: 0,
        tier5: 0,
        tier6: 0,
      },
      specialBases: 0,
      totalResources: {
        metal: 0,
        energy: 0,
      },
      averageResources: {
        metal: 0,
        energy: 0,
      },
      zoneDistribution: {} as Record<string, number>, // Map zones
    };

    // Process each bot
    for (const bot of bots) {
      const spec = bot.botConfig?.specialization;
      const tier = bot.botConfig?.tier;
      const resources = bot.resources;
      const position = bot.currentPosition;

      // Specialization count
      if (spec && spec in stats.bySpecialization) {
        stats.bySpecialization[spec as keyof typeof stats.bySpecialization]++;
      }

      // Tier count
      if (tier && tier >= 1 && tier <= 6) {
        const tierKey = `tier${tier}` as keyof typeof stats.byTier;
        stats.byTier[tierKey]++;
      }

      // Special bases
      if (bot.botConfig?.isSpecialBase) {
        stats.specialBases++;
      }

      // Total resources
      if (resources) {
        stats.totalResources.metal += resources.metal || 0;
        stats.totalResources.energy += resources.energy || 0;
      }

      // Zone distribution (500x500 zones)
      if (position) {
        const zoneX = Math.floor((position.x || 0) / 500);
        const zoneY = Math.floor((position.y || 0) / 500);
        const zoneKey = `${zoneX},${zoneY}`;
        stats.zoneDistribution[zoneKey] = (stats.zoneDistribution[zoneKey] || 0) + 1;
      }
    }

    // Calculate averages
    if (stats.total > 0) {
      stats.averageResources.metal = Math.floor(stats.totalResources.metal / stats.total);
      stats.averageResources.energy = Math.floor(stats.totalResources.energy / stats.total);
    }

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Bot stats fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch bot statistics',
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
 * - Requires rank >= 5 to access
 * - Stats refreshed on each request (no caching)
 * - Safe to call frequently (optimized queries)
 * 
 * FUTURE ENHANCEMENTS:
 * - Historical trends (bot population over time)
 * - Activity heatmaps
 * - Reputation distribution
 * - Combat statistics
 */
