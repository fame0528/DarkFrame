/**
 * Territory Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan territory control system with tile claiming, abandonment, and
 * defense bonus calculations. Validates adjacency requirements and territory limits.
 * Integrates with research/perk bonuses for reduced claiming costs.
 * 
 * Features:
 * - Territory claiming with cost (500 Metal + 500 Energy per tile, reduced by perks)
 * - Adjacency validation (new claims must be adjacent to existing territory)
 * - Defense bonus calculation (+10% per adjacent clan tile, max +50%)
 * - Territory abandonment with confirmation
 * - Territory lookup by coordinates
 * - Clan territory listing
 * - Territory limit enforcement
 * 
 * Integration:
 * - MongoDB collections: clans, clan_activities
 * - Perk system (territory cost reduction)
 * - Research bonuses (defense multipliers)
 * - Activity logging for claims/abandons
 * 
 * @module lib/territoryService
 */

import { MongoClient, Db, ObjectId } from 'mongodb';

let client: MongoClient;
let db: Db;

/**
 * Initialize the territory service with database connection
 * MUST be called before using any service functions
 * 
 * @param mongoClient - MongoDB client instance
 * @param database - Database instance
 */
export function initializeTerritoryService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get database instance (throws if not initialized)
 * @returns Database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Territory service not initialized. Call initializeTerritoryService first.');
  }
  return db;
}

// Territory constants
export const TERRITORY_CONSTANTS = {
  BASE_CLAIM_COST_METAL: 500,
  BASE_CLAIM_COST_ENERGY: 500,
  DEFENSE_BONUS_PER_TILE: 10, // Percentage
  MAX_DEFENSE_BONUS: 50, // Percentage
  MAX_TERRITORIES: 100, // Default max territories per clan (deprecated - use level-based caps)
};

// Territory income constants (passive farming)
export const TERRITORY_INCOME_CONSTANTS = {
  BASE_INCOME_METAL: 1000,      // Base metal income per territory per day
  BASE_INCOME_ENERGY: 1000,     // Base energy income per territory per day
  SCALING_FACTOR: 0.1,          // 10% increase per clan level
  COLLECTION_HOUR: 0,           // UTC hour for daily collection (00:00)
};

// Territory limit scaling by clan level
export const TERRITORY_LEVEL_CAPS = [
  { minLevel: 1, maxTerritories: 25 },
  { minLevel: 6, maxTerritories: 50 },
  { minLevel: 11, maxTerritories: 100 },
  { minLevel: 16, maxTerritories: 200 },
  { minLevel: 21, maxTerritories: 400 },
  { minLevel: 26, maxTerritories: 700 },
  { minLevel: 31, maxTerritories: 1000 },
];

// Territory claiming cost tiers
export const TERRITORY_COST_TIERS = [
  { upTo: 10, costMetal: 2500, costEnergy: 2500 },
  { upTo: 25, costMetal: 3000, costEnergy: 3000 },
  { upTo: 50, costMetal: 3500, costEnergy: 3500 },
  { upTo: 100, costMetal: 4000, costEnergy: 4000 },
  { upTo: 250, costMetal: 5000, costEnergy: 5000 },
  { upTo: 500, costMetal: 6000, costEnergy: 6000 },
  { upTo: 750, costMetal: 7000, costEnergy: 7000 },
  { upTo: 1000, costMetal: 8000, costEnergy: 8000 },
];

export interface Territory {
  x: number;
  y: number;
  clanId: string;
  clanTag: string;
  claimedAt: Date;
  claimedBy: string; // Player username
}

/**
 * Claim territory tile for clan
 * Validates adjacency, cost, and territory limits
 * 
 * @param clanId - Clan ID
 * @param playerId - Player claiming territory (must be Officer+)
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @returns Claimed territory details and updated clan stats
 * @throws Error if requirements not met or insufficient resources
 * @example
 * const result = await claimTerritory('clan123', 'player456', 10, 15);
 * // result: { success: true, territory: {...}, cost: {...} }
 */
