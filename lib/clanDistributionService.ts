/**
 * Clan Fund Distribution Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages distribution of clan bank resources to members. Leaders can distribute
 * Metal, Energy, and RP using multiple distribution methods. All distributions
 * are logged for audit purposes.
 * 
 * Distribution Methods:
 * 1. Equal Split - Divide equally among all members
 * 2. Percentage-Based - Custom percentage per role or specific players
 * 3. Merit-Based - Based on contribution metrics (territories, wars, donations)
 * 4. Direct Grant - Direct transfer to specific players
 * 
 * Features:
 * - Multiple distribution methods
 * - Permission-based limits (Leader unlimited, Co-Leader 50K/day)
 * - Balance validation
 * - Transaction logging
 * - Distribution history tracking
 * - Contribution metrics calculation
 * 
 * Permissions:
 * - Leader: All methods, unlimited
 * - Co-Leader: Equal Split and Direct Grant, max 50K per day
 * - Others: View only
 * 
 * @module lib/clanDistributionService
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import type { Clan, ClanMember, ClanRole } from '@/types/clan.types';

let client: MongoClient;
let db: Db;

/**
 * Initialize distribution service
 */
export function initializeDistributionService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Distribution service not initialized');
  }
  return db;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum DistributionMethod {
  EQUAL_SPLIT = 'EQUAL_SPLIT',
  PERCENTAGE = 'PERCENTAGE',
  MERIT = 'MERIT',
  DIRECT_GRANT = 'DIRECT_GRANT',
}

export interface DistributionRecord {
  _id?: ObjectId;
  clanId: string;
  method: DistributionMethod;
  distributedBy: string;          // Player who initiated
  distributedByUsername: string;
  timestamp: Date;
  
  resources: {
    metal?: number;
    energy?: number;
    rp?: number;
  };
  
  recipients: Array<{
    playerId: string;
    username: string;
    amount: {
      metal?: number;
      energy?: number;
      rp?: number;
    };
    percentage?: number;          // For percentage-based
  }>;
  
  totalDistributed: {
    metal: number;
    energy: number;
    rp: number;
  };
  
  notes?: string;
}

export interface MeritWeights {
  territoriesClaimed: number;     // Weight for territories claimed (default 40%)
  warsParticipated: number;       // Weight for wars participated (default 30%)
  resourcesDonated: number;       // Weight for resources donated (default 30%)
}

export interface DistributionLimits {
  dailyMetal: number;
  dailyEnergy: number;
  dailyRP: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_MERIT_WEIGHTS: MeritWeights = {
  territoriesClaimed: 0.4,
  warsParticipated: 0.3,
  resourcesDonated: 0.3,
};

export const CO_LEADER_DAILY_LIMITS: DistributionLimits = {
  dailyMetal: 50000,
  dailyEnergy: 50000,
  dailyRP: 50000,
};

// ============================================================================
// DISTRIBUTION METHODS
// ============================================================================

/**
 * Distribute resources equally among all clan members
 * 
 * @param clanId - Clan ID
 * @param distributorId - Player initiating distribution
 * @param resourceType - 'metal' | 'energy' | 'rp'
 * @param totalAmount - Total amount to distribute
 * @returns Distribution result
 * @example
 * await distributeEqualSplit('clan123', 'player456', 'metal', 100000);
 * // Distributes 100K metal equally among all members
 */
export async function distributeEqualSplit(
  clanId: string,
  distributorId: string,
  resourceType: 'metal' | 'energy' | 'rp',
  totalAmount: number
): Promise<DistributionRecord> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const playersCollection = database.collection('players');
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify permissions
  await verifyDistributionPermission(clan, distributorId, DistributionMethod.EQUAL_SPLIT, totalAmount, resourceType);
  
  // Verify sufficient funds
  const treasuryKey = resourceType === 'rp' ? 'researchPoints' : resourceType;
  const currentBalance = (clan.bank?.treasury as any)?.[treasuryKey] || 0;
  if (currentBalance < totalAmount) {
    throw new Error(`Insufficient ${resourceType} in clan bank (have ${currentBalance}, need ${totalAmount})`);
  }
  
  // Calculate amount per member
  const memberCount = clan.members.length;
  const amountPerMember = Math.floor(totalAmount / memberCount);
  const remainder = totalAmount - (amountPerMember * memberCount);
  
