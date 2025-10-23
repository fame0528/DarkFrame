/**
 * Clan Alliance Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages alliances between clans, enabling cooperation through contracts.
 * Supports 4 alliance types with different costs, benefits, and contract options.
 * Enables joint warfare capabilities for allied clans.
 * 
 * Alliance Types:
 * 1. NAP (Non-Aggression Pact) - Free, prevents war declarations
 * 2. Trade Alliance - 10K M/E, enables resource trading at reduced fees
 * 3. Military Alliance - 50K M/E, enables joint warfare and defense pacts
 * 4. Federation - 200K M/E, full integration with shared research and resources
 * 
 * Contract Types:
 * - Resource Sharing: Auto-share percentage of passive income
 * - Defense Pact: Auto-join defensive wars
 * - War Support: Provide troops/resources during wars
 * - Joint Research: Share research point contributions
 * 
 * Features:
 * - Alliance creation with mutual acceptance
 * - Contract management per alliance type
 * - Joint warfare participation (2v1, 2v2)
 * - Alliance breaking with cooldowns
 * - Contract enforcement automation
 * 
 * @module lib/clanAllianceService
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import type { Clan } from '@/types/clan.types';

let client: MongoClient;
let db: Db;

/**
 * Initialize alliance service
 */
export function initializeAllianceService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Alliance service not initialized');
  }
  return db;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum AllianceType {
  NAP = 'NAP',                         // Non-Aggression Pact (free)
  TRADE = 'TRADE',                     // Trade Alliance (10K M/E)
  MILITARY = 'MILITARY',               // Military Alliance (50K M/E)
  FEDERATION = 'FEDERATION',           // Federation (200K M/E)
}

export enum AllianceStatus {
  PROPOSED = 'PROPOSED',               // Proposed, awaiting acceptance
  ACTIVE = 'ACTIVE',                   // Active alliance
  BROKEN = 'BROKEN',                   // Alliance broken
  EXPIRED = 'EXPIRED',                 // Expired (if time-limited)
}

export enum ContractType {
  RESOURCE_SHARING = 'RESOURCE_SHARING',         // Share passive income
  DEFENSE_PACT = 'DEFENSE_PACT',                 // Auto-join defensive wars
  WAR_SUPPORT = 'WAR_SUPPORT',                   // Provide resources during wars
  JOINT_RESEARCH = 'JOINT_RESEARCH',             // Share research contributions
}

export interface AllianceContract {
  type: ContractType;
  terms: {
    resourceSharePercentage?: number;          // For RESOURCE_SHARING (1-50%)
    autoJoinDefense?: boolean;                 // For DEFENSE_PACT
    supportAmount?: {                          // For WAR_SUPPORT
      metal: number;
      energy: number;
    };
    researchSharePercentage?: number;          // For JOINT_RESEARCH (1-30%)
  };
  createdAt: Date;
  createdBy: string;                           // Clan ID that created contract
}

export interface Alliance {
  _id?: ObjectId;
  clanIds: [string, string];                   // Two clans in alliance
  type: AllianceType;
  status: AllianceStatus;
  
  proposedBy: string;                          // Clan ID that proposed
  proposedAt: Date;
  acceptedAt?: Date;
  
  contracts: AllianceContract[];
  
  cost: {
    metal: number;
    energy: number;
  };
  
  brokenAt?: Date;
  brokenBy?: string;                           // Clan ID that broke alliance
  
  cooldownUntil?: Date;                        // Cooldown before new alliance with same clan
  
