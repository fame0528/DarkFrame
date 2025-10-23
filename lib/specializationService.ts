/**
 * @file lib/specializationService.ts
 * @created 2025-10-17
 * @overview Specialization system for player doctrine selection and mastery progression
 * 
 * OVERVIEW:
 * Manages the 3 specialization paths (Offensive, Defensive, Tactical) that players can choose
 * at Level 15. Each specialization grants passive bonuses and unlocks 5 exclusive units.
 * Players can respec at a cost and track mastery progression (0-100%) for bonus stats.
 * 
 * SPECIALIZATION PATHS:
 * - Offensive Doctrine: +15% STR, -10% metal cost, unlocks 5 high-damage units
 * - Defensive Doctrine: +15% DEF, -10% energy cost, unlocks 5 high-defense units
 * - Tactical Doctrine: +10% STR/DEF for balanced units, -5% all costs, unlocks 5 hybrid units
 * 
 * MASTERY SYSTEM:
 * - Gain mastery by: building specialized units, winning battles, completing objectives
 * - Mastery grants scaling bonuses: 25% = +5%, 50% = +10%, 75% = +15%, 100% = +20%
 * - 100% mastery unlocks the 5th specialized unit for that path
 */

import { getCollection } from './mongodb';
import { ObjectId } from 'mongodb';
import { logger } from './logger';
import { triggerAchievementCheck } from './statTrackingService';

/**
 * Specialization doctrine types
 */
export enum SpecializationDoctrine {
  None = 'none',
  Offensive = 'offensive',
  Defensive = 'defensive',
  Tactical = 'tactical'
}

/**
 * Specialization data structure
 */
export interface Specialization {
  doctrine: SpecializationDoctrine;
  selectedAt: Date;
  masteryLevel: number; // 0-100
  masteryXP: number; // XP towards next mastery level
  totalUnitsBuilt: number; // Specialized units built
  totalBattlesWon: number; // Battles won with specialized units
  respecHistory: Array<{
    fromDoctrine: SpecializationDoctrine;
    toDoctrine: SpecializationDoctrine;
    timestamp: Date;
    rpSpent: number;
    resourcesSpent: { metal: number; energy: number };
  }>;
  lastRespecAt: Date | null;
}

/**
 * Specialization bonuses and requirements
 */
export const SPECIALIZATION_CONFIG = {
  [SpecializationDoctrine.Offensive]: {
    name: 'Offensive Doctrine',
    icon: '🗡️',
    description: 'Maximum damage output and aggressive tactics. Dominate the battlefield with overwhelming firepower.',
    unlockLevel: 15,
    unlockCost: 25, // RP
    bonuses: {
      strengthMultiplier: 1.15, // +15% STR to offensive units
      metalCostMultiplier: 0.90, // -10% metal cost for offensive units
    },
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-500'
  },
  [SpecializationDoctrine.Defensive]: {
    name: 'Defensive Doctrine',
    icon: '🛡️',
    description: 'Impenetrable fortifications and attrition warfare. Outlast any enemy through superior defense.',
    unlockLevel: 15,
    unlockCost: 25, // RP
    bonuses: {
      defenseMultiplier: 1.15, // +15% DEF to defensive units
      energyCostMultiplier: 0.90, // -10% energy cost for defensive units
    },
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30',
    borderColor: 'border-blue-500'
  },
  [SpecializationDoctrine.Tactical]: {
    name: 'Tactical Doctrine',
    icon: '⚖️',
    description: 'Balanced warfare and versatility. Adapt to any situation with hybrid units and efficiency.',
    unlockLevel: 15,
    unlockCost: 25, // RP
    bonuses: {
      balancedMultiplier: 1.10, // +10% STR and DEF for balanced units (within 20% ratio)
      metalCostMultiplier: 0.95, // -5% metal cost
      energyCostMultiplier: 0.95, // -5% energy cost
    },
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30',
    borderColor: 'border-purple-500'
  }
};

/**
 * Respec configuration
 */
export const RESPEC_CONFIG = {
  rpCost: 50,
  metalCost: 50000,
  energyCost: 50000,
  cooldownHours: 48
};

/**
 * Mastery XP requirements per level
 * Level 0-100, requires 100 XP per level (total 10,000 XP to max)
 */
export const MASTERY_XP_PER_LEVEL = 100;

/**
 * Mastery milestone bonuses
 */
export const MASTERY_MILESTONES = {
  25: { bonusPercent: 5, description: '+5% bonus stats to specialized units' },
  50: { bonusPercent: 10, description: '+10% bonus stats to specialized units' },
  75: { bonusPercent: 15, description: '+15% bonus stats, 4th specialized unit unlocked' },
  100: { bonusPercent: 20, description: '+20% bonus stats, 5th specialized unit unlocked, prestige available' }
};

