/**
 * @file lib/wmd/clanTreasuryWMDService.ts
 * @created 2025-10-22
 * @overview Clan Treasury WMD Funding System
 * 
 * OVERVIEW:
 * Manages WMD funding from clan treasury. ALL WMD costs (missiles, defense,
 * spies) are paid EQUALLY by entire clan from clan bank, not individual players.
 * This forces collaboration and prevents solo whale dominance.
 * 
 * Philosophy:
 * - WMD is a CLAN weapon, not individual player tool
 * - Costs split equally among all clan members
 * - Requires collective resource contribution to clan bank
 * - Tracks individual member contributions for transparency
 * - Fair system: everyone pays equal share, everyone benefits equally
 * 
 * Features:
 * - Validate clan has sufficient treasury funds
 * - Deduct WMD costs from clan bank (not player resources)
 * - Track per-member contribution quotas
 * - Enforce minimum clan size (prevents solo WMD stockpiling)
 * - Transaction logging for accountability
 * - Refund system for cancelled projects
 * 
 * Dependencies:
 * - lib/clanBankService.ts for treasury operations
 * - types/wmd for WMD cost constants
 * - MongoDB for transaction tracking
 * 
 * @implements Clan Treasury Pattern
 */

import { Db, ObjectId } from 'mongodb';
import type { ClanBank, ClanBankTransaction, BankTransactionType } from '@/types/clan.types';

/**
 * WMD purchase types
 */
export enum WMDPurchaseType {
  MISSILE_COMPONENT = 'MISSILE_COMPONENT',
  MISSILE_ASSEMBLY = 'MISSILE_ASSEMBLY',
  DEFENSE_BATTERY = 'DEFENSE_BATTERY',
  SPY_RECRUITMENT = 'SPY_RECRUITMENT',
  SPY_MISSION = 'SPY_MISSION',
  RESEARCH_RP = 'RESEARCH_RP',
}

/**
 * WMD treasury transaction
 */
interface WMDTreasuryTransaction {
  transactionId: string;
  clanId: string;
  purchaseType: WMDPurchaseType;
  requestedBy: string;
  requestedByUsername: string;
  cost: {
    metal: number;
    energy: number;
  };
  perMemberCost: {
    metal: number;
    energy: number;
  };
  clanMemberCount: number;
  description: string;
  timestamp: Date;
  refunded?: boolean;
  refundedAt?: Date;
}

/**
 * Minimum clan size to use WMD systems
 * Prevents solo players from bypassing collaboration requirement
 */
const MINIMUM_CLAN_SIZE_FOR_WMD = 3;

/**
 * Validate clan has sufficient funds for WMD purchase
 * @param db MongoDB database
 * @param clanId Clan ID
 * @param cost Required resources
 * @returns Validation result with details
 */
export async function validateClanWMDFunds(
  db: Db,
  clanId: string,
  cost: { metal: number; energy: number }
): Promise<{
  valid: boolean;
  message: string;
  treasury?: { metal: number; energy: number };
  shortfall?: { metal: number; energy: number };
  perMemberCost?: { metal: number; energy: number };
  memberCount?: number;
}> {
  try {
    const clansCollection = db.collection('clans');
    const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
    
    if (!clan) {
      return { valid: false, message: 'Clan not found' };
    }
    
    // Enforce minimum clan size
    const memberCount = clan.members?.length || 0;
    if (memberCount < MINIMUM_CLAN_SIZE_FOR_WMD) {
      return {
        valid: false,
        message: `WMD systems require minimum ${MINIMUM_CLAN_SIZE_FOR_WMD} clan members. Current: ${memberCount}`,
        memberCount,
      };
    }
    
    // Get clan treasury
    const treasury = clan.bank?.treasury || { metal: 0, energy: 0 };
    
    // Check funds
    const hasMetal = treasury.metal >= cost.metal;
    const hasEnergy = treasury.energy >= cost.energy;
    
    if (!hasMetal || !hasEnergy) {
      const shortfall = {
        metal: Math.max(0, cost.metal - treasury.metal),
        energy: Math.max(0, cost.energy - treasury.energy),
      };
      
      const perMemberShortfall = {
        metal: Math.ceil(shortfall.metal / memberCount),
        energy: Math.ceil(shortfall.energy / memberCount),
      };
      
      return {
        valid: false,
        message: `Insufficient clan treasury. Need ${shortfall.metal.toLocaleString()} more metal, ${shortfall.energy.toLocaleString()} more energy. Per member: ${perMemberShortfall.metal.toLocaleString()} metal, ${perMemberShortfall.energy.toLocaleString()} energy`,
        treasury,
        shortfall,
        perMemberCost: perMemberShortfall,
        memberCount,
      };
    }
    
    // Calculate per-member cost for transparency
    const perMemberCost = {
      metal: Math.ceil(cost.metal / memberCount),
      energy: Math.ceil(cost.energy / memberCount),
    };
    
    return {
      valid: true,
      message: 'Clan treasury has sufficient funds',
      treasury,
      perMemberCost,
      memberCount,
    };
    
  } catch (error) {
    console.error('[WMD Treasury] Validation error:', error);
    return { valid: false, message: 'Treasury validation failed' };
  }
}