  metadata: {
    createdBy: string;                         // Player ID
    createdByUsername: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const ALLIANCE_COSTS = {
  [AllianceType.NAP]: { metal: 0, energy: 0 },
  [AllianceType.TRADE]: { metal: 10000, energy: 10000 },
  [AllianceType.MILITARY]: { metal: 50000, energy: 50000 },
  [AllianceType.FEDERATION]: { metal: 200000, energy: 200000 },
};

export const ALLIANCE_BREAK_COOLDOWN_HOURS = 72; // 3 days before re-alliance

export const CONTRACT_LIMITS: Record<AllianceType, ContractType[]> = {
  [AllianceType.NAP]: [],                                                  // No contracts
  [AllianceType.TRADE]: [ContractType.RESOURCE_SHARING],                   // Resource sharing only
  [AllianceType.MILITARY]: [
    ContractType.RESOURCE_SHARING,
    ContractType.DEFENSE_PACT,
    ContractType.WAR_SUPPORT,
  ],
  [AllianceType.FEDERATION]: [
    ContractType.RESOURCE_SHARING,
    ContractType.DEFENSE_PACT,
    ContractType.WAR_SUPPORT,
    ContractType.JOINT_RESEARCH,
  ],
};

// ============================================================================
// ALLIANCE MANAGEMENT
// ============================================================================

/**
 * Propose alliance to another clan
 * 
 * @param proposingClanId - Clan proposing alliance
 * @param targetClanId - Clan to ally with
 * @param allianceType - Type of alliance
 * @param proposedBy - Player ID proposing
 * @returns Alliance record
 * @throws Error if invalid, insufficient funds, or already allied
 * @example
 * const alliance = await proposeAlliance('clan1', 'clan2', AllianceType.MILITARY, 'player1');
 */
export async function proposeAlliance(
  proposingClanId: string,
  targetClanId: string,
  allianceType: AllianceType,
  proposedBy: string
): Promise<Alliance> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  const playersCollection = database.collection('players');
  
  // Validate different clans
  if (proposingClanId === targetClanId) {
    throw new Error('Cannot create alliance with own clan');
  }
  
  // Get both clans
  const proposingClan = await clansCollection.findOne({ _id: new ObjectId(proposingClanId) });
  const targetClan = await clansCollection.findOne({ _id: new ObjectId(targetClanId) });
  
  if (!proposingClan || !targetClan) {
    throw new Error('One or both clans not found');
  }
  
  // Verify proposer is Leader or Co-Leader
  const proposerMember = proposingClan.members.find((m: any) => m.playerId === proposedBy);
  if (!proposerMember || (proposerMember.role !== 'LEADER' && proposerMember.role !== 'CO_LEADER')) {
    throw new Error('Only Leaders or Co-Leaders can propose alliances');
  }
  
  // Check for existing alliance or cooldown
  const existingAlliance = await alliancesCollection.findOne({
    clanIds: { $all: [proposingClanId, targetClanId] },
    status: { $in: [AllianceStatus.PROPOSED, AllianceStatus.ACTIVE] },
  });
  
  if (existingAlliance) {
    throw new Error('Alliance already exists or is pending');
  }
  
  // Check cooldown from broken alliance
  const brokenAlliance = await alliancesCollection.findOne({
    clanIds: { $all: [proposingClanId, targetClanId] },
    status: AllianceStatus.BROKEN,
    cooldownUntil: { $gt: new Date() },
  });
  
  if (brokenAlliance) {
    const hoursRemaining = Math.ceil((brokenAlliance.cooldownUntil!.getTime() - Date.now()) / 3600000);
    throw new Error(`Alliance cooldown active. ${hoursRemaining} hours remaining.`);
  }
  
  // Check funds
  const cost = ALLIANCE_COSTS[allianceType];
  const proposingTreasury = proposingClan.bank?.treasury || { metal: 0, energy: 0, researchPoints: 0 };
  
  if (proposingTreasury.metal < cost.metal || proposingTreasury.energy < cost.energy) {
    throw new Error(`Insufficient funds. Need ${cost.metal} metal, ${cost.energy} energy`);
  }
  
  // Deduct cost from proposing clan
  if (cost.metal > 0 || cost.energy > 0) {
    await clansCollection.updateOne(
      { _id: new ObjectId(proposingClanId) },
      {
        $inc: {
          'bank.treasury.metal': -cost.metal,
          'bank.treasury.energy': -cost.energy,
        },
      }
    );
  }
  
  // Get proposer username
  const proposer = await playersCollection.findOne({ _id: new ObjectId(proposedBy) });
  
  // Create alliance proposal
  const alliance: Alliance = {
    clanIds: [proposingClanId, targetClanId],
    type: allianceType,
    status: AllianceStatus.PROPOSED,
    proposedBy: proposingClanId,
    proposedAt: new Date(),
    contracts: [],
    cost,
    metadata: {
      createdBy: proposedBy,
      createdByUsername: proposer?.username || 'Unknown',
    },
  };
  
  const result = await alliancesCollection.insertOne(alliance as any);
  alliance._id = result.insertedId;
  
  // Log activity for both clans
  await database.collection('clan_activities').insertOne({
    clanId: proposingClanId,
    type: 'ALLIANCE_PROPOSED',
    timestamp: new Date(),
    details: {
      allianceType,
      targetClanId,
      targetClanName: targetClan.name,
      cost,
      proposedBy: proposer?.username,
    },
  });
  
  await database.collection('clan_activities').insertOne({
    clanId: targetClanId,
    type: 'ALLIANCE_RECEIVED',
    timestamp: new Date(),
    details: {
      allianceType,
      proposingClanId,
      proposingClanName: proposingClan.name,
      cost,
    },
  });
  
  return alliance;
}

/**
 * Accept alliance proposal
 * 
 * @param allianceId - Alliance ID
 * @param acceptingClanId - Clan accepting
 * @param acceptedBy - Player ID accepting
 * @returns Updated alliance
 * @throws Error if invalid or insufficient funds
 * @example
 * await acceptAlliance('alliance123', 'clan2', 'player2');
 */
export async function acceptAlliance(
  allianceId: string,
  acceptingClanId: string,
  acceptedBy: string
): Promise<Alliance> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  const playersCollection = database.collection('players');
  