/**
 * Check if player can choose a specialization
 * 
 * @param playerId - Player username
 * @returns Eligibility check with requirements
 */
export async function canChooseSpecialization(
  playerId: string
): Promise<{ 
  canChoose: boolean; 
  reason?: string; 
  currentLevel?: number;
  requiredLevel?: number;
  currentRP?: number;
  requiredRP?: number;
}> {
  const playersCollection = await getCollection('players');
  const player = await playersCollection.findOne({ username: playerId });

  if (!player) {
    return { canChoose: false, reason: 'Player not found' };
  }

  // Check if already has a specialization
  if (player.specialization && player.specialization.doctrine !== SpecializationDoctrine.None) {
    return { canChoose: false, reason: 'Already has a specialization. Use respec to change.' };
  }

  const currentLevel = player.level || 1;
  const requiredLevel = 15;
  const currentRP = player.researchPoints || 0;
  const requiredRP = 25;

  // Check level requirement
  if (currentLevel < requiredLevel) {
    return {
      canChoose: false,
      reason: `Requires Level ${requiredLevel}`,
      currentLevel,
      requiredLevel,
      currentRP,
      requiredRP
    };
  }

  // Check RP requirement
  if (currentRP < requiredRP) {
    return {
      canChoose: false,
      reason: `Requires ${requiredRP} Research Points`,
      currentLevel,
      requiredLevel,
      currentRP,
      requiredRP
    };
  }

  return { canChoose: true, currentLevel, requiredLevel, currentRP, requiredRP };
}

/**
 * Choose a specialization for the player
 * 
 * @param playerId - Player username
 * @param doctrine - Chosen doctrine
 * @returns Success status and updated specialization
 */
export async function chooseSpecialization(
  playerId: string,
  doctrine: SpecializationDoctrine
): Promise<{
  success: boolean;
  message: string;
  specialization?: Specialization;
  rpRemaining?: number;
}> {
  // Validate doctrine
  if (doctrine === SpecializationDoctrine.None || !SPECIALIZATION_CONFIG[doctrine]) {
    return { success: false, message: 'Invalid specialization doctrine' };
  }

  // Check eligibility
  const eligibility = await canChooseSpecialization(playerId);
  if (!eligibility.canChoose) {
    return { success: false, message: eligibility.reason || 'Cannot choose specialization' };
  }

  const playersCollection = await getCollection('players');
  const config = SPECIALIZATION_CONFIG[doctrine];

  // Create new specialization
  const newSpecialization: Specialization = {
    doctrine,
    selectedAt: new Date(),
    masteryLevel: 0,
    masteryXP: 0,
    totalUnitsBuilt: 0,
    totalBattlesWon: 0,
    respecHistory: [],
    lastRespecAt: null
  };

  // Update player with specialization and deduct RP
  const updateResult = await playersCollection.findOneAndUpdate(
    { 
      username: playerId,
      researchPoints: { $gte: config.unlockCost }
    },
    {
      $inc: { researchPoints: -config.unlockCost },
      $set: { specialization: newSpecialization }
    },
    { returnDocument: 'after' }
  );

  if (!updateResult) {
    return { success: false, message: 'Failed to choose specialization. Insufficient RP or player not found.' };
  }

  // Update RP history manually
  const rpHistoryEntry = {
    amount: -config.unlockCost,
    reason: `Specialized in ${config.name}`,
    timestamp: new Date(),
    balance: updateResult.researchPoints
  };

  await playersCollection.updateOne(
    { username: playerId },
    { $push: { rpHistory: rpHistoryEntry } as any }
  );

  logger.success('Specialization chosen', { username: playerId, doctrine, rpSpent: config.unlockCost });

  return {
    success: true,
    message: `Successfully specialized in ${config.name}!`,
    specialization: newSpecialization,
    rpRemaining: updateResult.researchPoints
  };
}

/**
 * Check if player can respec (change specialization)
 * 
 * @param playerId - Player username
 * @returns Eligibility check with cooldown info
 */