export async function claimTerritory(
  clanId: string,
  playerId: string,
  x: number,
  y: number
): Promise<{
  success: boolean;
  territory: Territory;
  cost: { metal: number; energy: number };
  defenseBonus: number;
}> {
  const database = getDb();

  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  // Verify player is in clan and has permissions
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }

  // Check permissions (Officer, Co-Leader, or Leader)
  const allowedRoles = ['LEADER', 'CO_LEADER', 'OFFICER'];
  if (!allowedRoles.includes(member.role)) {
    throw new Error('Insufficient permissions to claim territory');
  }

  // Check if tile is already claimed
  const existingTerritory = clan.territories?.find((t: any) => t.x === x && t.y === y);
  if (existingTerritory) {
    throw new Error('Territory already claimed by your clan');
  }

  // Check if tile is claimed by another clan
  const otherClanTerritory = await database.collection('clans').findOne({
    _id: { $ne: new ObjectId(clanId) },
    'territories.x': x,
    'territories.y': y,
  });
  if (otherClanTerritory) {
    throw new Error('Territory already claimed by another clan');
  }

  // Validate adjacency (must be adjacent to existing territory, unless first claim)
  const currentTerritories = clan.territories || [];
  if (currentTerritories.length > 0) {
    const isAdjacent = currentTerritories.some((t: any) => {
      const dx = Math.abs(t.x - x);
      const dy = Math.abs(t.y - y);
      return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    });

    if (!isAdjacent) {
      throw new Error('Territory must be adjacent to existing clan territory');
    }
  }

  // Check territory limit (use level-based caps)
  const clanLevel = clan.level || 1;
  const maxTerritories = getMaxTerritoriesByLevel(clanLevel);
  if (currentTerritories.length >= maxTerritories) {
    throw new Error(`Territory limit reached (${maxTerritories} for level ${clanLevel})`);
  }

  // Calculate base cost using tiered system
  const territoryCount = currentTerritories.length;
  const baseCost = getTerritoryClaimCost(territoryCount);
  
  // Apply perk/research reductions
  let costReduction = 0;
  
  // Check for territory cost reduction from perks
  const activePerks = clan.activePerks || [];
  for (const perk of activePerks) {
    if (perk.bonus?.type === 'territory_cost') {
      costReduction += perk.bonus.value;
    }
  }

  const finalCostMetal = Math.floor(baseCost.metal * (1 - costReduction / 100));
  const finalCostEnergy = Math.floor(baseCost.energy * (1 - costReduction / 100));

  // Check clan bank balance
  const bankMetal = clan.bank?.treasury?.metal || 0;
  const bankEnergy = clan.bank?.treasury?.energy || 0;

  if (bankMetal < finalCostMetal) {
    throw new Error(
      `Insufficient metal in clan bank (need ${finalCostMetal}, have ${bankMetal})`
    );
  }
  if (bankEnergy < finalCostEnergy) {
    throw new Error(
      `Insufficient energy in clan bank (need ${finalCostEnergy}, have ${bankEnergy})`
    );
  }

  // Create territory object
  const newTerritory: Territory = {
    x,
    y,
    clanId,
    clanTag: clan.tag,
    claimedAt: new Date(),
    claimedBy: playerId,
  };

  // Deduct cost and add territory
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    {
      $inc: {
        'bank.treasury.metal': -finalCostMetal,
        'bank.treasury.energy': -finalCostEnergy,
        'stats.totalTerritories': 1,
      },
      $push: { territories: newTerritory } as any,
    }
  );

  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'TERRITORY_CLAIMED',
    playerId,
    timestamp: new Date(),
    metadata: {
      x,
      y,
      cost: { metal: finalCostMetal, energy: finalCostEnergy },
      claimedBy: playerId,
    },
  });

  // Calculate defense bonus for this tile
  const defenseBonus = getDefenseBonus(clanId, x, y, [...currentTerritories, newTerritory]);

  return {
    success: true,
    territory: newTerritory,
    cost: { metal: finalCostMetal, energy: finalCostEnergy },
    defenseBonus,
  };
}

/**
 * Abandon territory tile
 * Removes tile from clan control (no refund)
 * 
 * @param clanId - Clan ID
 * @param playerId - Player abandoning territory (must be Officer+)
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @returns Success status
 * @throws Error if not found or insufficient permissions
 */
export async function abandonTerritory(
  clanId: string,
  playerId: string,
  x: number,
  y: number
): Promise<{ success: boolean; message: string }> {
  const database = getDb();

  // Get clan
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  // Verify player is in clan and has permissions
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }

  // Check permissions
  const allowedRoles = ['LEADER', 'CO_LEADER', 'OFFICER'];
  if (!allowedRoles.includes(member.role)) {
    throw new Error('Insufficient permissions to abandon territory');
  }

  // Check if territory exists
  const territory = clan.territories?.find((t: any) => t.x === x && t.y === y);
  if (!territory) {
    throw new Error('Territory not found');
  }

  // Remove territory
  await database.collection('clans').updateOne(
    { _id: new ObjectId(clanId) },
    {
      $pull: { territories: { x, y } } as any,
      $inc: { 'stats.totalTerritories': -1 },
    }
  );

  // Log activity
  await database.collection('clan_activities').insertOne({
    clanId,
    type: 'TERRITORY_ABANDONED',
    playerId,
    timestamp: new Date(),
    metadata: {
      x,
      y,
      abandonedBy: playerId,
    },
  });

  return {
    success: true,
    message: `Territory (${x}, ${y}) abandoned`,
  };
}