/**
 * Deduct WMD cost from clan treasury
 * @param db MongoDB database
 * @param clanId Clan ID
 * @param purchaseType Type of WMD purchase
 * @param requestedBy Player ID requesting purchase
 * @param requestedByUsername Player username
 * @param cost Resource cost
 * @param description Transaction description
 * @returns Transaction result
 */
export async function deductWMDCost(
  db: Db,
  clanId: string,
  purchaseType: WMDPurchaseType,
  requestedBy: string,
  requestedByUsername: string,
  cost: { metal: number; energy: number },
  description: string
): Promise<{
  success: boolean;
  message: string;
  transactionId?: string;
  remainingTreasury?: { metal: number; energy: number };
  perMemberCost?: { metal: number; energy: number };
}> {
  try {
    // Validate funds first
    const validation = await validateClanWMDFunds(db, clanId, cost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    const clansCollection = db.collection('clans');
    const wmdTransactionsCollection = db.collection('wmd_treasury_transactions');
    
    // Create WMD-specific transaction record
    const transactionId = `wmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const transaction: WMDTreasuryTransaction = {
      transactionId,
      clanId,
      purchaseType,
      requestedBy,
      requestedByUsername,
      cost,
      perMemberCost: validation.perMemberCost!,
      clanMemberCount: validation.memberCount!,
      description,
      timestamp: new Date(),
    };
    
    // Deduct from clan treasury
    await clansCollection.updateOne(
      { _id: new ObjectId(clanId) },
      {
        $inc: {
          'bank.treasury.metal': -cost.metal,
          'bank.treasury.energy': -cost.energy,
        },
        $push: {
          'bank.transactions': {
            $each: [{
              transactionId,
              type: 'WMD_PURCHASE' as BankTransactionType,
              playerId: requestedBy,
              username: requestedByUsername,
              amount: { metal: cost.metal, energy: cost.energy },
              timestamp: new Date(),
              description,
            }],
            $slice: -100, // Keep last 100 transactions
          },
        } as any,
      }
    );
    
    // Log WMD-specific transaction
    await wmdTransactionsCollection.insertOne(transaction);
    
    // Get updated treasury
    const updatedClan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
    const remainingTreasury = updatedClan?.bank?.treasury || { metal: 0, energy: 0 };
    
    console.log(`[WMD Treasury] Deducted ${cost.metal} metal, ${cost.energy} energy from clan ${clanId}. Per member: ${validation.perMemberCost!.metal} metal, ${validation.perMemberCost!.energy} energy`);
    
    return {
      success: true,
      message: `Purchased from clan treasury. Cost split among ${validation.memberCount} members.`,
      transactionId,
      remainingTreasury,
      perMemberCost: validation.perMemberCost,
    };
    
  } catch (error) {
    console.error('[WMD Treasury] Deduction error:', error);
    return { success: false, message: 'Failed to deduct from clan treasury' };
  }
}

/**
 * Refund WMD cost to clan treasury (e.g., cancelled missile, failed mission)
 * @param db MongoDB database
 * @param clanId Clan ID
 * @param transactionId Original transaction ID to refund
 * @param reason Refund reason
 * @returns Refund result
 */
export async function refundWMDCost(
  db: Db,
  clanId: string,
  transactionId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  try {
    const wmdTransactionsCollection = db.collection('wmd_treasury_transactions');
    const clansCollection = db.collection('clans');
    
    // Find original transaction
    const transaction = await wmdTransactionsCollection.findOne({
      transactionId,
      clanId,
    }) as unknown as WMDTreasuryTransaction | null;
    
    if (!transaction) {
      return { success: false, message: 'Transaction not found' };
    }
    
    if (transaction.refunded) {
      return { success: false, message: 'Transaction already refunded' };
    }
    
    // Refund to clan treasury
    await clansCollection.updateOne(
      { _id: new ObjectId(clanId) },
      {
        $inc: {
          'bank.treasury.metal': transaction.cost.metal,
          'bank.treasury.energy': transaction.cost.energy,
        },
        $push: {
          'bank.transactions': {
            $each: [{
              transactionId: `refund_${transactionId}`,
              type: 'WMD_REFUND' as BankTransactionType,
              playerId: transaction.requestedBy,
              username: transaction.requestedByUsername,
              amount: { metal: transaction.cost.metal, energy: transaction.cost.energy },
              timestamp: new Date(),
              description: `Refund: ${reason}`,
            }],
            $slice: -100,
          },
        } as any,
      }
    );
    
    // Mark transaction as refunded
    await wmdTransactionsCollection.updateOne(
      { transactionId },
      {
        $set: {
          refunded: true,
          refundedAt: new Date(),
        },
      }
    );
    
    console.log(`[WMD Treasury] Refunded ${transaction.cost.metal} metal, ${transaction.cost.energy} energy to clan ${clanId}`);
    
    return {
      success: true,
      message: `Refunded ${transaction.cost.metal} metal, ${transaction.cost.energy} energy to clan treasury`,
    };
    
  } catch (error) {
    console.error('[WMD Treasury] Refund error:', error);
    return { success: false, message: 'Refund failed' };
  }
}

/**
 * Get WMD transaction history for clan
 * @param db MongoDB database
 * @param clanId Clan ID
 * @param limit Number of transactions to return
 * @returns Transaction history
 */
export async function getWMDTransactionHistory(
  db: Db,
  clanId: string,
  limit: number = 50
): Promise<WMDTreasuryTransaction[]> {
  try {
    const wmdTransactionsCollection = db.collection('wmd_treasury_transactions');
    
    const transactions = await wmdTransactionsCollection
      .find({ clanId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray() as unknown as WMDTreasuryTransaction[];
    
    return transactions;
    
  } catch (error) {
    console.error('[WMD Treasury] History fetch error:', error);
    return [];
  }
}

/**
 * Calculate member contribution recommendations
 * Shows how much each member should deposit to reach WMD goals
 * @param db MongoDB database
 * @param clanId Clan ID
 * @param targetCost Target WMD purchase cost
 * @returns Contribution recommendations
 */
export async function calculateMemberContributions(
  db: Db,
  clanId: string,
  targetCost: { metal: number; energy: number }
): Promise<{
  currentTreasury: { metal: number; energy: number };
  targetCost: { metal: number; energy: number };
  shortfall: { metal: number; energy: number };
  perMemberContribution: { metal: number; energy: number };
  memberCount: number;
  message: string;
}> {
  try {
    const clansCollection = db.collection('clans');
    const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
    
    if (!clan) {
      throw new Error('Clan not found');
    }
    
    const memberCount = clan.members?.length || 0;
    const currentTreasury = clan.bank?.treasury || { metal: 0, energy: 0 };
    
    const shortfall = {
      metal: Math.max(0, targetCost.metal - currentTreasury.metal),
      energy: Math.max(0, targetCost.energy - currentTreasury.energy),
    };
    
    const perMemberContribution = {
      metal: memberCount > 0 ? Math.ceil(shortfall.metal / memberCount) : 0,
      energy: memberCount > 0 ? Math.ceil(shortfall.energy / memberCount) : 0,
    };
    
    const message = shortfall.metal > 0 || shortfall.energy > 0
      ? `Each of ${memberCount} members should deposit: ${perMemberContribution.metal.toLocaleString()} metal, ${perMemberContribution.energy.toLocaleString()} energy`
      : 'Clan treasury has sufficient funds!';
    
    return {
      currentTreasury,
      targetCost,
      shortfall,
      perMemberContribution,
      memberCount,
      message,
    };
    
  } catch (error) {
    console.error('[WMD Treasury] Contribution calculation error:', error);
    throw error;
  }
}

/**
 * Implementation Footer
 * 
 * Design Philosophy:
 * - WMD is CLAN weapon, not individual tool
 * - Equal cost sharing prevents wealth inequality domination
 * - Requires active clan collaboration and resource pooling
 * - Minimum clan size (3) prevents solo exploitation
 * - Full transparency with per-member cost breakdowns
 * 
 * Integration Points:
 * - Called by missileService, defenseService, spyService
 * - Replaces direct player resource deduction
 * - Requires clan bank to have funds before purchase
 * - All WMD API routes check clan treasury first
 * 
 * Example Usage:
 * ```typescript
 * // Before purchasing missile component
 * const validation = await validateClanWMDFunds(db, clanId, { metal: 500000, energy: 250000 });
 * if (!validation.valid) {
 *   return res.status(400).json({ message: validation.message });
 * }
 * 
 * const result = await deductWMDCost(
 *   db, clanId, WMDPurchaseType.MISSILE_COMPONENT,
 *   playerId, username, { metal: 500000, energy: 250000 },
 *   'Plutonium Core for Tactical Missile'
 * );
 * ```
 * 
 * Future Enhancements:
 * - Member contribution leaderboards
 * - Automated contribution reminders
 * - WMD savings goals system
 * - Bulk refund for cancelled projects
 */
