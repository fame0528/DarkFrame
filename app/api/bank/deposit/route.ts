/**
 * @file app/api/bank/deposit/route.ts
 * @created 2025-10-17
 * @overview Bank deposit API endpoint with 1,000 resource fee
 * 
 * OVERVIEW:
 * Handles resource deposits to player's bank account. Charges a 1,000 unit fee
 * per deposit transaction. Players must be at a bank tile to deposit.
 * Creates audit trail via BankTransaction records.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType, BankTransaction, BankStorage, Resources } from '@/types';
import { trackResourcesBanked } from '@/lib/statTrackingService';

const DEPOSIT_FEE = 1000;

/**
 * POST /api/bank/deposit
 * 
 * Deposit resources into bank with 1K fee
 * 
 * Request body:
 * ```json
 * {
 *   "resourceType": "metal" | "energy",
 *   "amount": number
 * }
 * ```
 * 
 * Success Response:
 * ```json
 * {
 *   "success": true,
 *   "message": "Deposited 9,000 Metal to bank (1,000 fee)",
 *   "inventory": { metal: 0, energy: 50000 },
 *   "bank": { metal: 9000, energy: 0 }
 * }
 * ```
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { resourceType, amount } = await request.json();
    const username = authResult.username;

    // Validate inputs
    if (!resourceType || !['metal', 'energy'].includes(resourceType)) {
      return NextResponse.json(
        { success: false, message: 'Invalid resource type. Must be "metal" or "energy"' },
        { status: 400 }
      );
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { success: false, message: 'Amount must be a positive integer' },
        { status: 400 }
      );
    }

    // Get player
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });

    if (!player) {
      return NextResponse.json(
        { success: false, message: 'Player not found' },
        { status: 404 }
      );
    }

    // Check if player is at a bank tile
    const tilesCollection = await getCollection<Tile>('tiles');
    const currentTile = await tilesCollection.findOne({
      x: player.currentPosition.x,
      y: player.currentPosition.y
    });

    if (!currentTile || currentTile.terrain !== TerrainType.Bank) {
      return NextResponse.json(
        { success: false, message: 'You must be at a Bank tile to deposit resources' },
        { status: 400 }
      );
    }

    // Calculate total amount needed (amount + fee)
    const totalNeeded = amount + DEPOSIT_FEE;
    const currentAmount = player.resources[resourceType as keyof Resources];

    if (currentAmount < totalNeeded) {
      return NextResponse.json(
        {
          success: false,
          message: `Insufficient ${resourceType}. Need ${totalNeeded.toLocaleString()} (${amount.toLocaleString()} + ${DEPOSIT_FEE.toLocaleString()} fee), have ${currentAmount.toLocaleString()}`
        },
        { status: 400 }
      );
    }

    // Initialize bank if it doesn't exist
    if (!player.bank) {
      player.bank = { metal: 0, energy: 0, lastDeposit: null };
    }

    // Calculate deposit amount after fee
    const depositAmount = amount;
    const feeAmount = DEPOSIT_FEE;

    // Update player resources and bank
    const resourceUpdate: any = {};
    resourceUpdate[`resources.${resourceType}`] = currentAmount - totalNeeded;
    const currentBankAmount = resourceType === 'metal' ? player.bank.metal : player.bank.energy;
    resourceUpdate[`bank.${resourceType}`] = currentBankAmount + depositAmount;
    resourceUpdate['bank.lastDeposit'] = new Date();

    await playersCollection.updateOne(
      { username },
      { $set: resourceUpdate }
    );

    // Create transaction record
    const transactionsCollection = await getCollection<BankTransaction>('bankTransactions');
    await transactionsCollection.insertOne({
      playerId: username,
      type: 'deposit',
      resourceType,
      amount: depositAmount,
      fee: feeAmount,
      timestamp: new Date()
    });

    // Track banked resources for achievements (only the deposited amount, not the fee)
    await trackResourcesBanked(username, depositAmount);

    // Get updated player data
    const updatedPlayer = await playersCollection.findOne({ username });

    return NextResponse.json({
      success: true,
      message: `Deposited ${depositAmount.toLocaleString()} ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} to bank (${feeAmount.toLocaleString()} fee)`,
      inventory: updatedPlayer!.resources,
      bank: updatedPlayer!.bank
    });

  } catch (error) {
    console.error('Bank deposit error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to deposit resources' },
      { status: 500 }
    );
  }
}
