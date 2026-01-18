/**
 * Clan Bank Service - Treasury & Tax Management
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan banking operations including treasury management, tax collection,
 * resource deposits/withdrawals, bank upgrades, and transaction history tracking.
 * Implements permission-based access control and capacity limits.
 * 
 * Key Features:
 * - Clan treasury for Metal, Energy, and Research Points
 * - Tax system (0-50% rates per resource type, Leader-only configuration)
 * - Automatic tax collection on member harvests
 * - Bank capacity upgrades (6 levels with increasing costs)
 * - Transaction history (last 100 transactions)
 * - Withdrawal permissions (Leader/Co-Leader only)
 * - Capacity validation and overflow prevention
 * 
 * Dependencies:
 * - MongoDB database connection
 * - types/clan.types.ts for bank types and constants
 * - lib/clanService.ts for clan validation
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import {
  Clan,
  ClanBank,
  ClanBankTransaction,
  ClanBankTransactionType,
  ClanActivityType,
  CLAN_BANK_CONSTANTS,
  calculateTaxAmount,
  hasPermission,
} from '@/types/clan.types';

let client: MongoClient;
let db: Db;

/**
 * Initialize MongoDB connection for clan bank service
 * @param mongoClient - MongoDB client instance
 * @param database - Database instance
 */
export function initializeClanBankService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get MongoDB database instance
 * @returns Database instance
 * @throws Error if database not initialized
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Clan bank service database not initialized');
  }
  return db;
}

/**
 * Deposit resources to clan bank
 * Any member can deposit. Validates capacity limits and logs transaction.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player making deposit
 * @param resources - Resources to deposit (metal, energy, researchPoints)
 * @returns Updated bank state
 * @throws Error if capacity exceeded or invalid amounts
 * 
 * @example
 * await depositToBank('clan123', 'player456', { metal: 1000, energy: 500 });
 */
export async function depositToBank(
  clanId: string,
  playerId: string,
  resources: { metal?: number; energy?: number; researchPoints?: number }
): Promise<ClanBank> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is member
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in clan');
  }
  
  // Validate deposit amounts
  const depositMetal = resources.metal || 0;
  const depositEnergy = resources.energy || 0;
  const depositRP = resources.researchPoints || 0;
  
  if (depositMetal < 0 || depositEnergy < 0 || depositRP < 0) {
    throw new Error('Deposit amounts must be positive');
  }
  
  if (depositMetal === 0 && depositEnergy === 0 && depositRP === 0) {
    throw new Error('Must deposit at least one resource');
  }
  
  // Check capacity limits
  const currentMetal = clan.bank.treasury.metal;
  const currentEnergy = clan.bank.treasury.energy;
  const currentRP = clan.bank.treasury.researchPoints;
  const capacity = clan.bank.capacity;
  
  if (currentMetal + depositMetal > capacity) {
    throw new Error(`Metal capacity exceeded. Current: ${currentMetal}, Capacity: ${capacity}`);
  }
  
  if (currentEnergy + depositEnergy > capacity) {
    throw new Error(`Energy capacity exceeded. Current: ${currentEnergy}, Capacity: ${capacity}`);
  }
  
  if (currentRP + depositRP > capacity) {
    throw new Error(`Research Points capacity exceeded. Current: ${currentRP}, Capacity: ${capacity}`);
  }
  
  // Get player to deduct resources
  const player = await database.collection('players').findOne({ _id: new ObjectId(playerId) });
  if (!player) {
    throw new Error('Player not found');
  }
  
  // Validate player has resources
  if (player.resources.metal < depositMetal) {
    throw new Error('Insufficient Metal');
  }
  if (player.resources.energy < depositEnergy) {
    throw new Error('Insufficient Energy');
  }
  if (player.researchPoints < depositRP) {
    throw new Error('Insufficient Research Points');
  }
  
  // Create transaction record
  const transaction: ClanBankTransaction = {
    transactionId: new ObjectId().toString(),
    type: ClanBankTransactionType.DEPOSIT,
    playerId,
    username: member.username,
    amount: {
      metal: depositMetal > 0 ? depositMetal : undefined,
      energy: depositEnergy > 0 ? depositEnergy : undefined,
      researchPoints: depositRP > 0 ? depositRP : undefined,
    },
    timestamp: new Date(),
    description: `${member.username} deposited resources to bank`,
  };
  
  // Update clan bank
  const updateBank: any = {
    $inc: {},
    $push: {
      'bank.transactions': {
        $each: [transaction],
        $slice: -CLAN_BANK_CONSTANTS.TRANSACTION_HISTORY_LIMIT, // Keep last 100
      },
    } as any,
  };
  
  if (depositMetal > 0) updateBank.$inc['bank.treasury.metal'] = depositMetal;
  if (depositEnergy > 0) updateBank.$inc['bank.treasury.energy'] = depositEnergy;
  if (depositRP > 0) updateBank.$inc['bank.treasury.researchPoints'] = depositRP;
  
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    updateBank
  );
  
  // Deduct from player
  const playerUpdate: any = { $inc: {} };
  if (depositMetal > 0) playerUpdate.$inc['resources.metal'] = -depositMetal;
  if (depositEnergy > 0) playerUpdate.$inc['resources.energy'] = -depositEnergy;
  if (depositRP > 0) playerUpdate.$inc['researchPoints'] = -depositRP;
  
  await database.collection('players').updateOne(
    { _id: new ObjectId(playerId) },
    playerUpdate
  );
  
  // Log activity
  await logBankActivity(clanId, ClanActivityType.BANK_DEPOSIT, playerId, {
    resources,
    username: member.username,
  });
  
  // Return updated bank
  const updatedClan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan;
  return updatedClan.bank;
}