  // Build recipients array
  const recipients: DistributionRecord['recipients'] = [];
  for (let i = 0; i < clan.members.length; i++) {
    const member = clan.members[i];
    const player = await playersCollection.findOne({ _id: new ObjectId(member.playerId) });
    
    // Give remainder to first member
    const amount = i === 0 ? amountPerMember + remainder : amountPerMember;
    
    recipients.push({
      playerId: member.playerId,
      username: player?.username || 'Unknown',
      amount: {
        [resourceType]: amount,
      },
    });
    
    // Update player balance
    await playersCollection.updateOne(
      { _id: new ObjectId(member.playerId) },
      { $inc: { [resourceType]: amount } }
    );
  }
  
  // Deduct from clan bank
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    { $inc: { [`bank.treasury.${resourceType}`]: -totalAmount } }
  );
  
  // Get distributor username
  const distributor = await playersCollection.findOne({ _id: new ObjectId(distributorId) });
  
  // Create distribution record
  const record: DistributionRecord = {
    clanId,
    method: DistributionMethod.EQUAL_SPLIT,
    distributedBy: distributorId,
    distributedByUsername: distributor?.username || 'Unknown',
    timestamp: new Date(),
    resources: {
      [resourceType]: totalAmount,
    },
    recipients,
    totalDistributed: {
      metal: resourceType === 'metal' ? totalAmount : 0,
      energy: resourceType === 'energy' ? totalAmount : 0,
      rp: resourceType === 'rp' ? totalAmount : 0,
    },
    notes: `Equal split: ${amountPerMember} ${resourceType} per member (${memberCount} members)`,
  };
  
  // Save distribution record
  await database.collection<DistributionRecord>('clan_distributions').insertOne(record as any);
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'FUND_DISTRIBUTION',
    timestamp: new Date(),
    details: {
      method: 'EQUAL_SPLIT',
      resourceType,
      totalAmount,
      memberCount,
      amountPerMember,
      distributedBy: distributor?.username,
    },
  });
  
  return record;
}

/**
 * Distribute resources by custom percentage per player
 * 
 * @param clanId - Clan ID
 * @param distributorId - Player initiating distribution
 * @param resourceType - 'metal' | 'energy' | 'rp'
 * @param percentageMap - Map of playerId to percentage (must total 100%)
 * @param totalAmount - Total amount to distribute
 * @returns Distribution result
 * @example
 * await distributeByPercentage('clan123', 'player456', 'metal', {
 *   'leader1': 30,
 *   'coleader1': 20,
 *   'officer1': 10,
 *   // ... must total 100%
 * }, 100000);
 */
