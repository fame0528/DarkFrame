/**
 * Clan Bank API Routes
 * Handles all clan banking operations
 * 
 * POST /api/clan/bank - Deposit/withdraw/set tax rates/upgrade
 * GET /api/clan/bank - Get bank status and transaction history
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import clientPromise from '@/lib/mongodb';
import {
  depositToBank,
  withdrawFromBank,
  setTaxRates,
  upgradeBankCapacity,
  getBankTransactionHistory,
  getBankStats,
  initializeClanBankService,
} from '@/lib/clanBankService';
import { getClanByPlayerId, initializeClanService } from '@/lib/clanService';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * GET /api/clan/bank
 * Get bank status and transaction history
 * 
 * Query params:
 * - limit: number (transaction history limit, default 50)
 * 
 * Response:
 * {
 *   success: true,
 *   bankStats: { treasury, capacity, taxRates, usage, nextUpgradeCost },
 *   transactions: ClanBankTransaction[]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication via JWT cookie
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let username: string;
    try {
      const verified = await jwtVerify(token, JWT_SECRET);
      username = verified.payload.username as string;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Get database connection
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize services
    initializeClanService(client, db);
    initializeClanBankService(client, db);

    // Get player by username
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerId = player._id.toString();

    // Get player's clan
    const clan = await getClanByPlayerId(playerId);
    if (!clan) {
      return NextResponse.json(
        { success: false, error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    const clanId = clan._id!.toString();

    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get bank stats and transaction history
    const [bankStats, transactions] = await Promise.all([
      getBankStats(clanId),
      getBankTransactionHistory(clanId, limit),
    ]);

    return NextResponse.json({
      success: true,
      bankStats,
      transactions,
    });

  } catch (error: any) {
    console.error('Bank GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get bank information' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clan/bank
 * Perform banking operations
 * 
 * Request body (operation-specific):
 * 
 * Deposit:
 * {
 *   action: 'deposit',
 *   resources: { metal?: number, energy?: number, researchPoints?: number }
 * }
 * 
 * Withdraw:
 * {
 *   action: 'withdraw',
 *   resources: { metal?: number, energy?: number, researchPoints?: number }
 * }
 * 
 * Set Tax Rates:
 * {
 *   action: 'setTaxRates',
 *   taxRates: { metal?: number, energy?: number, researchPoints?: number }
 * }
 * 
 * Upgrade Bank:
 * {
 *   action: 'upgrade'
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   bank: ClanBank,
 *   message: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication via JWT cookie
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let username: string;
    try {
      const verified = await jwtVerify(token, JWT_SECRET);
      username = verified.payload.username as string;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action, resources, taxRates } = body;

    // Validate action
    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required' },
        { status: 400 }
      );
    }

    // Get database connection
    const client = await clientPromise;
    const db = client.db('darkframe');

    // Initialize services
    initializeClanService(client, db);
    initializeClanBankService(client, db);

    // Get player by username
    const player = await db.collection('players').findOne({ username });
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404 }
      );
    }

    const playerId = player._id.toString();

    // Get player's clan
    const clan = await getClanByPlayerId(playerId);
    if (!clan) {
      return NextResponse.json(
        { success: false, error: 'You are not in a clan' },
        { status: 400 }
      );
    }

    const clanId = clan._id!.toString();

    // Handle different actions
    let bank;
    let message;

    switch (action) {
      case 'deposit':
        if (!resources) {
          return NextResponse.json(
            { success: false, error: 'Resources are required for deposit' },
            { status: 400 }
          );
        }
        bank = await depositToBank(clanId, playerId, resources);
        message = 'Resources deposited successfully';
        break;

      case 'withdraw':
        if (!resources) {
          return NextResponse.json(
            { success: false, error: 'Resources are required for withdrawal' },
            { status: 400 }
          );
        }
        bank = await withdrawFromBank(clanId, playerId, resources);
        message = 'Resources withdrawn successfully';
        break;

      case 'setTaxRates':
        if (!taxRates) {
          return NextResponse.json(
            { success: false, error: 'Tax rates are required' },
            { status: 400 }
          );
        }
        bank = await setTaxRates(clanId, playerId, taxRates);
        message = 'Tax rates updated successfully';
        break;

      case 'upgrade':
        bank = await upgradeBankCapacity(clanId, playerId);
        message = `Bank upgraded to level ${bank.upgradeLevel}`;
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      bank,
      message,
    });

  } catch (error: any) {
    console.error('Bank operation error:', error);

    // Handle specific errors
    if (error.message?.includes('permission')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    if (error.message?.includes('Insufficient')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('capacity')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error.message?.includes('maximum level')) {
      return NextResponse.json(
        { success: false, error: 'Bank is already at maximum level' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Banking operation failed' },
      { status: 500 }
    );
  }
}
