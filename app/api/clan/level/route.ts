/**
 * Clan Level API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * GET/POST endpoints for clan level progression and XP management.
 * GET retrieves current level info with progress percentages and milestones.
 * POST awards XP to clan (system/admin only - called from game events).
 * 
 * Authentication:
 * - GET: Requires clan membership (any role)
 * - POST: System-only (internal service calls, not direct player access)
 * 
 * Integration:
 * - clanLevelService for all level calculations
 * - clanService to verify membership
 * - Activity logging for XP awards and level ups
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import {
  initializeClanLevelService,
  getClanLevelInfo,
  getClanMilestones,
  awardClanXP,
  getRecommendedXPSources,
  estimateTimeToNextLevel,
} from '@/lib/clanLevelService';
import { initializeClanService, getClanByPlayerId } from '@/lib/clanService';
import { ClanXPSource } from '@/types/clan.types';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');

/**
 * GET /api/clan/level
 * 
 * Retrieve clan level information with progress and milestones
 * 
 * Query Parameters:
 * - detailed: 'true' to include milestones and recommendations (optional)
 * - estimate: 'true' to include time-to-next-level estimate (optional)
 * 
 * Response:
 * - 200: Level info with progress
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
    initializeClanLevelService(client, db);

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const includeDetailed = searchParams.get('detailed') === 'true';
    const includeEstimate = searchParams.get('estimate') === 'true';

    // Get level info
    const levelInfo = await getClanLevelInfo(clan._id!.toString());

    // Build response
    const response: any = {
      success: true,
      clanId: clan._id!.toString(),
      clanName: clan.name,
      clanTag: clan.tag,
      level: levelInfo,
    };

    // Add detailed information if requested
    if (includeDetailed) {
      const milestones = await getClanMilestones(clan._id!.toString());
      const recommendations = getRecommendedXPSources();

      response.milestones = milestones;
      response.recommendedXPSources = recommendations;
    }

    // Add time estimate if requested
    if (includeEstimate) {
      const estimate = await estimateTimeToNextLevel(clan._id!.toString());
      response.estimatedHoursToNextLevel = estimate;
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching clan level info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clan level info', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clan/level
 * 
 * Award XP to a clan (system/admin only)
 * 
 * THIS ENDPOINT IS FOR INTERNAL USE ONLY
 * Called by game event handlers (harvesting, combat, research, etc.)
 * NOT intended for direct player access
 * 
 * Request Body:
 * {
 *   clanId: string,          // Clan to award XP to
 *   source: ClanXPSource,    // XP source type
 *   amount: number,          // Amount of action (resources, enemies, etc.)
 *   playerId: string         // Player who performed action
 * }
 * 
 * Response:
 * - 200: XP awarded successfully
 * - 400: Validation error
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { clanId, source, amount, playerId } = body;

    // Validate required fields
    if (!clanId || !source || amount === undefined || !playerId) {
      return NextResponse.json(
        { error: 'Missing required fields: clanId, source, amount, playerId' },
        { status: 400 }
      );
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate source
    const validSources: ClanXPSource[] = [
      'harvest',
      'combat',
      'research',
      'building',
      'territory_claim',
      'monument_control',
      'member_join',
      'clan_created',
    ];
    if (!validSources.includes(source)) {
      return NextResponse.json(
        { error: `Invalid XP source. Must be one of: ${validSources.join(', ')}` },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize service
    initializeClanLevelService(client, db);

    // Award XP
    const result = await awardClanXP(clanId, source, amount, playerId);

    // Build response
    const response: any = {
      success: result.success,
      xpAwarded: result.xpAwarded,
      newLevel: result.newLevel,
      leveledUp: result.leveledUp,
      message: result.leveledUp
        ? `Clan leveled up to ${result.newLevel}! XP awarded: ${result.xpAwarded}`
        : `${result.xpAwarded} XP awarded`,
    };

    // Include milestone rewards if leveled up
    if (result.leveledUp && result.milestoneRewards) {
      response.milestoneRewards = result.milestoneRewards;
      response.message += ` | Milestone reached! Rewards: ${result.milestoneRewards.rewards.metal} Metal, ${result.milestoneRewards.rewards.energy} Energy, ${result.milestoneRewards.rewards.researchPoints} RP`;
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error('Error awarding clan XP:', error);
    return NextResponse.json(
      { error: 'Failed to award clan XP', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * Security Considerations:
 * - POST endpoint has NO authentication check (internal use only)
 * - Should be called only from server-side game logic
 * - Consider adding API key validation for production
 * - Alternative: Make POST require admin JWT token
 * 
 * Integration Points:
 * - Harvest handlers: Award XP on successful harvests
 * - Combat system: Award XP on victories
 * - Research system: Award XP on RP contributions
 * - Building system: Award XP on construction completion
 * - Territory system: Award XP on claims
 * - Monument system: Award XP on monument control
 * 
 * Response Examples:
 * 
 * GET /api/clan/level (basic):
 * {
 *   "success": true,
 *   "clanId": "...",
 *   "clanName": "Dark Crusaders",
 *   "clanTag": "DARK",
 *   "level": {
 *     "currentLevel": 12,
 *     "totalXP": 125000,
 *     "currentLevelXP": 5000,
 *     "xpToNextLevel": 8500,
 *     "progressPercentage": 37,
 *     "nextMilestone": { level: 15, ... },
 *     "milestonesCompleted": 2,
 *     "featuresUnlocked": ["bronze_perks", "silver_perks"],
 *     "maxLevel": false
 *   }
 * }
 * 
 * GET /api/clan/level?detailed=true&estimate=true:
 * {
 *   ...basic response,
 *   "milestones": {
 *     "completed": [...],
 *     "upcoming": [...],
 *     "currentLevel": 12
 *   },
 *   "recommendedXPSources": [
 *     { source: "monument_control", xpRate: 100, description: "..." },
 *     ...
 *   ],
 *   "estimatedHoursToNextLevel": 24
 * }
 * 
 * POST /api/clan/level (level up):
 * {
 *   "success": true,
 *   "xpAwarded": 150,
 *   "newLevel": 15,
 *   "leveledUp": true,
 *   "message": "Clan leveled up to 15! XP awarded: 150 | Milestone reached! Rewards: 250000 Metal, 250000 Energy, 25000 RP",
 *   "milestoneRewards": {
 *     "level": 15,
 *     "rewards": { metal: 250000, energy: 250000, researchPoints: 25000 },
 *     "unlocksFeature": "gold_perks",
 *     "description": "Unlocks Gold tier perks and major rewards"
 *   }
 * }
 */