  // Get alliance
  const alliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  if (!alliance) {
    throw new Error('Alliance not found');
  }
  
  if (alliance.status !== AllianceStatus.PROPOSED) {
    throw new Error('Alliance is not in proposed state');
  }
  
  // Verify accepting clan is target clan
  const targetClanId = alliance.clanIds.find((id) => id !== alliance.proposedBy);
  if (acceptingClanId !== targetClanId) {
    throw new Error('Only the target clan can accept this alliance');
  }
  
  // Get accepting clan
  const acceptingClan = await clansCollection.findOne({ _id: new ObjectId(acceptingClanId) });
  if (!acceptingClan) {
    throw new Error('Accepting clan not found');
  }
  
  // Verify accepter is Leader or Co-Leader
  const accepterMember = acceptingClan.members.find((m: any) => m.playerId === acceptedBy);
  if (!accepterMember || (accepterMember.role !== 'LEADER' && accepterMember.role !== 'CO_LEADER')) {
    throw new Error('Only Leaders or Co-Leaders can accept alliances');
  }
  
  // Check funds for accepting clan
  const cost = alliance.cost;
  const acceptingTreasury = acceptingClan.bank?.treasury || { metal: 0, energy: 0, researchPoints: 0 };
  
  if (acceptingTreasury.metal < cost.metal || acceptingTreasury.energy < cost.energy) {
    throw new Error(`Insufficient funds. Need ${cost.metal} metal, ${cost.energy} energy`);
  }
  
  // Deduct cost from accepting clan
  if (cost.metal > 0 || cost.energy > 0) {
    await clansCollection.updateOne(
      { _id: new ObjectId(acceptingClanId) },
      {
        $inc: {
          'bank.treasury.metal': -cost.metal,
          'bank.treasury.energy': -cost.energy,
        },
      }
    );
  }
  
  // Update alliance to active
  await alliancesCollection.updateOne(
    { _id: new ObjectId(allianceId) },
    {
      $set: {
        status: AllianceStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    }
  );
  
  // Get accepter username
  const accepter = await playersCollection.findOne({ _id: new ObjectId(acceptedBy) });
  
  // Get proposing clan for activity log
  const proposingClan = await clansCollection.findOne({ _id: new ObjectId(alliance.proposedBy) });
  
  // Log activity for both clans
  await database.collection('clan_activities').insertOne({
    clanId: acceptingClanId,
    type: 'ALLIANCE_ACCEPTED',
    timestamp: new Date(),
    details: {
      allianceType: alliance.type,
      allyClanId: alliance.proposedBy,
      allyClanName: proposingClan?.name,
      acceptedBy: accepter?.username,
    },
  });
  
  await database.collection('clan_activities').insertOne({
    clanId: alliance.proposedBy,
    type: 'ALLIANCE_FORMED',
    timestamp: new Date(),
    details: {
      allianceType: alliance.type,
      allyClanId: acceptingClanId,
      allyClanName: acceptingClan.name,
    },
  });
  
  const updatedAlliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  return updatedAlliance as Alliance;
}

/**
 * Break alliance
 * 
 * @param allianceId - Alliance ID
 * @param breakingClanId - Clan breaking alliance
 * @param brokenBy - Player ID breaking alliance
 * @returns Updated alliance
 * @example
 * await breakAlliance('alliance123', 'clan1', 'player1');
 */
export async function breakAlliance(
  allianceId: string,
  breakingClanId: string,
  brokenBy: string
): Promise<Alliance> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  const playersCollection = database.collection('players');
  
  // Get alliance
  const alliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  if (!alliance) {
    throw new Error('Alliance not found');
  }
  
  if (alliance.status !== AllianceStatus.ACTIVE) {
    throw new Error('Alliance is not active');
  }
  
  // Verify breaking clan is part of alliance
  if (!alliance.clanIds.includes(breakingClanId)) {
    throw new Error('Clan is not part of this alliance');
  }
  