/**
 * Get territory at specific coordinates
 * Returns clan info if territory is claimed
 * 
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @returns Territory info or null if unclaimed
 */
export async function getTerritoryAt(
  x: number,
  y: number
): Promise<{ clanId: string; clanTag: string; clanName: string; claimedAt: Date } | null> {
  const database = getDb();

  const clan = await database.collection('clans').findOne({
    'territories.x': x,
    'territories.y': y,
  });

  if (!clan) {
    return null;
  }

  const territory = clan.territories.find((t: any) => t.x === x && t.y === y);

  return {
    clanId: clan._id.toString(),
    clanTag: clan.tag,
    clanName: clan.name,
    claimedAt: territory.claimedAt,
  };
}

/**
 * Get all territories for a clan
 * Returns array of territory objects
 * 
 * @param clanId - Clan ID
 * @returns Array of territories
 */
export async function getClanTerritories(clanId: string): Promise<Territory[]> {
  const database = getDb();

  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }

  return clan.territories || [];
}

/**
 * Calculate defense bonus for a territory
 * Based on number of adjacent clan tiles (+10% per tile, max +50%)
 * 
 * @param clanId - Clan ID
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param territories - Optional territory array (for calculations before DB update)
 * @returns Defense bonus percentage
 */
export function getDefenseBonus(
  clanId: string,
  x: number,
  y: number,
  territories?: Territory[]
): number {
  if (!territories) {
    // If no territories provided, this would need to fetch from DB
    // For now, return 0 (caller should provide territories)
    return 0;
  }

  // Count adjacent tiles owned by same clan
  let adjacentCount = 0;
  const adjacentOffsets = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const offset of adjacentOffsets) {
    const adjX = x + offset.dx;
    const adjY = y + offset.dy;
    const hasAdjacentTile = territories.some((t) => t.x === adjX && t.y === adjY);
    if (hasAdjacentTile) {
      adjacentCount++;
    }
  }

  // Calculate bonus (+10% per adjacent tile, max +50%)
  const bonus = Math.min(
    adjacentCount * TERRITORY_CONSTANTS.DEFENSE_BONUS_PER_TILE,
    TERRITORY_CONSTANTS.MAX_DEFENSE_BONUS
  );

  return bonus;
}

/**
 * Validate territory claim
 * Checks all requirements without making changes
 * 
 * @param clanId - Clan ID
 * @param playerId - Player attempting claim
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @returns Validation result with details
 */
export async function validateTerritoryClaim(
  clanId: string,
  playerId: string,
  x: number,
  y: number
): Promise<{
  valid: boolean;
  errors: string[];
  cost?: { metal: number; energy: number };
  adjacencyValid?: boolean;
}> {
  const database = getDb();
  const errors: string[] = [];

  try {
    // Get clan
    const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
    if (!clan) {
      errors.push('Clan not found');
      return { valid: false, errors };
    }

    // Check member
    const member = clan.members.find((m: any) => m.playerId === playerId);
    if (!member) {
      errors.push('Player is not a member of this clan');
    }

    // Check permissions
    const allowedRoles = ['LEADER', 'CO_LEADER', 'OFFICER'];
    if (member && !allowedRoles.includes(member.role)) {
      errors.push('Insufficient permissions (Officer+ required)');
    }

    // Check if already claimed
    const existingTerritory = clan.territories?.find((t: any) => t.x === x && t.y === y);
    if (existingTerritory) {
      errors.push('Territory already claimed by your clan');
    }

    // Check other clans
    const otherClan = await database.collection('clans').findOne({
      _id: { $ne: new ObjectId(clanId) },
      'territories.x': x,
      'territories.y': y,
    });
    if (otherClan) {
      errors.push('Territory already claimed by another clan');
    }

    // Check adjacency
    const currentTerritories = clan.territories || [];
    let adjacencyValid = true;
    if (currentTerritories.length > 0) {
      const isAdjacent = currentTerritories.some((t: any) => {
        const dx = Math.abs(t.x - x);
        const dy = Math.abs(t.y - y);
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
      });

      if (!isAdjacent) {
        errors.push('Territory must be adjacent to existing clan territory');
        adjacencyValid = false;
      }
    }

    // Check limit (use level-based caps)
    const clanLevel = clan.level || 1;
    const maxTerritories = getMaxTerritoriesByLevel(clanLevel);
    if (currentTerritories.length >= maxTerritories) {
      errors.push(`Territory limit reached (${maxTerritories} for level ${clanLevel})`);
    }

    // Calculate cost using tiered system
    const territoryCount = currentTerritories.length;
    const baseCost = getTerritoryClaimCost(territoryCount);
    
    let costReduction = 0;
    const activePerks = clan.activePerks || [];
    for (const perk of activePerks) {
      if (perk.bonus?.type === 'territory_cost') {
        costReduction += perk.bonus.value;
      }
    }

    const finalCostMetal = Math.floor(baseCost.metal * (1 - costReduction / 100));
    const finalCostEnergy = Math.floor(baseCost.energy * (1 - costReduction / 100));

    // Check balance
    const bankMetal = clan.bank?.treasury?.metal || 0;
    const bankEnergy = clan.bank?.treasury?.energy || 0;

    if (bankMetal < finalCostMetal) {
      errors.push(`Insufficient metal (need ${finalCostMetal}, have ${bankMetal})`);
    }
    if (bankEnergy < finalCostEnergy) {
      errors.push(`Insufficient energy (need ${finalCostEnergy}, have ${bankEnergy})`);
    }

    return {
      valid: errors.length === 0,
      errors,
      cost: { metal: finalCostMetal, energy: finalCostEnergy },
      adjacencyValid,
    };
  } catch (error: any) {
    errors.push(error.message);
    return { valid: false, errors };
  }
}

