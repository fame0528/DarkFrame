/**
 * Clan Perks Available API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * GET endpoint to retrieve all available perks for a clan based on level.
 * Shows unlocked perks (can activate), locked perks (need higher level),
 * currently active perks, and perk recommendations based on clan stats.
 * 
 * Authentication:
 * - Requires clan membership (any role can view)
 * 
 * Integration:
 * - clanPerkService for perk catalog and filtering
 * - clanService to verify membership
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import {
  initializeClanPerkService,
  getAvailablePerks,
  getActivePerks,
  getPerksByCategory,
  getPerksByTier,
  calculateTierCost,
  getRecommendedPerks,
} from '@/lib/clanPerkService';
import { initializeClanService, getClanByPlayerId } from '@/lib/clanService';
import { ClanPerkCategory, ClanPerkTier } from '@/types/clan.types';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');

/**
 * GET /api/clan/perks/available
 * 
 * Retrieve all available perks for authenticated player's clan
 * 
 * Query Parameters:
 * - category: Filter by category (COMBAT, ECONOMIC, SOCIAL, STRATEGIC) - optional
 * - tier: Filter by tier (BRONZE, SILVER, GOLD, LEGENDARY) - optional
 * - recommendations: 'true' to include AI recommendations - optional
 * - costs: 'true' to include tier cost breakdowns - optional
 * 
 * Response:
 * - 200: Perk catalog with availability
 * - 401: Not authenticated
 * - 400: Not in clan
 * - 500: Server error
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const username = verified.payload.username as string;

    // Connect to database
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize services
    initializeClanService(client, db);
    initializeClanPerkService(client, db);

    // Get player's clan
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ username });
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const clan = await getClanByPlayerId(player._id.toString());
    if (!clan) {
      return NextResponse.json({ error: 'Not a member of any clan' }, { status: 400 });
    }

    const clanId = clan._id!.toString();

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get('category');
    const tierFilter = searchParams.get('tier');
    const includeRecommendations = searchParams.get('recommendations') === 'true';
    const includeCosts = searchParams.get('costs') === 'true';

    // Get available perks
    const availablePerks = await getAvailablePerks(clanId);
    const activePerks = await getActivePerks(clanId);

    // Apply filters if specified
    let unlockedPerks = availablePerks.unlocked;
    let lockedPerks = availablePerks.locked;

    if (categoryFilter) {
      const category = categoryFilter.toUpperCase() as ClanPerkCategory;
      if (!Object.values(ClanPerkCategory).includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${Object.values(ClanPerkCategory).join(', ')}` },
          { status: 400 }
        );
      }
      unlockedPerks = unlockedPerks.filter((p) => p.category === category);
      lockedPerks = lockedPerks.filter((p) => p.category === category);
    }

    if (tierFilter) {
      const tier = tierFilter.toUpperCase() as ClanPerkTier;
      if (!Object.values(ClanPerkTier).includes(tier)) {
        return NextResponse.json(
          { error: `Invalid tier. Must be one of: ${Object.values(ClanPerkTier).join(', ')}` },
          { status: 400 }
        );
      }
      unlockedPerks = unlockedPerks.filter((p) => p.tier === tier);
      lockedPerks = lockedPerks.filter((p) => p.tier === tier);
    }

    // Build response
    const response: any = {
      success: true,
      clanId,
      clanName: clan.name,
      clanTag: clan.tag,
      clanLevel: clan.level.currentLevel,
      perks: {
        unlocked: unlockedPerks,
        locked: lockedPerks,
        active: activePerks.perks,
        activeCount: availablePerks.activeCount,
        maxActive: availablePerks.maxActive,
        slotsRemaining: availablePerks.maxActive - availablePerks.activeCount,
      },
      totalBonuses: activePerks.totalBonuses,
    };

    // Add recommendations if requested
    if (includeRecommendations) {
      const recommendations = await getRecommendedPerks(clanId);
      response.recommendations = recommendations;
    }

    // Add tier costs if requested
    if (includeCosts) {
      response.tierCosts = {
        BRONZE: calculateTierCost(ClanPerkTier.BRONZE),
        SILVER: calculateTierCost(ClanPerkTier.SILVER),
        GOLD: calculateTierCost(ClanPerkTier.GOLD),
        LEGENDARY: calculateTierCost(ClanPerkTier.LEGENDARY),
      };
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching available perks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available perks', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * Response Structure:
 * {
 *   "success": true,
 *   "clanId": "...",
 *   "clanName": "Dark Crusaders",
 *   "clanTag": "DARK",
 *   "clanLevel": 12,
 *   "perks": {
 *     "unlocked": [
 *       {
 *         "id": "combat_bronze_berserker",
 *         "name": "Bronze Berserker",
 *         "description": "+5% attack damage for all clan members",
 *         "category": "COMBAT",
 *         "tier": "BRONZE",
 *         "requiredLevel": 5,
 *         "cost": { "metal": 100000, "energy": 100000, "researchPoints": 10000 },
 *         "bonus": { "type": "attack", "value": 5 }
 *       },
 *       ...
 *     ],
 *     "locked": [
 *       {
 *         "id": "combat_gold_destroyer",
 *         "name": "Gold Destroyer",
 *         "description": "+15% attack damage for all clan members",
 *         "category": "COMBAT",
 *         "tier": "GOLD",
 *         "requiredLevel": 15,
 *         "cost": { "metal": 500000, "energy": 500000, "researchPoints": 50000 },
 *         "bonus": { "type": "attack", "value": 15 },
 *         "levelsToUnlock": 3
 *       },
 *       ...
 *     ],
 *     "active": [
 *       {
 *         "id": "combat_bronze_berserker",
 *         "name": "Bronze Berserker",
 *         ...,
 *         "activatedAt": "2025-10-18T10:30:00Z",
 *         "activatedBy": "player123"
 *       }
 *     ],
 *     "activeCount": 2,
 *     "maxActive": 4,
 *     "slotsRemaining": 2
 *   },
 *   "totalBonuses": {
 *     "attack": 15,
 *     "defense": 5,
 *     "resourceYield": 0,
 *     "xpGain": 0,
 *     "territoryCostReduction": 0
 *   }
 * }
 * 
 * With recommendations=true:
 * {
 *   ...base response,
 *   "recommendations": [
 *     {
 *       "perk": { id: "economic_silver_abundance", ... },
 *       "reason": "Low resources - boosts resource generation",
 *       "priority": "high"
 *     },
 *     ...
 *   ]
 * }
 * 
 * With costs=true:
 * {
 *   ...base response,
 *   "tierCosts": {
 *     "BRONZE": {
 *       "metal": 400000,
 *       "energy": 400000,
 *       "researchPoints": 40000,
 *       "perkCount": 4
 *     },
 *     "SILVER": { ... },
 *     "GOLD": { ... },
 *     "LEGENDARY": { ... }
 *   }
 * }
 * 
 * Filtering Examples:
 * - GET /api/clan/perks/available?category=COMBAT
 *   Returns only combat perks (unlocked + locked)
 * 
 * - GET /api/clan/perks/available?tier=LEGENDARY
 *   Returns only legendary perks
 * 
 * - GET /api/clan/perks/available?category=ECONOMIC&recommendations=true
 *   Returns economic perks with AI suggestions
 */
