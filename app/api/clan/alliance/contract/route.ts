/**
 * Alliance Contract Management API
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoints for managing alliance contracts.
 * Supports 4 contract types: Resource Sharing, Defense Pact, War Support, Joint Research.
 * 
 * Endpoints:
 * - POST: Add contract to alliance
 * - DELETE: Remove contract from alliance
 * 
 * Security:
 * - JWT authentication required
 * - Only Leaders can manage contracts
 * - Contract type must be allowed for alliance type
 * 
 * @module app/api/clan/alliance/contract/route
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  addContract,
  removeContract,
  initializeAllianceService,
  ContractType,
} from '@/lib/clanAllianceService';
import type { AllianceContract } from '@/lib/clanAllianceService';

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
 * POST /api/clan/alliance/contract
 * 
 * Add contract to alliance
 * 
 * Request Body (Resource Sharing):
 * {
 *   "allianceId": "alliance123",
 *   "contractType": "RESOURCE_SHARING",
 *   "terms": {
 *     "resourceSharePercentage": 25
 *   }
 * }
 * 
 * Request Body (Defense Pact):
 * {
 *   "allianceId": "alliance123",
 *   "contractType": "DEFENSE_PACT",
 *   "terms": {
 *     "autoJoinDefense": true
 *   }
 * }
 * 
 * Request Body (War Support):
 * {
 *   "allianceId": "alliance123",
 *   "contractType": "WAR_SUPPORT",
 *   "terms": {
 *     "supportAmount": {
 *       "metal": 10000,
 *       "energy": 10000
 *     }
 *   }
 * }
 * 
 * Request Body (Joint Research):
 * {
 *   "allianceId": "alliance123",
 *   "contractType": "JOINT_RESEARCH",
 *   "terms": {
 *     "researchSharePercentage": 15
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "alliance": { ... }
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
    const { allianceId, contractType, terms } = body;

    if (!allianceId || !contractType || !terms) {
      return NextResponse.json(
        { error: 'allianceId, contractType, and terms are required' },
        { status: 400 }
      );
    }

    // Validate contract type
    if (!Object.values(ContractType).includes(contractType)) {
      return NextResponse.json({ error: 'Invalid contract type' }, { status: 400 });
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const clanId = player.clanId;

    // Add contract
    const alliance = await addContract(allianceId, clanId, playerId, contractType, terms);

    return NextResponse.json({
      success: true,
      alliance: {
        _id: alliance._id?.toString(),
        clanIds: alliance.clanIds,
        type: alliance.type,
        contracts: alliance.contracts,
      },
    });
  } catch (error: any) {
    console.error('Add contract error:', error);
    return NextResponse.json({ error: error.message || 'Failed to add contract' }, { status: 500 });
  }
}

/**
 * DELETE /api/clan/alliance/contract
 * 
 * Remove contract from alliance
 * 
 * Request Body:
 * {
 *   "allianceId": "alliance123",
 *   "contractType": "DEFENSE_PACT"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "alliance": { ... }
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
    const { allianceId, contractType } = body;

    if (!allianceId || !contractType) {
      return NextResponse.json(
        { error: 'allianceId and contractType are required' },
        { status: 400 }
      );
    }

    // Get player's clan
    const { db } = await connectToDatabase();
    const playersCollection = db.collection('players');
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });

    if (!player || !player.clanId) {
      return NextResponse.json({ error: 'Player is not in a clan' }, { status: 400 });
    }

    const clanId = player.clanId;

    // Remove contract
    const alliance = await removeContract(allianceId, clanId, playerId, contractType);

    return NextResponse.json({
      success: true,
      alliance: {
        _id: alliance._id?.toString(),
        clanIds: alliance.clanIds,
        type: alliance.type,
        contracts: alliance.contracts,
      },
    });
  } catch (error: any) {
    console.error('Remove contract error:', error);
    return NextResponse.json({ error: error.message || 'Failed to remove contract' }, { status: 500 });
  }
}