/**
 * Get maximum territories allowed for clan based on level
 * 
 * @param clanLevel - Current clan level
 * @returns Maximum territory count
 * @example
 * const max = getMaxTerritoriesByLevel(25); // Returns 400
 */
export function getMaxTerritoriesByLevel(clanLevel: number): number {
  // Find the highest applicable cap
  let maxTerritories = TERRITORY_LEVEL_CAPS[0].maxTerritories;
  
  for (const cap of TERRITORY_LEVEL_CAPS) {
    if (clanLevel >= cap.minLevel) {
      maxTerritories = cap.maxTerritories;
    } else {
      break;
    }
  }
  
  return maxTerritories;
}

/**
 * Get territory claiming cost based on current territory count
 * 
 * @param currentTerritoryCount - How many territories clan currently owns
 * @returns Cost in metal and energy
 * @example
 * const cost = getTerritoryClaimCost(75); // Returns { metal: 4000, energy: 4000 }
 */
export function getTerritoryClaimCost(currentTerritoryCount: number): { metal: number; energy: number } {
  // Find applicable tier
  let costMetal = TERRITORY_COST_TIERS[TERRITORY_COST_TIERS.length - 1].costMetal;
  let costEnergy = TERRITORY_COST_TIERS[TERRITORY_COST_TIERS.length - 1].costEnergy;
  
  for (const tier of TERRITORY_COST_TIERS) {
    if (currentTerritoryCount < tier.upTo) {
      costMetal = tier.costMetal;
      costEnergy = tier.costEnergy;
      break;
    }
  }
  
  return { metal: costMetal, energy: costEnergy };
}

/**
 * Calculate daily passive income from territories
 * Income scales with clan level: baseIncome * (1 + (level - 1) * scalingFactor)
 * 
 * @param clanLevel - Current clan level
 * @param territoryCount - Number of territories owned
 * @returns Daily income in metal and energy
 * @example
 * const income = calculateDailyPassiveIncome(20, 75);
 * // Returns { metalPerDay: 217500, energyPerDay: 217500, perTerritory: 2900 }
 */
export function calculateDailyPassiveIncome(
  clanLevel: number,
  territoryCount: number
): {
  metalPerDay: number;
  energyPerDay: number;
  perTerritory: number;
} {
  // Calculate income per territory based on clan level
  const incomePerTerritory = Math.floor(
    TERRITORY_INCOME_CONSTANTS.BASE_INCOME_METAL * 
    (1 + (clanLevel - 1) * TERRITORY_INCOME_CONSTANTS.SCALING_FACTOR)
  );
  
  const totalMetalPerDay = incomePerTerritory * territoryCount;
  const totalEnergyPerDay = incomePerTerritory * territoryCount;
  
  return {
    metalPerDay: totalMetalPerDay,
    energyPerDay: totalEnergyPerDay,
    perTerritory: incomePerTerritory,
  };
}

/**
 * Collect daily passive income from territories and deposit to clan bank
 * Should be called automatically via cron job at midnight UTC
 * 
 * @param clanId - Clan ID to collect income for
 * @returns Collection result with amounts and timestamp
 * @throws Error if clan not found or collection already done today
 * @example
 * const result = await collectDailyTerritoryIncome('clan123');
 * // result: { success: true, metalCollected: 217500, energyCollected: 217500, timestamp: Date }
 */
