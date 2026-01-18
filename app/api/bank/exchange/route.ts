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

import { NextRequest, NextResponse } from 'next/server';
import {
  withRequestLogging,
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  createErrorResponse,
  createValidationErrorResponse,
  createErrorFromException,
  ErrorCode,
} from '@/lib';
import { ExchangeSchema } from '@/lib/validation/schemas';
import { ZodError } from 'zod';
import { verifyAuth } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType, BankTransaction, Resources } from '@/types';

const EXCHANGE_FEE_RATE = 0.20; // 20% fee
const EXCHANGE_RATE = 0.80; // Player receives 80% of what they give

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.BANK);

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
export const POST = withRequestLogging(rateLimiter(async (request: NextRequest) => {
  const log = createRouteLogger('BankExchangeAPI');
  const endTimer = log.time('bank-exchange');
  
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED, {
        message: 'Authentication required',
      });
    }

    const validated = ExchangeSchema.parse(await request.json());
    const username = authResult.username;

    // Get player
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });

    if (!player) {
      return createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, {
        message: 'Player not found',
        context: { username },
      });
    }

    // Check if player is at an exchange bank tile
    const tilesCollection = await getCollection<Tile>('tiles');
    const currentTile = await tilesCollection.findOne({
      x: player.currentPosition.x,
      y: player.currentPosition.y
    });

    if (!currentTile || currentTile.terrain !== TerrainType.Bank || currentTile.bankType !== 'exchange') {
      return createErrorResponse(ErrorCode.BANK_INVALID_LOCATION, {
        message: 'You must be at an Exchange Bank tile to exchange resources',
        context: { position: player.currentPosition },
      });
    }

    // Calculate exchange
    const toResource = validated.fromResource === 'metal' ? 'energy' : 'metal';
    const receivedAmount = Math.floor(validated.amount * EXCHANGE_RATE);
    const feeAmount = validated.amount - receivedAmount;

    // Check if player has enough of the source resource
    const currentAmount = player.resources[validated.fromResource as keyof Resources];
    if (currentAmount < validated.amount) {
      return createErrorResponse(ErrorCode.INSUFFICIENT_RESOURCES, {
        message: `Insufficient ${validated.fromResource}`,
        context: { 
          have: currentAmount, 
          need: validated.amount,
          fromResource: validated.fromResource,
        },
      });
    }

    // Update player resources
    const resourceUpdate: any = {};
    resourceUpdate[`resources.${validated.fromResource}`] = currentAmount - validated.amount;
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
      resourceType: validated.fromResource as 'metal' | 'energy',
      amount: receivedAmount,
      fee: feeAmount,
      timestamp: new Date(),
      fromResource: { type: validated.fromResource as 'metal' | 'energy', amount: validated.amount },
      toResource: { type: toResource as 'metal' | 'energy', amount: receivedAmount }
    });

    // Get updated player data
    const updatedPlayer = await playersCollection.findOne({ username });

    log.info('Resource exchange completed', { 
      username, 
      from: validated.fromResource, 
      to: toResource, 
      given: validated.amount, 
      received: receivedAmount 
    });

    return NextResponse.json({
      success: true,
      message: `Exchanged ${validated.amount.toLocaleString()} ${validated.fromResource.charAt(0).toUpperCase() + validated.fromResource.slice(1)} for ${receivedAmount.toLocaleString()} ${toResource.charAt(0).toUpperCase() + toResource.slice(1)} (20% fee)`,
      inventory: updatedPlayer!.resources,
      exchangeDetails: {
        given: { type: validated.fromResource, amount: validated.amount },
        received: { type: toResource, amount: receivedAmount },
        feeAmount
      }
    });

  } catch (error) {
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error);
    }
    log.error('Bank exchange error', error instanceof Error ? error : new Error(String(error)));
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