export async function canRespec(
  playerId: string
): Promise<{
  canRespec: boolean;
  reason?: string;
  currentRP?: number;
  currentMetal?: number;
  currentEnergy?: number;
  cooldownRemaining?: number; // hours
}> {
  const playersCollection = await getCollection('players');
  const player = await playersCollection.findOne({ username: playerId });

  if (!player) {
    return { canRespec: false, reason: 'Player not found' };
  }

  if (!player.specialization || player.specialization.doctrine === SpecializationDoctrine.None) {
    return { canRespec: false, reason: 'No specialization to respec from' };
  }

  const currentRP = player.researchPoints || 0;
  const currentMetal = player.resources?.metal || 0;
  const currentEnergy = player.resources?.energy || 0;

  // Check resources
  if (currentRP < RESPEC_CONFIG.rpCost) {
    return { 
      canRespec: false, 
      reason: `Requires ${RESPEC_CONFIG.rpCost} RP (have ${currentRP})`,
      currentRP,
      currentMetal,
      currentEnergy
    };
  }

  if (currentMetal < RESPEC_CONFIG.metalCost) {
    return { 
      canRespec: false, 
      reason: `Requires ${RESPEC_CONFIG.metalCost.toLocaleString()} Metal (have ${currentMetal.toLocaleString()})`,
      currentRP,
      currentMetal,
      currentEnergy
    };
  }

  if (currentEnergy < RESPEC_CONFIG.energyCost) {
    return { 
      canRespec: false, 
      reason: `Requires ${RESPEC_CONFIG.energyCost.toLocaleString()} Energy (have ${currentEnergy.toLocaleString()})`,
      currentRP,
      currentMetal,
      currentEnergy
    };
  }

  // Check cooldown
  if (player.specialization.lastRespecAt) {
    const cooldownMs = RESPEC_CONFIG.cooldownHours * 60 * 60 * 1000;
    const timeSinceRespec = Date.now() - new Date(player.specialization.lastRespecAt).getTime();
    
    if (timeSinceRespec < cooldownMs) {
      const remainingMs = cooldownMs - timeSinceRespec;
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      
      return {
        canRespec: false,
        reason: `Respec on cooldown. ${remainingHours} hours remaining.`,
        currentRP,
        currentMetal,
        currentEnergy,
        cooldownRemaining: remainingHours
      };
    }
  }

  return { canRespec: true, currentRP, currentMetal, currentEnergy };
}

/**
 * Respec player to a new specialization
 * 
 * @param playerId - Player username
 * @param newDoctrine - New doctrine to spec into
 * @returns Success status and updated specialization
 */
export async function respecSpecialization(
  playerId: string,
  newDoctrine: SpecializationDoctrine
): Promise<{
  success: boolean;
  message: string;
  specialization?: Specialization;
  rpRemaining?: number;
  metalRemaining?: number;
  energyRemaining?: number;
}> {
  // Validate doctrine
  if (newDoctrine === SpecializationDoctrine.None || !SPECIALIZATION_CONFIG[newDoctrine]) {
    return { success: false, message: 'Invalid specialization doctrine' };
  }

  // Check eligibility
  const eligibility = await canRespec(playerId);
  if (!eligibility.canRespec) {
    return { success: false, message: eligibility.reason || 'Cannot respec' };
  }

  const playersCollection = await getCollection('players');
  const player = await playersCollection.findOne({ username: playerId });

  if (!player || !player.specialization) {
    return { success: false, message: 'Player or specialization not found' };
  }

  const oldDoctrine = player.specialization.doctrine;
  if (oldDoctrine === newDoctrine) {
    return { success: false, message: 'Already specialized in this doctrine' };
  }

  const oldConfig = SPECIALIZATION_CONFIG[oldDoctrine as keyof typeof SPECIALIZATION_CONFIG];
  const newConfig = SPECIALIZATION_CONFIG[newDoctrine as keyof typeof SPECIALIZATION_CONFIG];

  const respecEntry = {
    fromDoctrine: oldDoctrine,
    toDoctrine: newDoctrine,
    timestamp: new Date(),
    rpSpent: RESPEC_CONFIG.rpCost,
    resourcesSpent: {
      metal: RESPEC_CONFIG.metalCost,
      energy: RESPEC_CONFIG.energyCost
    }
  };

  // Update specialization (keep mastery progress, reset to 0 for new spec)
  const updatedSpecialization: Specialization = {
    doctrine: newDoctrine,
    selectedAt: new Date(),
    masteryLevel: 0,
    masteryXP: 0,
    totalUnitsBuilt: 0,
    totalBattlesWon: 0,
    respecHistory: [...player.specialization.respecHistory, respecEntry],
    lastRespecAt: new Date()
  };

  // Deduct costs and update specialization
  const updateResult = await playersCollection.findOneAndUpdate(
    {
      username: playerId,
      researchPoints: { $gte: RESPEC_CONFIG.rpCost },
      'resources.metal': { $gte: RESPEC_CONFIG.metalCost },
      'resources.energy': { $gte: RESPEC_CONFIG.energyCost }
    },
    {
      $inc: {
        researchPoints: -RESPEC_CONFIG.rpCost,
        'resources.metal': -RESPEC_CONFIG.metalCost,
        'resources.energy': -RESPEC_CONFIG.energyCost
      },
      $set: { specialization: updatedSpecialization }
    },
    { returnDocument: 'after' }
  );

  if (!updateResult) {
    return { success: false, message: 'Failed to respec. Insufficient resources.' };
  }

  logger.success('Specialization respec completed', {
    username: playerId,
    from: oldDoctrine,
    to: newDoctrine,
    costs: respecEntry.resourcesSpent
  });

  return {
    success: true,
    message: `Successfully respecialized from ${oldConfig.name} to ${newConfig.name}!`,
    specialization: updatedSpecialization,
    rpRemaining: updateResult.researchPoints,
    metalRemaining: updateResult.resources?.metal || 0,
    energyRemaining: updateResult.resources?.energy || 0
  };
}

