/**
 * Clan Perk Activate/Deactivate API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * POST endpoint for activating and deactivating clan perks.
 * Validates permissions (Leader, Co-Leader, Officer), clan level requirements,
 * bank balance, and active perk limits before activation.
 * 
 * Authentication:
 * - Requires Leader, Co-Leader, or Officer role
 * - Verifies clan membership
 * 
 * Integration:
 * - clanPerkService for activation/deactivation logic
 * - clanBankService for cost deduction
 * - Activity logging for perk changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import {
  initializeClanPerkService,
  activatePerk,
  deactivatePerk,
} from '@/lib/clanPerkService';
import { initializeClanService, getClanByPlayerId } from '@/lib/clanService';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');

/**
 * POST /api/clan/perks/activate
 * 
 * Activate or deactivate a clan perk
 * 
 * Request Body:
 * {
 *   action: 'activate' | 'deactivate',
 *   perkId: string                        // Perk ID from catalog
 * }
 * 
 * Response:
 * - 200: Perk activated/deactivated successfully
 * - 400: Validation error (insufficient funds, level too low, limit reached)
 * - 401: Not authenticated
 * - 403: Insufficient permissions
 * - 404: Perk not found or player not in clan
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const verified = await jwtVerify(token, JWT_SECRET);
    const username = verified.payload.username as string;

    // Parse request body
    const body = await request.json();
    const { action, perkId } = body;

    // Validate required fields
    if (!action || !perkId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, perkId' },
        { status: 400 }
      );
    }

    // Validate action
    if (action !== 'activate' && action !== 'deactivate') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize services
    initializeClanService(client, db);
    initializeClanPerkService(client, db);

    // Get player
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ username });
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const playerId = player._id.toString();

    // Get player's clan
    const clan = await getClanByPlayerId(playerId);
    if (!clan) {
      return NextResponse.json({ error: 'Not a member of any clan' }, { status: 400 });
    }

    const clanId = clan._id!.toString();

    // Execute action
    if (action === 'activate') {
      try {
        const result = await activatePerk(clanId, playerId, perkId);

        return NextResponse.json(
          {
            success: true,
            action: 'activate',
            perk: {
              id: result.perk.id,
              name: result.perk.name,
              description: result.perk.description,
              category: result.perk.category,
              tier: result.perk.tier,
              bonus: result.perk.bonus,
            },
            costPaid: result.costPaid,
            remainingSlots: 4 - result.clan.activePerks.length,
            message: result.message,
          },
          { status: 200 }
        );
      } catch (error: any) {
        // Handle specific activation errors
        if (error.message.includes('not a member')) {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (error.message.includes('Insufficient permissions')) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        if (
          error.message.includes('already active') ||
          error.message.includes('must be level') ||
          error.message.includes('not unlocked') ||
          error.message.includes('Maximum active perks') ||
          error.message.includes('Insufficient')
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error.message.includes('not found')) {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        throw error;
      }
    } else {
      // Deactivate
      try {
        const result = await deactivatePerk(clanId, playerId, perkId);

        return NextResponse.json(
          {
            success: true,
            action: 'deactivate',
            perkName: result.perkName,
            remainingSlots: 4 - result.clan.activePerks.length,
            message: result.message,
          },
          { status: 200 }
        );
      } catch (error: any) {
        // Handle specific deactivation errors
        if (error.message.includes('not a member')) {
          return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (error.message.includes('Insufficient permissions')) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        if (error.message.includes('not currently active')) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }
  } catch (error: any) {
    console.error('Error managing clan perk:', error);
    return NextResponse.json(
      { error: 'Failed to manage clan perk', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * Permission Requirements:
 * - Only Leader, Co-Leader, and Officer can activate/deactivate perks
 * - Validated in activatePerk/deactivatePerk functions via hasPermission('canManageResearch')
 * 
 * Activation Validation:
 * 1. Perk exists in catalog
 * 2. Perk not already active
 * 3. Clan level >= perk.requiredLevel
 * 4. Perk tier unlocked (Bronze: 5, Silver: 10, Gold: 15, Legendary: 20)
 * 5. Active perk count < MAX_ACTIVE_PERKS (4)
 * 6. Bank has sufficient resources (metal, energy, RP)
 * 
 * Deactivation Rules:
 * - No refund on deactivation (resources spent are gone)
 * - Instant effect (perk removed immediately)
 * - Frees up slot for different perk
 * - No cooldown (can reactivate immediately if bank has resources)
 * 
 * Response Examples:
 * 
 * Activation Success:
 * {
 *   "success": true,
 *   "action": "activate",
 *   "perk": {
 *     "id": "combat_silver_conqueror",
 *     "name": "Silver Conqueror",
 *     "description": "+10% attack damage for all clan members",
 *     "category": "COMBAT",
 *     "tier": "SILVER",
 *     "bonus": { "type": "attack", "value": 10 }
 *   },
 *   "costPaid": {
 *     "metal": 250000,
 *     "energy": 250000,
 *     "researchPoints": 25000
 *   },
 *   "remainingSlots": 2,
 *   "message": "Silver Conqueror activated! +10% attack damage for all clan members"
 * }
 * 
 * Activation Error (Insufficient Funds):
 * {
 *   "error": "Insufficient metal in bank (need 250000, have 100000)"
 * }
 * 
 * Activation Error (Level Requirement):
 * {
 *   "error": "Clan must be level 15 to activate this perk"
 * }
 * 
 * Activation Error (Perk Limit):
 * {
 *   "error": "Maximum active perks reached (4). Deactivate a perk first."
 * }
 * 
 * Deactivation Success:
 * {
 *   "success": true,
 *   "action": "deactivate",
 *   "perkName": "Bronze Berserker",
 *   "remainingSlots": 3,
 *   "message": "Bronze Berserker deactivated. Perk slot freed."
 * }
 * 
 * Deactivation Error:
 * {
 *   "error": "Perk is not currently active"
 * }
 * 
 * Permission Error:
 * {
 *   "error": "Insufficient permissions to activate perks"
 * }
 * 
 * Usage Flow:
 * 1. Client calls GET /api/clan/perks/available to see available perks
 * 2. User selects perk to activate
 * 3. Client calls POST /api/clan/perks/activate with { action: 'activate', perkId: '...' }
 * 4. Server validates and activates perk, deducting cost
 * 5. Client refreshes perk list to show new active perk
 * 6. To swap perks, deactivate old perk first, then activate new one
 */
