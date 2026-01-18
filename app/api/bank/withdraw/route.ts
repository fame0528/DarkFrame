/**
 * @file app/api/bank/withdraw/route.ts
 * @created 2025-10-17
 * @modified 2025-10-24 - Phase 2: Production infrastructure - validation, errors, rate limiting
 * @overview Bank withdrawal API endpoint (no fee)
 * 
 * OVERVIEW:
 * Handles resource withdrawals from player's bank account. No fee charged.
 * Players must be at a bank tile to withdraw. Creates audit trail.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/authMiddleware';
import { getCollection } from '@/lib/mongodb';
import { Player, Tile, TerrainType, BankTransaction, Resources } from '@/types';
import { 
  withRequestLogging, 
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  BankWithdrawSchema,
  createErrorResponse,
  createErrorFromException,
  createValidationErrorResponse,
  ErrorCode
} from '@/lib';
import { ZodError } from 'zod';

const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.bankWithdraw);

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
export const POST = withRequestLogging(rateLimiter(async (request: Request) => {
  const log = createRouteLogger('BankWithdraw');
  const endTimer = log.time('withdrawOperation');
  
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      log.warn('Unauthenticated withdrawal attempt');
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = BankWithdrawSchema.parse(body);
    const { resourceType, amount } = validated;
    const username = authResult.username;
    
    log.debug('Processing withdrawal', { username, resourceType, amount });

    // Get player
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });

    if (!player) {
      log.warn('Player not found', { username });
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }

    // Check if player is at a bank tile
    const tilesCollection = await getCollection<Tile>('tiles');
    const currentTile = await tilesCollection.findOne({
      x: player.currentPosition.x,
      y: player.currentPosition.y
    });

    if (!currentTile || currentTile.terrain !== TerrainType.Bank) {
      log.warn('Withdrawal attempt not at bank', { username, position: player.currentPosition });
      return createErrorResponse(ErrorCode.VALIDATION_FAILED, { message: 'You must be at a Bank tile to withdraw resources' });
    }

    // Check if player has bank initialized
    if (!player.bank) {
      log.warn('No bank account found', { username });
      return createErrorResponse(ErrorCode.VALIDATION_FAILED, { message: 'No bank account found' });
    }

    // Check if player has enough in bank
    const bankAmount = resourceType === 'metal' ? player.bank.metal : player.bank.energy;
    if (bankAmount < amount) {
      log.warn('Insufficient bank balance', { 
        username, 
        resourceType, 
        requested: amount, 
        have: bankAmount 
      });
      return createErrorResponse(
        ErrorCode.BANK_BALANCE_INSUFFICIENT,
        { resourceType, requested: amount, have: bankAmount }
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

    log.info('Withdrawal successful', { 
      username, 
      resourceType, 
      amount,
      remainingInBank: bankAmount - amount
    });

    return NextResponse.json({
      success: true,
      message: `Withdrew ${amount.toLocaleString()} ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} from bank`,
      inventory: updatedPlayer!.resources,
      bank: updatedPlayer!.bank
    });

  } catch (error) {
    log.error('Bank withdrawal error', error as Error);
    
    // Handle validation errors
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error);
    }
    
    // Handle all other errors
    return createErrorFromException(error, ErrorCode.INTERNAL_ERROR);
  } finally {
    endTimer();
  }
}));