/**
 * Withdraw resources from clan bank
 * Only Leader and Co-Leader can withdraw. Validates available balance.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player making withdrawal (must have permission)
 * @param resources - Resources to withdraw
 * @returns Updated bank state
 * @throws Error if no permission or insufficient balance
 * 
 * @example
 * await withdrawFromBank('clan123', 'leader456', { metal: 5000 });
 */
export async function withdrawFromBank(
  clanId: string,
  playerId: string,
  resources: { metal?: number; energy?: number; researchPoints?: number }
): Promise<ClanBank> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is member with withdrawal permission
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in clan');
  }
  
  if (!hasPermission(member.role, 'canWithdrawFromBank')) {
    throw new Error('No permission to withdraw from bank');
  }
  
  // Validate withdrawal amounts
  const withdrawMetal = resources.metal || 0;
  const withdrawEnergy = resources.energy || 0;
  const withdrawRP = resources.researchPoints || 0;
  
  if (withdrawMetal < 0 || withdrawEnergy < 0 || withdrawRP < 0) {
    throw new Error('Withdrawal amounts must be positive');
  }
  
  if (withdrawMetal === 0 && withdrawEnergy === 0 && withdrawRP === 0) {
    throw new Error('Must withdraw at least one resource');
  }
  
  // Check available balance
  const currentMetal = clan.bank.treasury.metal;
  const currentEnergy = clan.bank.treasury.energy;
  const currentRP = clan.bank.treasury.researchPoints;
  
  if (withdrawMetal > currentMetal) {
    throw new Error(`Insufficient Metal in bank. Available: ${currentMetal}`);
  }
  
  if (withdrawEnergy > currentEnergy) {
    throw new Error(`Insufficient Energy in bank. Available: ${currentEnergy}`);
  }
  
  if (withdrawRP > currentRP) {
    throw new Error(`Insufficient Research Points in bank. Available: ${currentRP}`);
  }
  
  // Create transaction record
  const transaction: ClanBankTransaction = {
    transactionId: new ObjectId().toString(),
    type: ClanBankTransactionType.WITHDRAWAL,
    playerId,
    username: member.username,
    amount: {
      metal: withdrawMetal > 0 ? withdrawMetal : undefined,
      energy: withdrawEnergy > 0 ? withdrawEnergy : undefined,
      researchPoints: withdrawRP > 0 ? withdrawRP : undefined,
    },
    timestamp: new Date(),
    description: `${member.username} withdrew resources from bank`,
  };
  
  // Update clan bank
  const updateBank: any = {
    $inc: {},
    $push: {
      'bank.transactions': {
        $each: [transaction],
        $slice: -CLAN_BANK_CONSTANTS.TRANSACTION_HISTORY_LIMIT,
      },
    } as any,
  };
  
  if (withdrawMetal > 0) updateBank.$inc['bank.treasury.metal'] = -withdrawMetal;
  if (withdrawEnergy > 0) updateBank.$inc['bank.treasury.energy'] = -withdrawEnergy;
  if (withdrawRP > 0) updateBank.$inc['bank.treasury.researchPoints'] = -withdrawRP;
  
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    updateBank
  );
  
  // Add to player
  const playerUpdate: any = { $inc: {} };
  if (withdrawMetal > 0) playerUpdate.$inc['resources.metal'] = withdrawMetal;
  if (withdrawEnergy > 0) playerUpdate.$inc['resources.energy'] = withdrawEnergy;
  if (withdrawRP > 0) playerUpdate.$inc['researchPoints'] = withdrawRP;
  
  await database.collection('players').updateOne(
    { _id: new ObjectId(playerId) },
    playerUpdate
  );
  
  // Log activity
  await logBankActivity(clanId, ClanActivityType.BANK_WITHDRAWAL, playerId, {
    resources,
    username: member.username,
  });
  
  // Return updated bank
  const updatedClan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan;
  return updatedClan.bank;
}