export async function collectDailyTerritoryIncome(
  clanId: string
): Promise<{
  success: boolean;
  metalCollected: number;
  energyCollected: number;
  territoryCount: number;
  timestamp: Date;
  message: string;
}> {
  const database = getDb();
  
  try {
    // Get clan
    const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
    if (!clan) {
      throw new Error('Clan not found');
    }
    
    const territoryCount = clan.territories?.length || 0;
    
    // No territories = no income
    if (territoryCount === 0) {
      return {
        success: true,
        metalCollected: 0,
        energyCollected: 0,
        territoryCount: 0,
        timestamp: new Date(),
        message: 'No territories to collect income from',
      };
    }
    
    // Check if already collected today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const lastCollection = clan.lastTerritoryIncomeCollection;
    if (lastCollection) {
      const lastCollectionDate = new Date(lastCollection);
      if (lastCollectionDate >= todayStart) {
        return {
          success: false,
          metalCollected: 0,
          energyCollected: 0,
          territoryCount,
          timestamp: now,
          message: 'Income already collected today',
        };
      }
    }
    
    // Calculate income
    const clanLevel = clan.level || 1;
    const income = calculateDailyPassiveIncome(clanLevel, territoryCount);
    
    // Update clan bank
    const updateResult = await database.collection('clans').updateOne(
      { _id: new ObjectId(clanId) },
      {
        $inc: {
          'bank.treasury.metal': income.metalPerDay,
          'bank.treasury.energy': income.energyPerDay,
        },
        $set: {
          lastTerritoryIncomeCollection: now,
        },
      } as any
    );
    
    // Add transaction to history separately
    await database.collection('clans').updateOne(
      { _id: new ObjectId(clanId) },
      {
        $push: {
          'bank.transactionHistory': {
            type: 'TERRITORY_INCOME',
            amount: {
              metal: income.metalPerDay,
              energy: income.energyPerDay,
            },
            timestamp: now,
            description: `Daily territory income from ${territoryCount} territories (${income.perTerritory} M/E per territory)`,
          },
        },
      } as any
    );
    
    if (updateResult.modifiedCount === 0) {
      throw new Error('Failed to update clan bank');
    }
    
    // Log activity
    await database.collection('clan_activities').insertOne({
      clanId,
      type: 'TERRITORY_INCOME_COLLECTED',
      timestamp: now,
      details: {
        territoryCount,
        metalCollected: income.metalPerDay,
        energyCollected: income.energyPerDay,
        perTerritory: income.perTerritory,
        clanLevel,
      },
    });
    
    return {
      success: true,
      metalCollected: income.metalPerDay,
      energyCollected: income.energyPerDay,
      territoryCount,
      timestamp: now,
      message: `Collected ${income.metalPerDay} M + ${income.energyPerDay} E from ${territoryCount} territories`,
    };
  } catch (error: any) {
    return {
      success: false,
      metalCollected: 0,
      energyCollected: 0,
      territoryCount: 0,
      timestamp: new Date(),
      message: `Error collecting income: ${error.message}`,
    };
  }
}

/**
 * Get projected income for a clan
 * Does not collect, just calculates what would be collected
 * 
 * @param clanId - Clan ID
 * @returns Projected income details
 * @example
 * const projection = await getProjectedTerritoryIncome('clan123');
 * // projection: { metalPerDay: 217500, energyPerDay: 217500, perTerritory: 2900, territoryCount: 75 }
 */
export async function getProjectedTerritoryIncome(
  clanId: string
): Promise<{
  metalPerDay: number;
  energyPerDay: number;
  perTerritory: number;
  territoryCount: number;
  clanLevel: number;
  nextCollection: Date;
  canCollectNow: boolean;
}> {
  const database = getDb();
  
  const clan = await database.collection('clans').findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  const territoryCount = clan.territories?.length || 0;
  const clanLevel = clan.level || 1;
  
  const income = calculateDailyPassiveIncome(clanLevel, territoryCount);
  
  // Calculate next collection time (midnight UTC)
  const now = new Date();
  const nextCollection = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  nextCollection.setUTCHours(TERRITORY_INCOME_CONSTANTS.COLLECTION_HOUR, 0, 0, 0);
  
  // Check if can collect now
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastCollection = clan.lastTerritoryIncomeCollection;
  const canCollectNow = !lastCollection || new Date(lastCollection) < todayStart;
  
  return {
    ...income,
    territoryCount,
    clanLevel,
    nextCollection,
    canCollectNow,
  };
}