  // Get breaking clan
  const breakingClan = await clansCollection.findOne({ _id: new ObjectId(breakingClanId) });
  if (!breakingClan) {
    throw new Error('Breaking clan not found');
  }
  
  // Verify breaker is Leader
  const breakerMember = breakingClan.members.find((m: any) => m.playerId === brokenBy);
  if (!breakerMember || breakerMember.role !== 'LEADER') {
    throw new Error('Only clan leaders can break alliances');
  }
  
  // Calculate cooldown
  const cooldownUntil = new Date();
  cooldownUntil.setHours(cooldownUntil.getHours() + ALLIANCE_BREAK_COOLDOWN_HOURS);
  
  // Update alliance status
  await alliancesCollection.updateOne(
    { _id: new ObjectId(allianceId) },
    {
      $set: {
        status: AllianceStatus.BROKEN,
        brokenAt: new Date(),
        brokenBy: breakingClanId,
        cooldownUntil,
      },
    }
  );
  
  // Get breaker username
  const breaker = await playersCollection.findOne({ _id: new ObjectId(brokenBy) });
  
  // Get other clan
  const otherClanId = alliance.clanIds.find((id) => id !== breakingClanId)!;
  const otherClan = await clansCollection.findOne({ _id: new ObjectId(otherClanId) });
  
  // Log activity for both clans
  await database.collection('clan_activities').insertOne({
    clanId: breakingClanId,
    type: 'ALLIANCE_BROKEN',
    timestamp: new Date(),
    details: {
      allianceType: alliance.type,
      formerAllyClanId: otherClanId,
      formerAllyClanName: otherClan?.name,
      brokenBy: breaker?.username,
      cooldownHours: ALLIANCE_BREAK_COOLDOWN_HOURS,
    },
  });
  
  await database.collection('clan_activities').insertOne({
    clanId: otherClanId,
    type: 'ALLIANCE_BROKEN',
    timestamp: new Date(),
    details: {
      allianceType: alliance.type,
      formerAllyClanId: breakingClanId,
      formerAllyClanName: breakingClan.name,
      brokenBy: breakingClan.name,
    },
  });
  
  const updatedAlliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  return updatedAlliance as Alliance;
}

// ============================================================================
// CONTRACT MANAGEMENT
// ============================================================================

/**
 * Add contract to alliance
 * 
 * @param allianceId - Alliance ID
 * @param clanId - Clan adding contract
 * @param playerId - Player ID adding contract
 * @param contractType - Type of contract
 * @param terms - Contract terms
 * @returns Updated alliance
 * @throws Error if invalid or not allowed for alliance type
 * @example
 * await addContract('alliance123', 'clan1', 'player1', ContractType.DEFENSE_PACT, { autoJoinDefense: true });
 */
export async function addContract(
  allianceId: string,
  clanId: string,
  playerId: string,
  contractType: ContractType,
  terms: AllianceContract['terms']
): Promise<Alliance> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  
  // Get alliance
  const alliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  if (!alliance) {
    throw new Error('Alliance not found');
  }
  
  if (alliance.status !== AllianceStatus.ACTIVE) {
    throw new Error('Alliance must be active to add contracts');
  }
  
  // Verify clan is part of alliance
  if (!alliance.clanIds.includes(clanId)) {
    throw new Error('Clan is not part of this alliance');
  }
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is Leader
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member || member.role !== 'LEADER') {
    throw new Error('Only clan leaders can add contracts');
  }
  
  // Verify contract type allowed for alliance type
  const allowedContracts = CONTRACT_LIMITS[alliance.type];
  if (!allowedContracts.includes(contractType)) {
    throw new Error(`Contract type ${contractType} not allowed for ${alliance.type} alliance`);
  }
  
  // Check if contract already exists
  const existingContract = alliance.contracts.find((c) => c.type === contractType);
  if (existingContract) {
    throw new Error(`Contract ${contractType} already exists for this alliance`);
  }
  
  // Validate terms
  validateContractTerms(contractType, terms);
  
  // Add contract
  const contract: AllianceContract = {
    type: contractType,
    terms,
    createdAt: new Date(),
    createdBy: clanId,
  };
  
  await alliancesCollection.updateOne(
    { _id: new ObjectId(allianceId) },
    { $push: { contracts: contract as any } }
  );
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'CONTRACT_ADDED',
    timestamp: new Date(),
    details: {
      allianceId: allianceId,
      contractType,
      terms,
    },
  });
  
  const updatedAlliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  return updatedAlliance as Alliance;
}