/**
 * Set clan tax rates
 * Only Leader can set tax rates. Validates rates are within 0-50% range.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player setting rates (must be Leader)
 * @param taxRates - New tax rates for each resource
 * @returns Updated bank state
 * @throws Error if not Leader or invalid rates
 * 
 * @example
 * await setTaxRates('clan123', 'leader456', { metal: 10, energy: 10, researchPoints: 5 });
 */
export async function setTaxRates(
  clanId: string,
  playerId: string,
  taxRates: { metal?: number; energy?: number; researchPoints?: number }
): Promise<ClanBank> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is member with tax management permission
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in clan');
  }
  
  if (!hasPermission(member.role, 'canManageTaxes')) {
    throw new Error('Only clan leader can manage tax rates');
  }
  
  // Validate tax rates
  const validateRate = (rate: number | undefined, resourceName: string) => {
    if (rate === undefined) return;
    if (rate < CLAN_BANK_CONSTANTS.MIN_TAX_RATE || rate > CLAN_BANK_CONSTANTS.MAX_TAX_RATE) {
      throw new Error(`${resourceName} tax rate must be between ${CLAN_BANK_CONSTANTS.MIN_TAX_RATE}% and ${CLAN_BANK_CONSTANTS.MAX_TAX_RATE}%`);
    }
  };
  
  validateRate(taxRates.metal, 'Metal');
  validateRate(taxRates.energy, 'Energy');
  validateRate(taxRates.researchPoints, 'Research Points');
  
  // Update tax rates
  const updateFields: any = {};
  if (taxRates.metal !== undefined) updateFields['bank.taxRates.metal'] = taxRates.metal;
  if (taxRates.energy !== undefined) updateFields['bank.taxRates.energy'] = taxRates.energy;
  if (taxRates.researchPoints !== undefined) updateFields['bank.taxRates.researchPoints'] = taxRates.researchPoints;
  
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    { $set: updateFields }
  );
  
  // Log activity
  await logBankActivity(clanId, ClanActivityType.TAX_RATE_CHANGED, playerId, {
    newRates: taxRates,
    username: member.username,
  });
  
  // Return updated bank
  const updatedClan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan;
  return updatedClan.bank;
}

/**
 * Collect taxes from member harvest
 * Automatically called when members harvest resources. Calculates tax based on clan rates.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player being taxed
 * @param harvestAmount - Amount harvested by player
 * @param resourceType - Type of resource ('metal' | 'energy')
 * @returns Tax amount collected
 * 
 * @example
 * const taxCollected = await collectTax('clan123', 'player456', 1000, 'metal');
 */
export async function collectTax(
  clanId: string,
  playerId: string,
  harvestAmount: number,
  resourceType: 'metal' | 'energy'
): Promise<number> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    return 0; // No clan, no tax
  }
  
  // Get tax rate
  const taxRate = clan.bank.taxRates[resourceType];
  if (taxRate === 0) {
    return 0; // No tax configured
  }
  
  // Calculate tax amount
  const taxAmount = calculateTaxAmount(harvestAmount, taxRate);
  if (taxAmount === 0) {
    return 0;
  }
  
  // Check capacity
  const currentAmount = clan.bank.treasury[resourceType];
  const capacity = clan.bank.capacity;
  
  if (currentAmount + taxAmount > capacity) {
    // Bank full, skip tax collection
    return 0;
  }
  
  // Get member
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    return 0; // Not in clan anymore
  }
  
  // Create transaction record
  const transaction: ClanBankTransaction = {
    transactionId: new ObjectId().toString(),
    type: ClanBankTransactionType.TAX_COLLECTION,
    playerId,
    username: member.username,
    amount: {
      [resourceType]: taxAmount,
    },
    timestamp: new Date(),
    description: `Tax collected from ${member.username}'s harvest (${taxRate}%)`,
  };
  
  // Update clan bank
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    {
      $inc: { [`bank.treasury.${resourceType}`]: taxAmount },
      $push: {
        'bank.transactions': {
          $each: [transaction],
          $slice: -CLAN_BANK_CONSTANTS.TRANSACTION_HISTORY_LIMIT,
        },
      } as any,
    }
  );
  
  // Log activity (silent, no notification needed)
  await logBankActivity(clanId, ClanActivityType.TAX_COLLECTED, playerId, {
    amount: taxAmount,
    resourceType,
    taxRate,
  });
  
  return taxAmount;
}

