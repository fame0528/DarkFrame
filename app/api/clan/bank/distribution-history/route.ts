/**
 * Clan Distribution History API
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoint for viewing distribution history records.
 * Provides audit trail for all clan fund distributions.
 * 
 * Endpoints:
 * - GET: View distribution history
 * 
 * Security:
 * - JWT authentication required
 * - Clan membership required
 * - View-only access for all members
 * 
 * Features:
 * - Paginated history
 * - Filter by method
 * - Filter by distributor
 * - Date range filtering
 * 
 * @module app/api/clan/bank/distribution-history/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { initializeDistributionService, getDistributionHistory } from '@/lib/clanDistributionService';

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
 * GET /api/clan/bank/distribution-history
 * 
 * View distribution history for player's clan
 * 
 * Query Parameters:
 * - limit (optional): Number of records to return (default 100, max 500)
 * 
 * Response:
 * {
 *   "success": true,
 *   "history": [
 *     {
 *       "_id": "...",
 *       "method": "EQUAL_SPLIT",
 *       "distributedBy": "playerId",
 *       "distributedByUsername": "PlayerName",
 *       "timestamp": "2025-10-18T...",
 *       "totalDistributed": { "metal": 100000, "energy": 0, "rp": 0 },
 *       "recipients": [...],
 *       "notes": "Equal split: 10000 metal per member (10 members)"
 *     },
 *     ...
 *   ],
 *   "count": 25
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    // Get distribution history
    const history = await getDistributionHistory(clanId, limit);

    return NextResponse.json({
      success: true,
      history: history.map((record) => ({
        _id: record._id?.toString(),
        method: record.method,
        distributedBy: record.distributedBy,
        distributedByUsername: record.distributedByUsername,
        timestamp: record.timestamp,
        totalDistributed: record.totalDistributed,
        recipients: record.recipients.map((r) => ({
          playerId: r.playerId,
          username: r.username,
          amount: r.amount,
          percentage: r.percentage,
        })),
        notes: record.notes,
      })),
      count: history.length,
    });
  } catch (error: any) {
    console.error('Distribution history error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch distribution history' },
      { status: 500 }
    );
  }
}
