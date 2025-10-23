/**
 * Clan Alliance Management API
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoints for creating, accepting, and breaking clan alliances.
 * Supports 4 alliance types: NAP (free), Trade (10K), Military (50K), Federation (200K).
 * 
 * Endpoints:
 * - POST: Propose alliance
 * - PUT: Accept alliance
 * - DELETE: Break alliance
 * - GET: View alliances
 * 
 * Security:
 * - JWT authentication required
 * - Leaders/Co-Leaders can propose/accept
 * - Only Leaders can break alliances
 * 
 * @module app/api/clan/alliance/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  proposeAlliance,
  acceptAlliance,
  breakAlliance,
  getAlliancesForClan,
  initializeAllianceService,
  AllianceType,
} from '@/lib/clanAllianceService';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'darkframe';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;

  initializeAllianceService(client, db);

  return { client, db };
}

/**
 * POST /api/clan/alliance
 * 
 * Propose alliance to another clan
 * 
 * Request Body:
 * {
 *   "targetClanId": "clan456",
 *   "allianceType": "NAP" | "TRADE" | "MILITARY" | "FEDERATION"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "alliance": {
 *     "_id": "...",
 *     "clanIds": ["clan123", "clan456"],
 *     "type": "MILITARY",
 *     "status": "PROPOSED",
 *     "cost": { "metal": 50000, "energy": 50000 },
 *     "proposedAt": "..."
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.sub as string;

    // Parse request body
    const body = await request.json();
    const { targetClanId, allianceType } = body;

    if (!targetClanId || !allianceType) {
      return NextResponse.json(
        { error: 'targetClanId and allianceType are required' },
        { status: 400 }
      );
    }

    // Validate alliance type
    if (!Object.values(AllianceType).includes(allianceType)) {
      return NextResponse.json({ error: 'Invalid alliance type' }, { status: 400 });
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const proposingClanId = player.clanId;

    // Propose alliance
    const alliance = await proposeAlliance(proposingClanId, targetClanId, allianceType, playerId);

    return NextResponse.json({
      success: true,
      alliance: {
        _id: alliance._id?.toString(),
        clanIds: alliance.clanIds,
        type: alliance.type,
        status: alliance.status,
        cost: alliance.cost,
        proposedAt: alliance.proposedAt,
        proposedBy: alliance.proposedBy,
      },
    });
  } catch (error: any) {
    console.error('Alliance proposal error:', error);
    return NextResponse.json({ error: error.message || 'Failed to propose alliance' }, { status: 500 });
  }
}

/**
 * PUT /api/clan/alliance
 * 
 * Accept alliance proposal
 * 
 * Request Body:
 * {
 *   "allianceId": "alliance123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "alliance": { ... }
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.sub as string;

    // Parse request body
    const body = await request.json();
    const { allianceId } = body;

    if (!allianceId) {
      return NextResponse.json({ error: 'allianceId is required' }, { status: 400 });
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const acceptingClanId = player.clanId;

    // Accept alliance
    const alliance = await acceptAlliance(allianceId, acceptingClanId, playerId);

    return NextResponse.json({
      success: true,
      alliance: {
        _id: alliance._id?.toString(),
        clanIds: alliance.clanIds,
        type: alliance.type,
        status: alliance.status,
        cost: alliance.cost,
        proposedAt: alliance.proposedAt,
        acceptedAt: alliance.acceptedAt,
        contracts: alliance.contracts,
      },
    });
  } catch (error: any) {
    console.error('Alliance acceptance error:', error);
    return NextResponse.json({ error: error.message || 'Failed to accept alliance' }, { status: 500 });
  }
}

/**
 * DELETE /api/clan/alliance
 * 
 * Break alliance
 * 
 * Request Body:
 * {
 *   "allianceId": "alliance123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "cooldownHours": 72
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.sub as string;

    // Parse request body
    const body = await request.json();
    const { allianceId } = body;

    if (!allianceId) {
      return NextResponse.json({ error: 'allianceId is required' }, { status: 400 });
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const breakingClanId = player.clanId;

    // Break alliance
    const alliance = await breakAlliance(allianceId, breakingClanId, playerId);

    return NextResponse.json({
      success: true,
      brokenAt: alliance.brokenAt,
      cooldownHours: 72,
      cooldownUntil: alliance.cooldownUntil,
    });
  } catch (error: any) {
    console.error('Alliance breaking error:', error);
    return NextResponse.json({ error: error.message || 'Failed to break alliance' }, { status: 500 });
  }
}

/**
 * GET /api/clan/alliance
 * 
 * View alliances for player's clan
 * 
 * Query Parameters:
 * - includeInactive (optional): Include broken/expired alliances
 * 
 * Response:
 * {
 *   "success": true,
 *   "alliances": [...]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.sub as string;

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const clanId = player.clanId;

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Get alliances
    const alliances = await getAlliancesForClan(clanId, includeInactive);

    return NextResponse.json({
      success: true,
      alliances: alliances.map((a) => ({
        _id: a._id?.toString(),
        clanIds: a.clanIds,
        type: a.type,
        status: a.status,
        cost: a.cost,
        proposedBy: a.proposedBy,
        proposedAt: a.proposedAt,
        acceptedAt: a.acceptedAt,
        contracts: a.contracts,
        brokenAt: a.brokenAt,
        brokenBy: a.brokenBy,
        cooldownUntil: a.cooldownUntil,
      })),
      count: alliances.length,
    });
  } catch (error: any) {
    console.error('Get alliances error:', error);
    return NextResponse.json({ error: error.message || 'Failed to get alliances' }, { status: 500 });
  }
}