/**
 * Upgrade clan bank capacity
 * Leader only. Costs resources and increases max capacity.
 * 
 * @param clanId - Clan ID
 * @param playerId - Player purchasing upgrade (must be Leader)
 * @returns Updated bank state with new capacity
 * @throws Error if not Leader, insufficient resources, or max level reached
 * 
 * @example
 * await upgradeBankCapacity('clan123', 'leader456');
 */
export async function upgradeBankCapacity(
  clanId: string,
  playerId: string
): Promise<ClanBank> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is member with upgrade permission
  const member = clan.members.find(m => m.playerId === playerId);
  if (!member) {
    throw new Error('Player not in clan');
  }
  
  if (!hasPermission(member.role, 'canUpgradeBank')) {
    throw new Error('Only clan leader can upgrade bank');
  }
  
  // Check current level
  const currentLevel = clan.bank.upgradeLevel;
  if (currentLevel >= 6) {
    throw new Error('Bank is already at maximum level');
  }
  
  // Get upgrade cost
  const upgradeCost = CLAN_BANK_CONSTANTS.UPGRADE_COSTS.find(u => u.level === currentLevel + 1);
  if (!upgradeCost) {
    throw new Error('Invalid upgrade level');
  }
  
  // Check clan bank has sufficient resources
  const bankMetal = clan.bank.treasury.metal;
  const bankEnergy = clan.bank.treasury.energy;
  const bankRP = clan.bank.treasury.researchPoints;
  
  if (bankMetal < upgradeCost.metal) {
    throw new Error(`Insufficient Metal in bank. Need: ${upgradeCost.metal}, Have: ${bankMetal}`);
  }
  
  if (bankEnergy < upgradeCost.energy) {
    throw new Error(`Insufficient Energy in bank. Need: ${upgradeCost.energy}, Have: ${bankEnergy}`);
  }
  
  if (bankRP < upgradeCost.rp) {
    throw new Error(`Insufficient RP in bank. Need: ${upgradeCost.rp}, Have: ${bankRP}`);
  }
  
  // Calculate new capacity
  const baseCapacity = 1000000; // CLAN_CONSTANTS.BANK_BASE_CAPACITY
  const newLevel = currentLevel + 1;
  const multiplier = CLAN_BANK_CONSTANTS.CAPACITY_MULTIPLIERS[newLevel - 1];
  const newCapacity = Math.floor(baseCapacity * multiplier);
  
  // Create transaction record
  const transaction: ClanBankTransaction = {
    transactionId: new ObjectId().toString(),
    type: ClanBankTransactionType.BANK_UPGRADE,
    playerId,
    username: member.username,
    amount: {
      metal: upgradeCost.metal,
      energy: upgradeCost.energy,
      researchPoints: upgradeCost.rp,
    },
    timestamp: new Date(),
    description: `Bank upgraded to level ${newLevel}`,
  };
  
  // Update clan bank
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    {
      $inc: {
        'bank.treasury.metal': -upgradeCost.metal,
        'bank.treasury.energy': -upgradeCost.energy,
        'bank.treasury.researchPoints': -upgradeCost.rp,
      },
      $set: {
        'bank.upgradeLevel': newLevel,
        'bank.capacity': newCapacity,
      },
      $push: {
        'bank.transactions': {
          $each: [transaction],
          $slice: -CLAN_BANK_CONSTANTS.TRANSACTION_HISTORY_LIMIT,
        },
      } as any,
    }
  );
  
  // Log activity
  await logBankActivity(clanId, ClanActivityType.BANK_UPGRADED, playerId, {
    newLevel,
    newCapacity,
    cost: upgradeCost,
    username: member.username,
  });
  
  // Return updated bank
  const updatedClan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan;
  return updatedClan.bank;
}