export async function distributeByPercentage(
  clanId: string,
  distributorId: string,
  resourceType: 'metal' | 'energy' | 'rp',
  percentageMap: Record<string, number>,
  totalAmount: number
): Promise<DistributionRecord> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const playersCollection = database.collection('players');
  
  // Validate percentages total 100
  const totalPercentage = Object.values(percentageMap).reduce((sum, pct) => sum + pct, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Percentages must total 100% (currently ${totalPercentage}%)`);
  }
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify permissions
  await verifyDistributionPermission(clan, distributorId, DistributionMethod.PERCENTAGE, totalAmount, resourceType);
  
  // Verify sufficient funds
  const treasuryKey = resourceType === 'rp' ? 'researchPoints' : resourceType;
  const currentBalance = (clan.bank?.treasury as any)?.[treasuryKey] || 0;
  if (currentBalance < totalAmount) {
    throw new Error(`Insufficient ${resourceType} in clan bank`);
  }
  
  // Distribute to each player
  const recipients: DistributionRecord['recipients'] = [];
  let distributed = 0;
  
  for (const [playerId, percentage] of Object.entries(percentageMap)) {
    const amount = Math.floor(totalAmount * (percentage / 100));
    distributed += amount;
    
    const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });
    
    recipients.push({
      playerId,
      username: player?.username || 'Unknown',
      amount: {
        [resourceType]: amount,
      },
      percentage,
    });
    
    // Update player balance
    await playersCollection.updateOne(
      { _id: new ObjectId(playerId) },
      { $inc: { [resourceType]: amount } }
    );
  }
  
  // Handle rounding remainder (give to first recipient)
  if (distributed < totalAmount && recipients.length > 0) {
    const remainder = totalAmount - distributed;
    recipients[0].amount[resourceType]! += remainder;
    await playersCollection.updateOne(
      { _id: new ObjectId(recipients[0].playerId) },
      { $inc: { [resourceType]: remainder } }
    );
  }
  
  // Deduct from clan bank
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    { $inc: { [`bank.treasury.${resourceType}`]: -totalAmount } }
  );
  
  // Get distributor username
  const distributor = await playersCollection.findOne({ _id: new ObjectId(distributorId) });
  
  // Create distribution record
  const record: DistributionRecord = {
    clanId,
    method: DistributionMethod.PERCENTAGE,
    distributedBy: distributorId,
    distributedByUsername: distributor?.username || 'Unknown',
    timestamp: new Date(),
    resources: {
      [resourceType]: totalAmount,
    },
    recipients,
    totalDistributed: {
      metal: resourceType === 'metal' ? totalAmount : 0,
      energy: resourceType === 'energy' ? totalAmount : 0,
      rp: resourceType === 'rp' ? totalAmount : 0,
    },
    notes: `Percentage-based distribution to ${recipients.length} members`,
  };
  
  // Save distribution record
  await database.collection<DistributionRecord>('clan_distributions').insertOne(record as any);
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'FUND_DISTRIBUTION',
    timestamp: new Date(),
    details: {
      method: 'PERCENTAGE',
      resourceType,
      totalAmount,
      recipientCount: recipients.length,
      distributedBy: distributor?.username,
    },
  });
  
  return record;
}

/**
 * Distribute resources based on merit/contribution metrics
 * 
 * @param clanId - Clan ID
 * @param distributorId - Player initiating distribution
 * @param resourceType - 'metal' | 'energy' | 'rp'
 * @param totalAmount - Total amount to distribute
 * @param weights - Optional custom weights for merit calculation
 * @returns Distribution result
 * @example
 * await distributeByMerit('clan123', 'player456', 'metal', 100000);
 * // Distributes based on: 40% territories, 30% wars, 30% donations
 */
export async function distributeByMerit(
  clanId: string,
  distributorId: string,
  resourceType: 'metal' | 'energy' | 'rp',
  totalAmount: number,
  weights: MeritWeights = DEFAULT_MERIT_WEIGHTS
): Promise<DistributionRecord> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const playersCollection = database.collection('players');
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify permissions (merit-based requires Leader role)
  const distributor = clan.members.find((m: any) => m.playerId === distributorId);
  if (!distributor || distributor.role !== 'LEADER') {
    throw new Error('Only clan leaders can use merit-based distribution');
  }
  
  // Verify sufficient funds
  const treasuryKey = resourceType === 'rp' ? 'researchPoints' : resourceType;
  const currentBalance = (clan.bank?.treasury as any)?.[treasuryKey] || 0;
  if (currentBalance < totalAmount) {
    throw new Error(`Insufficient ${resourceType} in clan bank`);
  }
  
  // Calculate merit scores for each member
  const meritScores: Array<{ playerId: string; username: string; score: number }> = [];
  
  for (const member of clan.members) {
    const contributions = (member as any).contributions || {
      resourcesDonated: 0,
      territoriesClaimed: 0,
      warsParticipated: 0,
    };
    
    // Calculate weighted score
    const score =
      (contributions.territoriesClaimed || 0) * weights.territoriesClaimed +
      (contributions.warsParticipated || 0) * weights.warsParticipated +
      ((contributions.resourcesDonated || 0) / 1000) * weights.resourcesDonated; // Normalize donations
    
    const player = await playersCollection.findOne({ _id: new ObjectId(member.playerId) });
    
    meritScores.push({
      playerId: member.playerId,
      username: player?.username || 'Unknown',
      score: Math.max(score, 1), // Minimum score of 1 so everyone gets something
    });
  }
  
  // Calculate total merit score
  const totalMeritScore = meritScores.reduce((sum, m) => sum + m.score, 0);
  
  // Distribute proportionally
  const recipients: DistributionRecord['recipients'] = [];
  let distributed = 0;
  
  for (let i = 0; i < meritScores.length; i++) {
    const merit = meritScores[i];
    const percentage = (merit.score / totalMeritScore) * 100;
    const amount = Math.floor(totalAmount * (merit.score / totalMeritScore));
    distributed += amount;
    
    recipients.push({
      playerId: merit.playerId,
      username: merit.username,
      amount: {
        [resourceType]: amount,
      },
      percentage,
    });
    
    // Update player balance
    await playersCollection.updateOne(
      { _id: new ObjectId(merit.playerId) },
      { $inc: { [resourceType]: amount } }
    );
  }
  
  // Handle rounding remainder
  if (distributed < totalAmount && recipients.length > 0) {
    const remainder = totalAmount - distributed;
    recipients[0].amount[resourceType]! += remainder;
    await playersCollection.updateOne(
      { _id: new ObjectId(recipients[0].playerId) },
      { $inc: { [resourceType]: remainder } }
    );
  }
  
  // Deduct from clan bank
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    { $inc: { [`bank.treasury.${resourceType}`]: -totalAmount } }
  );
  
  // Get distributor username
  const distributorPlayer = await playersCollection.findOne({ _id: new ObjectId(distributorId) });
  
  // Create distribution record
  const record: DistributionRecord = {
    clanId,
    method: DistributionMethod.MERIT,
    distributedBy: distributorId,
    distributedByUsername: distributorPlayer?.username || 'Unknown',
    timestamp: new Date(),
    resources: {
      [resourceType]: totalAmount,
    },
    recipients,
    totalDistributed: {
      metal: resourceType === 'metal' ? totalAmount : 0,
      energy: resourceType === 'energy' ? totalAmount : 0,
      rp: resourceType === 'rp' ? totalAmount : 0,
    },
    notes: `Merit-based: Territories ${weights.territoriesClaimed * 100}%, Wars ${weights.warsParticipated * 100}%, Donations ${weights.resourcesDonated * 100}%`,
  };
  
  // Save distribution record
  await database.collection<DistributionRecord>('clan_distributions').insertOne(record as any);
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'FUND_DISTRIBUTION',
    timestamp: new Date(),
    details: {
      method: 'MERIT',
      resourceType,
      totalAmount,
      recipientCount: recipients.length,
      distributedBy: distributorPlayer?.username,
      weights,
    },
  });
  
  return record;
}

/**
 * Direct grant to specific player(s)
 * 
 * @param clanId - Clan ID
 * @param distributorId - Player initiating grant
 * @param grants - Array of grants { playerId, metal?, energy?, rp? }
 * @returns Distribution result
 * @example
 * await directGrant('clan123', 'player456', [
 *   { playerId: 'player789', metal: 10000, energy: 5000 },
 *   { playerId: 'player012', rp: 500 }
 * ]);
 */
export async function directGrant(
  clanId: string,
  distributorId: string,
  grants: Array<{ playerId: string; metal?: number; energy?: number; rp?: number }>
): Promise<DistributionRecord> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const playersCollection = database.collection('players');
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Calculate totals
  const totalMetal = grants.reduce((sum, g) => sum + (g.metal || 0), 0);
  const totalEnergy = grants.reduce((sum, g) => sum + (g.energy || 0), 0);
  const totalRP = grants.reduce((sum, g) => sum + (g.rp || 0), 0);
  
  // Verify permissions for each resource type
  if (totalMetal > 0) {
    await verifyDistributionPermission(clan, distributorId, DistributionMethod.DIRECT_GRANT, totalMetal, 'metal');
  }
  if (totalEnergy > 0) {
    await verifyDistributionPermission(clan, distributorId, DistributionMethod.DIRECT_GRANT, totalEnergy, 'energy');
  }
  if (totalRP > 0) {
    await verifyDistributionPermission(clan, distributorId, DistributionMethod.DIRECT_GRANT, totalRP, 'rp');
  }
  
  // Verify sufficient funds
  const bankMetal = clan.bank?.treasury?.metal || 0;
  const bankEnergy = clan.bank?.treasury?.energy || 0;
  const bankRP = clan.bank?.treasury?.researchPoints || 0;
  
  if (bankMetal < totalMetal) {
    throw new Error(`Insufficient metal in clan bank (have ${bankMetal}, need ${totalMetal})`);
  }
  if (bankEnergy < totalEnergy) {
    throw new Error(`Insufficient energy in clan bank (have ${bankEnergy}, need ${totalEnergy})`);
  }
  if (bankRP < totalRP) {
    throw new Error(`Insufficient RP in clan bank (have ${bankRP}, need ${totalRP})`);
  }
  
  // Execute grants
  const recipients: DistributionRecord['recipients'] = [];
  
  for (const grant of grants) {
    const player = await playersCollection.findOne({ _id: new ObjectId(grant.playerId) });
    
    recipients.push({
      playerId: grant.playerId,
      username: player?.username || 'Unknown',
      amount: {
        metal: grant.metal || 0,
        energy: grant.energy || 0,
        rp: grant.rp || 0,
      },
    });
    
    // Update player balance
    const updateFields: any = {};
    if (grant.metal) updateFields.metal = grant.metal;
    if (grant.energy) updateFields.energy = grant.energy;
    if (grant.rp) updateFields.rp = grant.rp;
    
    await playersCollection.updateOne(
      { _id: new ObjectId(grant.playerId) },
      { $inc: updateFields }
    );
  }
  
  // Deduct from clan bank
  const bankUpdate: any = {};
  if (totalMetal > 0) bankUpdate['bank.treasury.metal'] = -totalMetal;
  if (totalEnergy > 0) bankUpdate['bank.treasury.energy'] = -totalEnergy;
  if (totalRP > 0) bankUpdate['bank.treasury.rp'] = -totalRP;
  
  await clansCollection.updateOne(
    { _id: new ObjectId(clanId) },
    { $inc: bankUpdate }
  );
  
  // Get distributor username
  const distributor = await playersCollection.findOne({ _id: new ObjectId(distributorId) });
  
  // Create distribution record
  const record: DistributionRecord = {
    clanId,
    method: DistributionMethod.DIRECT_GRANT,
    distributedBy: distributorId,
    distributedByUsername: distributor?.username || 'Unknown',
    timestamp: new Date(),
    resources: {
      metal: totalMetal,
      energy: totalEnergy,
      rp: totalRP,
    },
    recipients,
    totalDistributed: {
      metal: totalMetal,
      energy: totalEnergy,
      rp: totalRP,
    },
    notes: `Direct grants to ${grants.length} members`,
  };
  
  // Save distribution record
  await database.collection<DistributionRecord>('clan_distributions').insertOne(record as any);
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'FUND_DISTRIBUTION',
    timestamp: new Date(),
    details: {
      method: 'DIRECT_GRANT',
      totalMetal,
      totalEnergy,
      totalRP,
      recipientCount: grants.length,
      distributedBy: distributor?.username,
    },
  });
  
  return record;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify player has permission to distribute funds
 * Checks role and daily limits
 * 
 * @param clan - Clan object
 * @param distributorId - Player ID
 * @param method - Distribution method
 * @param amount - Amount to distribute
 * @param resourceType - Resource type
 * @throws Error if permission denied or limit exceeded
 */
async function verifyDistributionPermission(
  clan: any,
  distributorId: string,
  method: DistributionMethod,
  amount: number,
  resourceType: 'metal' | 'energy' | 'rp'
): Promise<void> {
  const member = clan.members.find((m: any) => m.playerId === distributorId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }
  
  const role = member.role as string;
  
  // Leader: Unlimited access to all methods
  if (role === 'LEADER') {
    return;
  }
  
  // Co-Leader: Equal Split and Direct Grant only, with daily limits
  if (role === 'CO_LEADER') {
    if (method !== DistributionMethod.EQUAL_SPLIT && method !== DistributionMethod.DIRECT_GRANT) {
      throw new Error('Co-Leaders can only use Equal Split or Direct Grant methods');
    }
    
    // Check daily limit
    const limit = CO_LEADER_DAILY_LIMITS[`daily${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}` as keyof DistributionLimits];
    const todayDistributed = await getTodayDistributedByPlayer(clan._id.toString(), distributorId, resourceType);
    
    if (todayDistributed + amount > limit) {
      throw new Error(`Co-Leader daily limit exceeded for ${resourceType} (${limit} per day, already distributed ${todayDistributed})`);
    }
    
    return;
  }
  
  // All other roles: No distribution permission
  throw new Error('Insufficient permissions to distribute clan funds');
}

/**
 * Get total amount distributed by a player today
 * 
 * @param clanId - Clan ID
 * @param playerId - Player ID
 * @param resourceType - Resource type
 * @returns Total amount distributed today
 */
async function getTodayDistributedByPlayer(
  clanId: string,
  playerId: string,
  resourceType: 'metal' | 'energy' | 'rp'
): Promise<number> {
  const database = getDb();
  const distributionsCollection = database.collection<DistributionRecord>('clan_distributions');
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const distributions = await distributionsCollection
    .find({
      clanId,
      distributedBy: playerId,
      timestamp: { $gte: todayStart },
    })
    .toArray();
  
  return distributions.reduce((sum, d) => {
    return sum + (d.totalDistributed[resourceType] || 0);
  }, 0);
}

/**
 * Get distribution history for a clan
 * 
 * @param clanId - Clan ID
 * @param limit - Maximum number of records to return
 * @returns Array of distribution records
 */
export async function getDistributionHistory(
  clanId: string,
  limit = 100
): Promise<DistributionRecord[]> {
  const database = getDb();
  const distributionsCollection = database.collection<DistributionRecord>('clan_distributions');
  
  const history = await distributionsCollection
    .find({ clanId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  
  return history;
}
