/**
 * @file app/api/bank/deposit/route.ts
 * @created 2025-10-17
 * @modified 2025-10-24 - Phase 2: Production infrastructure - validation, errors, rate limiting
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
import { Player, Tile, TerrainType, BankTransaction, Resources } from '@/types';
import { trackResourcesBanked } from '@/lib/statTrackingService';
import { 
  withRequestLogging, 
  createRouteLogger,
  createRateLimiter,
  ENDPOINT_RATE_LIMITS,
  BankDepositSchema,
  createErrorResponse,
  createErrorFromException,
  createValidationErrorResponse,
  ErrorCode
} from '@/lib';
import { ZodError } from 'zod';

const DEPOSIT_FEE = 1000;
const rateLimiter = createRateLimiter(ENDPOINT_RATE_LIMITS.bankDeposit);

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
export const POST = withRequestLogging(rateLimiter(async (request: Request) => {
  const log = createRouteLogger('BankDeposit');
  const endTimer = log.time('depositOperation');
  
  try {
    // Verify authentication
    const authResult = await verifyAuth();
    if (!authResult || !authResult.username) {
      log.warn('Unauthenticated deposit attempt');
      return createErrorResponse(ErrorCode.AUTH_UNAUTHORIZED);
    }

    // Parse and validate request body
    const body = await request.json();
    const validated = BankDepositSchema.parse(body);
    const { resourceType, amount } = validated;
    const username = authResult.username;
    
    log.debug('Processing deposit', { username, resourceType, amount });

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
      log.warn('Deposit attempt not at bank', { username, position: player.currentPosition });
      return createErrorResponse(ErrorCode.VALIDATION_FAILED, { message: 'You must be at a Bank tile to deposit resources' });
    }

    // Calculate total amount needed (amount + fee)
    const totalNeeded = amount + DEPOSIT_FEE;
    const currentAmount = player.resources[resourceType as keyof Resources];

    if (currentAmount < totalNeeded) {
      log.warn('Insufficient resources for deposit', { 
        username, 
        resourceType, 
        needed: totalNeeded, 
        have: currentAmount 
      });
      return createErrorResponse(
        ErrorCode.INSUFFICIENT_RESOURCES, 
        { 
          resourceType, 
          needed: totalNeeded, 
          have: currentAmount,
          fee: DEPOSIT_FEE
        }
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

    log.info('Deposit successful', { 
      username, 
      resourceType, 
      amount: depositAmount, 
      fee: feeAmount,
      newBankTotal: currentBankAmount + depositAmount
    });

    return NextResponse.json({
      success: true,
      message: `Deposited ${depositAmount.toLocaleString()} ${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} to bank (${feeAmount.toLocaleString()} fee)`,
      inventory: updatedPlayer!.resources,
      bank: updatedPlayer!.bank
    });

  } catch (error) {
    log.error('Bank deposit error', error as Error);
    
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
