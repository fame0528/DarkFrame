/**
 * Territory Income API Route
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * API endpoint for viewing and managing territory passive income.
 * GET: View projected daily income
 * POST: Manual income collection (testing/admin only)
 * 
 * Features:
 * - Income projection calculator
 * - Manual collection trigger
 * - Collection history
 * - Next collection time
 * 
 * Authentication:
 * - GET: Any authenticated clan member
 * - POST: Admin only (for testing)
 * 
 * @module app/api/clan/territory/income
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient } from 'mongodb';
import {
  initializeTerritoryService,
  getProjectedTerritoryIncome,
  collectDailyTerritoryIncome,
} from '@/lib/territoryService';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
const MONGODB_URI = process.env.MONGODB_URI || '';

let client: MongoClient | null = null;

/**
 * Get MongoDB client (singleton pattern)
 */
async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('darkframe');
    initializeTerritoryService(client, db);
  }
  return client;
}

/**
 * GET /api/clan/territory/income
 * View projected daily income from territories
 * 
 * Query params:
 * - clanId (required): Clan ID
 * 
 * Returns:
 * - metalPerDay: Daily metal income
 * - energyPerDay: Daily energy income
 * - perTerritory: Income per territory
 * - territoryCount: Number of territories
 * - clanLevel: Current clan level
 * - nextCollection: Next collection timestamp
 * - canCollectNow: Whether collection is available
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get auth token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.playerId as string;

    if (!playerId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get clanId from query
    const { searchParams } = new URL(request.url);
    const clanId = searchParams.get('clanId');

    if (!clanId) {
      return NextResponse.json(
        { error: 'clanId is required' },
        { status: 400 }
      );
    }

    // Get MongoDB client
    await getMongoClient();

    // Get projected income
    const projection = await getProjectedTerritoryIncome(clanId);

    return NextResponse.json({
      success: true,
      ...projection,
    });

  } catch (error: any) {
    console.error('Error getting territory income projection:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get income projection' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clan/territory/income
 * Manually trigger income collection (admin/testing only)
 * 
 * Body:
 * - clanId (required): Clan ID to collect for
 * - adminPassword (required): Admin password for authorization
 * 
 * Returns:
 * - success: Whether collection succeeded
 * - metalCollected: Amount of metal collected
 * - energyCollected: Amount of energy collected
 * - territoryCount: Number of territories
 * - timestamp: Collection timestamp
 * - message: Status message
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get auth token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.playerId as string;

    if (!playerId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { clanId, adminPassword } = body;

    if (!clanId) {
      return NextResponse.json(
        { error: 'clanId is required' },
        { status: 400 }
      );
    }

    // Verify admin password (basic security for testing)
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    if (adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Admin authorization required' },
        { status: 403 }
      );
    }

    // Get MongoDB client
    await getMongoClient();

    // Collect income
    const result = await collectDailyTerritoryIncome(clanId);

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error collecting territory income:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to collect income' },
      { status: 500 }
    );
  }
}
