/**
 * @file app/api/bank/withdraw/route.ts
 * @created 2025-10-17
 * @overview Bank withdrawal API endpoint (no fee)
 * 
 * OVERVIEW:
 * Handles resource withdrawals from player's bank account. No fee charged.
 * Players must be at a bank tile to withdraw. Creates audit trail.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType, BankTransaction, BankStorage, Resources } from '@/types';

/**
 * POST /api/bank/withdraw
 * 
 * Withdraw resources from bank (no fee)
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
 *   "message": "Withdrew 5,000 Metal from bank",
 *   "inventory": { metal: 5000, energy: 50000 },
 *   "bank": { metal: 4000, energy: 0 }
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
        { success: false, message: 'You must be at a Bank tile to withdraw resources' },
        { status: 400 }
      );
    }

    // Check if player has bank initialized
    if (!player.bank) {
      return NextResponse.json(
        { success: false, message: 'No bank account found' },
        { status: 400 }
      );
    }

    // Check if player has enough in bank
    const bankAmount = resourceType === 'metal' ? player.bank.metal : player.bank.energy;
    if (bankAmount < amount) {
      return NextResponse.json(
        {
          success: false,
          message: `Insufficient ${resourceType} in bank. Have ${bankAmount.toLocaleString()}, requested ${amount.toLocaleString()}`
        },
        { status: 400 }
      );
    }

    // Update player resources and bank (no fee for withdrawal)
    const resourceUpdate: any = {};
    resourceUpdate[`resources.${resourceType}`] = player.resources[resourceType as keyof Resources] + amount;
    resourceUpdate[`bank.${resourceType}`] = bankAmount - amount;

    await playersCollection.updateOne(
      { username },
      { $set: resourceUpdate }
    );

    // Create transaction record
    const transactionsCollection = await getCollection<BankTransaction>('bankTransactions');
    await transactionsCollection.insertOne({
      playerId: username,
      type: 'withdrawal',
      resourceType,
      amount,
      fee: 0,
      timestamp: new Date()
    });

    // Get updated player data
    const updatedPlayer = await playersCollection.findOne({ username });

    return NextResponse.json({
      success: true,
      message: `Withdrew ${amount.toLocaleString()} ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} from bank`,
      inventory: updatedPlayer!.resources,
      bank: updatedPlayer!.bank
    });

  } catch (error) {
    console.error('Bank withdrawal error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to withdraw resources' },
      { status: 500 }
    );
  }
}
