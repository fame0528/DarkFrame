/**
 * Clan Fund Distribution API
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoint for distributing clan bank resources to members.
 * Supports 4 distribution methods: equal split, percentage-based, merit-based, and direct grant.
 * 
 * Endpoints:
 * - POST: Distribute funds using chosen method
 * 
 * Security:
 * - JWT authentication required
 * - Role-based permissions enforced
 * - Daily limits for Co-Leaders
 * - Balance validation before distribution
 * 
 * Distribution Methods:
 * 1. Equal Split: Divide equally among all members
 * 2. Percentage: Custom percentage per role or player (must total 100%)
 * 3. Merit: Based on contribution metrics (territories, wars, donations)
 * 4. Direct Grant: Transfer to specific players
 * 
 * @module app/api/clan/bank/distribute/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  distributeEqualSplit,
  distributeByPercentage,
  distributeByMerit,
  directGrant,
  initializeDistributionService,
  DistributionMethod,
  MeritWeights,
  DEFAULT_MERIT_WEIGHTS,
} from '@/lib/clanDistributionService';

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

  // Initialize distribution service
  initializeDistributionService(client, db);

  return { client, db };
}

/**
 * POST /api/clan/bank/distribute
 * 
 * Distribute clan funds to members
 * 
 * Request Body (Equal Split):
 * {
 *   "method": "EQUAL_SPLIT",
 *   "resourceType": "metal" | "energy" | "rp",
 *   "totalAmount": 100000
 * }
 * 
 * Request Body (Percentage):
 * {
 *   "method": "PERCENTAGE",
 *   "resourceType": "metal" | "energy" | "rp",
 *   "totalAmount": 100000,
 *   "percentageMap": {
 *     "playerId1": 40,
 *     "playerId2": 30,
 *     "playerId3": 30
 *   }
 * }
 * 
 * Request Body (Merit):
 * {
 *   "method": "MERIT",
 *   "resourceType": "metal" | "energy" | "rp",
 *   "totalAmount": 100000,
 *   "weights": {  // Optional, uses defaults if omitted
 *     "territoriesClaimed": 0.4,
 *     "warsParticipated": 0.3,
 *     "resourcesDonated": 0.3
 *   }
 * }
 * 
 * Request Body (Direct Grant):
 * {
 *   "method": "DIRECT_GRANT",
 *   "grants": [
 *     { "playerId": "xxx", "metal": 10000, "energy": 5000 },
 *     { "playerId": "yyy", "rp": 500 }
 *   ]
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "distribution": {
 *     "method": "EQUAL_SPLIT",
 *     "totalDistributed": { "metal": 100000, "energy": 0, "rp": 0 },
 *     "recipients": [...],
 *     "timestamp": "2025-10-18T..."
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
    const { method, resourceType, totalAmount, percentageMap, weights, grants } = body;

    // Validate method
    if (!Object.values(DistributionMethod).includes(method)) {
      return NextResponse.json({ error: 'Invalid distribution method' }, { status: 400 });
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const clanId = player.clanId;

    // Execute distribution based on method
    let result;

    switch (method) {
      case DistributionMethod.EQUAL_SPLIT:
        if (!resourceType || totalAmount === undefined) {
          return NextResponse.json(
            { error: 'resourceType and totalAmount are required for equal split' },
            { status: 400 }
          );
        }
        result = await distributeEqualSplit(clanId, playerId, resourceType, totalAmount);
        break;

      case DistributionMethod.PERCENTAGE:
        if (!resourceType || totalAmount === undefined || !percentageMap) {
          return NextResponse.json(
            { error: 'resourceType, totalAmount, and percentageMap are required for percentage distribution' },
            { status: 400 }
          );
        }
        result = await distributeByPercentage(clanId, playerId, resourceType, percentageMap, totalAmount);
        break;

      case DistributionMethod.MERIT:
        if (!resourceType || totalAmount === undefined) {
          return NextResponse.json(
            { error: 'resourceType and totalAmount are required for merit distribution' },
            { status: 400 }
          );
        }
        const meritWeights: MeritWeights = weights || DEFAULT_MERIT_WEIGHTS;
        result = await distributeByMerit(clanId, playerId, resourceType, totalAmount, meritWeights);
        break;

      case DistributionMethod.DIRECT_GRANT:
        if (!grants || !Array.isArray(grants) || grants.length === 0) {
          return NextResponse.json(
            { error: 'grants array is required for direct grant' },
            { status: 400 }
          );
        }
        result = await directGrant(clanId, playerId, grants);
        break;

      default:
        return NextResponse.json({ error: 'Unsupported distribution method' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      distribution: {
        method: result.method,
        totalDistributed: result.totalDistributed,
        recipients: result.recipients.map((r) => ({
          playerId: r.playerId,
          username: r.username,
          amount: r.amount,
          percentage: r.percentage,
        })),
        timestamp: result.timestamp,
        notes: result.notes,
      },
    });
  } catch (error: any) {
    console.error('Distribution error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to distribute funds' },
      { status: 500 }
    );
  }
}