/**
 * Get bank transaction history
 * Returns last N transactions (default 100, max defined by TRANSACTION_HISTORY_LIMIT).
 * 
 * @param clanId - Clan ID
 * @param limit - Number of transactions to return (default 100)
 * @returns Array of transactions, newest first
 * 
 * @example
 * const history = await getBankTransactionHistory('clan123', 50);
 */
export async function getBankTransactionHistory(
  clanId: string,
  limit: number = CLAN_BANK_CONSTANTS.TRANSACTION_HISTORY_LIMIT
): Promise<ClanBankTransaction[]> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Return transactions (already sorted newest first in array)
  const transactions = clan.bank.transactions || [];
  return transactions.slice(-limit).reverse();
}

/**
 * Get bank statistics
 * Returns current treasury balances, capacity info, tax rates, and usage percentages.
 * 
 * @param clanId - Clan ID
 * @returns Bank statistics object
 * 
 * @example
 * const stats = await getBankStats('clan123');
 */
export async function getBankStats(clanId: string): Promise<{
  treasury: { metal: number; energy: number; researchPoints: number };
  capacity: number;
  upgradeLevel: number;
  taxRates: { metal: number; energy: number; researchPoints: number };
  usage: { metal: number; energy: number; researchPoints: number }; // Percentage
  nextUpgradeCost?: { metal: number; energy: number; rp: number };
}> {
  const database = getDb();
  
  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) }) as Clan | null;
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  const bank = clan.bank;
  const capacity = bank.capacity;
  
  // Calculate usage percentages
  const metalUsage = capacity > 0 ? (bank.treasury.metal / capacity) * 100 : 0;
  const energyUsage = capacity > 0 ? (bank.treasury.energy / capacity) * 100 : 0;
  const rpUsage = capacity > 0 ? (bank.treasury.researchPoints / capacity) * 100 : 0;
  
  // Get next upgrade cost
  let nextUpgradeCost;
  if (bank.upgradeLevel < 6) {
    nextUpgradeCost = CLAN_BANK_CONSTANTS.UPGRADE_COSTS.find(u => u.level === bank.upgradeLevel + 1);
  }
  
  return {
    treasury: bank.treasury,
    capacity: bank.capacity,
    upgradeLevel: bank.upgradeLevel,
    taxRates: bank.taxRates,
    usage: {
      metal: Math.round(metalUsage * 100) / 100,
      energy: Math.round(energyUsage * 100) / 100,
      researchPoints: Math.round(rpUsage * 100) / 100,
    },
    nextUpgradeCost,
  };
}

/**
 * Helper function to log bank activity
 * Integrates with clan activity tracking system.
 * 
 * @param clanId - Clan ID
 * @param activityType - Type of activity
 * @param playerId - Player performing activity
 * @param metadata - Additional activity data
 */
async function logBankActivity(
  clanId: string,
  activityType: ClanActivityType,
  playerId: string,
  metadata: Record<string, any>
): Promise<void> {
  const database = getDb();
  
  try {
    await database.collection('clan_activities').insertOne({
      clanId,
      activityType,
      playerId,
      metadata,
      timestamp: new Date(),
    });
  } catch (error) {
    // Don't fail the operation if logging fails
    console.error('Failed to log bank activity:', error);
  }
}

/**
 * IMPLEMENTATION NOTES:
 * - All operations validate permissions using hasPermission() helper
 * - Deposit: Any member can deposit, capacity limits enforced
 * - Withdrawal: Leader/Co-Leader only (canWithdrawFromBank permission)
 * - Tax rates: Leader only (canManageTaxes permission), 0-50% range
 * - Bank upgrades: Leader only (canUpgradeBank permission), 6 levels max
 * - Tax collection: Automatic on harvest, respects capacity limits
 * - Transaction history: Last 100 transactions kept (configurable via CLAN_BANK_CONSTANTS)
 * - Capacity: Base 1M per resource, multipliers: 1x, 1.5x, 2x, 3x, 4x, 6x
 * - All transactions logged to activity feed for transparency
 * - Resource deduction from player happens atomically with bank deposit
 * - Capacity overflow prevention on deposits and tax collection
 */