/**
 * Remove contract from alliance
 * 
 * @param allianceId - Alliance ID
 * @param clanId - Clan removing contract
 * @param playerId - Player ID removing contract
 * @param contractType - Type of contract to remove
 * @returns Updated alliance
 */
export async function removeContract(
  allianceId: string,
  clanId: string,
  playerId: string,
  contractType: ContractType
): Promise<Alliance> {
  const database = getDb();
  const clansCollection = database.collection<Clan>('clans');
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  
  // Get alliance
  const alliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  if (!alliance) {
    throw new Error('Alliance not found');
  }
  
  // Verify clan is part of alliance
  if (!alliance.clanIds.includes(clanId)) {
    throw new Error('Clan is not part of this alliance');
  }
  
  // Get clan
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  // Verify player is Leader
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member || member.role !== 'LEADER') {
    throw new Error('Only clan leaders can remove contracts');
  }
  
  // Remove contract
  await alliancesCollection.updateOne(
    { _id: new ObjectId(allianceId) },
    { $pull: { contracts: { type: contractType } as any } }
  );
  
  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'CONTRACT_REMOVED',
    timestamp: new Date(),
    details: {
      allianceId: allianceId,
      contractType,
    },
  });
  
  const updatedAlliance = await alliancesCollection.findOne({ _id: new ObjectId(allianceId) });
  return updatedAlliance as Alliance;
}

/**
 * Validate contract terms based on type
 */
function validateContractTerms(contractType: ContractType, terms: AllianceContract['terms']): void {
  switch (contractType) {
    case ContractType.RESOURCE_SHARING:
      if (!terms.resourceSharePercentage || terms.resourceSharePercentage < 1 || terms.resourceSharePercentage > 50) {
        throw new Error('Resource share percentage must be between 1-50%');
      }
      break;
    
    case ContractType.DEFENSE_PACT:
      if (terms.autoJoinDefense === undefined) {
        throw new Error('autoJoinDefense must be specified for defense pact');
      }
      break;
    
    case ContractType.WAR_SUPPORT:
      if (!terms.supportAmount || terms.supportAmount.metal < 0 || terms.supportAmount.energy < 0) {
        throw new Error('Valid support amounts required for war support');
      }
      break;
    
    case ContractType.JOINT_RESEARCH:
      if (!terms.researchSharePercentage || terms.researchSharePercentage < 1 || terms.researchSharePercentage > 30) {
        throw new Error('Research share percentage must be between 1-30%');
      }
      break;
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all alliances for a clan
 * 
 * @param clanId - Clan ID
 * @param includeInactive - Include broken/expired alliances
 * @returns Array of alliances
 */
export async function getAlliancesForClan(
  clanId: string,
  includeInactive = false
): Promise<Alliance[]> {
  const database = getDb();
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  
  const query: any = { clanIds: clanId };
  
  if (!includeInactive) {
    query.status = { $in: [AllianceStatus.PROPOSED, AllianceStatus.ACTIVE] };
  }
  
  const alliances = await alliancesCollection.find(query).sort({ proposedAt: -1 }).toArray();
  return alliances;
}

/**
 * Get active alliance between two clans
 * 
 * @param clanId1 - First clan ID
 * @param clanId2 - Second clan ID
 * @returns Alliance or null
 */
export async function getAllianceBetweenClans(
  clanId1: string,
  clanId2: string
): Promise<Alliance | null> {
  const database = getDb();
  const alliancesCollection = database.collection<Alliance>('clan_alliances');
  
  const alliance = await alliancesCollection.findOne({
    clanIds: { $all: [clanId1, clanId2] },
    status: AllianceStatus.ACTIVE,
  });
  
  return alliance;
}

/**
 * Check if two clans are allies
 * 
 * @param clanId1 - First clan ID
 * @param clanId2 - Second clan ID
 * @returns True if allies
 */
export async function areAllies(clanId1: string, clanId2: string): Promise<boolean> {
  const alliance = await getAllianceBetweenClans(clanId1, clanId2);
  return alliance !== null;
}

/**
 * Get all allies for a clan (IDs only)
 * 
 * @param clanId - Clan ID
 * @returns Array of allied clan IDs
 */
export async function getAllyIds(clanId: string): Promise<string[]> {
  const alliances = await getAlliancesForClan(clanId, false);
  const allyIds = alliances
    .filter((a) => a.status === AllianceStatus.ACTIVE)
    .map((a) => a.clanIds.find((id) => id !== clanId)!)
    .filter(Boolean);
  
  return allyIds;
}