/**
 * Award mastery XP and check for level-ups
 * 
 * @param playerId - Player username
 * @param xpAmount - Mastery XP to award
 * @param reason - Reason for mastery gain
 * @returns Mastery level-up info
 */
export async function awardMasteryXP(
  playerId: string,
  xpAmount: number,
  reason: string
): Promise<{
  success: boolean;
  message: string;
  newMasteryLevel?: number;
  newMasteryXP?: number;
  leveledUp?: boolean;
  milestonesReached?: number[];
}> {
  const playersCollection = await getCollection('players');
  const player = await playersCollection.findOne({ username: playerId });

  if (!player || !player.specialization || player.specialization.doctrine === SpecializationDoctrine.None) {
    return { success: false, message: 'Player has no specialization' };
  }

  const currentMasteryXP = player.specialization.masteryXP + xpAmount;
  const currentMasteryLevel = player.specialization.masteryLevel;
  let newMasteryLevel = currentMasteryLevel;
  const milestonesReached: number[] = [];

  // Calculate level-ups (max level 100)
  while (newMasteryLevel < 100 && currentMasteryXP >= (newMasteryLevel + 1) * MASTERY_XP_PER_LEVEL) {
    newMasteryLevel++;
    
    // Check for milestones (25, 50, 75, 100)
    if ([25, 50, 75, 100].includes(newMasteryLevel)) {
      milestonesReached.push(newMasteryLevel);
    }
  }

  const leveledUp = newMasteryLevel > currentMasteryLevel;

  // Update player
  await playersCollection.updateOne(
    { username: playerId },
    {
      $set: {
        'specialization.masteryXP': currentMasteryXP,
        'specialization.masteryLevel': newMasteryLevel
      }
    }
  );

  // Check achievements if mastery level changed or hit 100%
  if (leveledUp || newMasteryLevel === 100) {
    await triggerAchievementCheck(playerId);
  }

  if (leveledUp) {
    logger.success('Mastery level-up', {
      username: playerId,
      oldLevel: currentMasteryLevel,
      newLevel: newMasteryLevel,
      reason
    });
  }

  return {
    success: true,
    message: leveledUp 
      ? `Mastery increased to ${newMasteryLevel}%!` 
      : `Gained ${xpAmount} mastery XP`,
    newMasteryLevel,
    newMasteryXP: currentMasteryXP,
    leveledUp,
    milestonesReached
  };
}

/**
 * Get player's specialization status
 * 
 * @param playerId - Player username
 * @returns Full specialization info
 */
export async function getSpecializationStatus(playerId: string) {
  const playersCollection = await getCollection('players');
  const player = await playersCollection.findOne({ username: playerId });

  if (!player) {
    return null;
  }

  const specialization = player.specialization || {
    doctrine: SpecializationDoctrine.None,
    selectedAt: null,
    masteryLevel: 0,
    masteryXP: 0,
    totalUnitsBuilt: 0,
    totalBattlesWon: 0,
    respecHistory: [],
    lastRespecAt: null
  };

  const config = specialization.doctrine !== SpecializationDoctrine.None 
    ? SPECIALIZATION_CONFIG[specialization.doctrine as keyof typeof SPECIALIZATION_CONFIG]
    : null;

  return {
    specialization,
    config,
    playerLevel: player.level || 1,
    playerRP: player.researchPoints || 0,
    playerResources: player.resources || { metal: 0, energy: 0 },
    canChoose: await canChooseSpecialization(playerId),
    canRespec: await canRespec(playerId)
  };
}
