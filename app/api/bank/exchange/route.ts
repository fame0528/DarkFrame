/**
 * @file app/api/bank/exchange/route.ts
 * @created 2025-10-17
 * @overview Resource exchange API endpoint with 20% fee
 * 
 * OVERVIEW:
 * Handles Metal ↔ Energy exchanges with 20% conversion fee.
 * Formula: receivedAmount = Math.floor(givenAmount * 0.80)
 * Players must be at an Exchange Bank tile.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType, BankTransaction, Resources } from '@/types';

const EXCHANGE_FEE_RATE = 0.20; // 20% fee
const EXCHANGE_RATE = 0.80; // Player receives 80% of what they give

/**
 * POST /api/bank/exchange
 * 
 * Exchange Metal ↔ Energy with 20% fee
 * 
 * Request body:
 * ```json
 * {
 *   "fromResource": "metal" | "energy",
 *   "amount": number
 * }
 * ```
 * 
 * Success Response:
 * ```json
 * {
 *   "success": true,
 *   "message": "Exchanged 1,000 Energy for 800 Metal (20% fee)",
 *   "inventory": { metal: 800, energy: 49000 },
 *   "exchangeDetails": {
 *     "given": { type: "energy", amount: 1000 },
 *     "received": { type: "metal", amount: 800 },
 *     "feeAmount": 200
 *   }
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

    const { fromResource, amount } = await request.json();
    const username = authResult.username;

    // Validate inputs
    if (!fromResource || !['metal', 'energy'].includes(fromResource)) {
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

    // Check if player is at an exchange bank tile
    const tilesCollection = await getCollection<Tile>('tiles');
    const currentTile = await tilesCollection.findOne({
      x: player.currentPosition.x,
      y: player.currentPosition.y
    });

    if (!currentTile || currentTile.terrain !== TerrainType.Bank || currentTile.bankType !== 'exchange') {
      return NextResponse.json(
        { success: false, message: 'You must be at an Exchange Bank tile to exchange resources' },
        { status: 400 }
      );
    }

    // Calculate exchange
    const toResource = fromResource === 'metal' ? 'energy' : 'metal';
    const receivedAmount = Math.floor(amount * EXCHANGE_RATE);
    const feeAmount = amount - receivedAmount;

    // Check if player has enough of the source resource
    const currentAmount = player.resources[fromResource as keyof Resources];
    if (currentAmount < amount) {
      return NextResponse.json(
        {
          success: false,
          message: `Insufficient ${fromResource}. Have ${currentAmount.toLocaleString()}, need ${amount.toLocaleString()}`
        },
        { status: 400 }
      );
    }

    // Update player resources
    const resourceUpdate: any = {};
    resourceUpdate[`resources.${fromResource}`] = currentAmount - amount;
    resourceUpdate[`resources.${toResource}`] = player.resources[toResource as keyof Resources] + receivedAmount;

    await playersCollection.updateOne(
      { username },
      { $set: resourceUpdate }
    );

    // Create transaction record
    const transactionsCollection = await getCollection<BankTransaction>('bankTransactions');
    await transactionsCollection.insertOne({
      playerId: username,
      type: 'exchange',
      resourceType: fromResource as 'metal' | 'energy',
      amount: receivedAmount,
      fee: feeAmount,
      timestamp: new Date(),
      fromResource: { type: fromResource as 'metal' | 'energy', amount },
      toResource: { type: toResource as 'metal' | 'energy', amount: receivedAmount }
    });

    // Get updated player data
    const updatedPlayer = await playersCollection.findOne({ username });

    return NextResponse.json({
      success: true,
      message: `Exchanged ${amount.toLocaleString()} ${fromResource.charAt(0).toUpperCase() + fromResource.slice(1)} for ${receivedAmount.toLocaleString()} ${toResource.charAt(0).toUpperCase() + toResource.slice(1)} (20% fee)`,
      inventory: updatedPlayer!.resources,
      exchangeDetails: {
        given: { type: fromResource, amount },
        received: { type: toResource, amount: receivedAmount },
        feeAmount
      }
    });

  } catch (error) {
    console.error('Bank exchange error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to exchange resources' },
      { status: 500 }
    );
  }
}
