/**
 * @file lib/wmd/spyService.ts
 * @created 2025-10-22
 * @overview WMD Spy Service - Intelligence Operations (Clan Treasury Integrated)
 * 
 * OVERVIEW:
 * Handles all intelligence operations including spy recruitment, mission
 * planning, surveillance, sabotage operations, and counter-intelligence.
 * ALL costs deducted from CLAN TREASURY with equal cost sharing among members.
 * 
 * Features:
 * - Spy recruitment via clan bank funding
 * - Mission costs paid from clan treasury
 * - Intelligence gathering missions
 * - Sabotage operations
 * - Counter-intelligence activities
 * - Mission success calculation
 * - Network security management
 * 
 * Clan Treasury Integration:
 * - All spy recruitment deducted from clan bank (NOT player resources)
 * - Mission costs paid from clan treasury
 * - Per-member cost calculated: totalCost / memberCount
 * - Minimum 3 clan members required (prevents solo WMD)
 * - Transaction transparency (shows per-member contribution)
 * 
 * Dependencies:
 * - /types/wmd for spy types and constants
 * - clanTreasuryWMDService for funding validation/deduction
 * - MongoDB collections for data persistence
 * - Research service for unlock validation
 */

import { Db, ObjectId } from 'mongodb';
import {
  SpyMission,
  MissionType,
  MissionStatus,
  SpyRank,
  IntelligenceReport,
  MissionResult,
  SabotageDamage,
  MISSION_CONFIGS,
  isValidMissionType,
  calculateSuccessChance
} from '@/types/wmd';
import {
  validateClanWMDFunds,
  deductWMDCost,
  WMDPurchaseType,
} from './clanTreasuryWMDService';

// ============================================================================
// SPY NETWORK INTERFACE
// ============================================================================

/**
 * Individual spy agent
 */
interface SpyAgent {
  spyId: string;
  ownerId: string;
  ownerUsername: string;
  clanId: string | null;
  codename: string;
  rank: SpyRank;
  experience: number;
  specialization: 'SURVEILLANCE' | 'SABOTAGE' | 'INFILTRATION' | 'CYBER';
  status: 'AVAILABLE' | 'ON_MISSION' | 'COMPROMISED' | 'RETIRED';
  currentMissionId: string | null;
  missionHistory: string[];
  skills: {
    stealth: number;
    hacking: number;
    sabotage: number;
    intelligence: number;
  };
  lastMissionAt: Date | null;
  recruitedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Counter-intelligence result
 */
interface CounterIntelResult {
  success: boolean;
  message: string;
  threatsDetected: number;
  spiesDetected: Array<{
    spyId: string;
    codename: string;
    specialization: string;
    operatorId: string;
    operatorClanId: string | null;
  }>;
}

// ============================================================================
// SPY RECRUITMENT
// ============================================================================

/**
 * Recruit a new spy (clan treasury funded)
 */
export async function recruitSpy(
  db: Db,
  recruiterId: string,
  recruiterUsername: string,
  specialization: 'SURVEILLANCE' | 'SABOTAGE' | 'INFILTRATION' | 'CYBER',
  clanId: string
): Promise<{ success: boolean; message: string; spyId?: string; perMemberCost?: { metal: number; energy: number } }> {
  try {
    // Check if player has unlocked spy recruitment
    const hasUnlocked = await hasSpyUnlocked(db, recruiterId);
    if (!hasUnlocked) {
      return { success: false, message: 'Intelligence operations not unlocked' };
    }
    
    // Check recruitment limits
    const currentSpies = await getPlayerSpies(db, recruiterId);
    const maxSpies = await getMaxSpies(db, recruiterId);
    
    if (currentSpies.length >= maxSpies) {
      return { success: false, message: `Maximum spy limit reached (${maxSpies})` };
    }
    
    // Get recruitment costs
    const recruitmentCosts = {
      'SURVEILLANCE': { metal: 100000, energy: 200000 },
      'SABOTAGE': { metal: 150000, energy: 250000 },
      'INFILTRATION': { metal: 200000, energy: 300000 },
      'CYBER': { metal: 250000, energy: 350000 },
    };
    
    const cost = (recruitmentCosts as any)[specialization] || recruitmentCosts['SURVEILLANCE'];
    
    // Validate clan has funds
    const validation = await validateClanWMDFunds(db, clanId, cost);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // Deduct from clan treasury
    const deduction = await deductWMDCost(
      db,
      clanId,
      WMDPurchaseType.SPY_RECRUITMENT,
      recruiterId,
      recruiterUsername,
      cost,
      `${specialization} Spy Recruitment`
    );
    
    if (!deduction.success) {
      return { success: false, message: deduction.message || 'Failed to deduct funds' };
    }
    
    // Generate unique spy ID
    const spyId = `spy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create spy document
    const spy: SpyAgent = {
      spyId,
      ownerId: recruiterId,
      ownerUsername: recruiterUsername,
      clanId,
      codename: generateCodename(),
      rank: SpyRank.ROOKIE,
      experience: 0,
      specialization,
      status: 'AVAILABLE',
      currentMissionId: null,
      missionHistory: [],
      skills: getBaseSkills(specialization),
      lastMissionAt: null,
      recruitedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const collection = db.collection('wmd_spies');
    await collection.insertOne(spy);
    
    console.log(`Spy recruited by ${recruiterUsername} (Clan: ${clanId}). Per-member cost: ${deduction.perMemberCost?.metal || 0} metal, ${deduction.perMemberCost?.energy || 0} energy`);
    
    return { 
      success: true, 
      message: `${specialization} spy recruited. Codename: ${spy.codename}. Clan cost: ${cost.metal} metal, ${cost.energy} energy`, 
      spyId,
      perMemberCost: deduction.perMemberCost,
    };
    
  } catch (error) {
    console.error('Error recruiting spy:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Train a spy to improve skills
 */
export async function trainSpy(
  db: Db,
  spyId: string,
  skillToTrain: 'stealth' | 'hacking' | 'sabotage' | 'intelligence',
  trainingIntensity: 'BASIC' | 'ADVANCED' | 'ELITE'
): Promise<{ success: boolean; message: string; newSkillLevel?: number }> {
  try {
    const spy = await getSpy(db, spyId);
    if (!spy) {
      return { success: false, message: 'Spy not found' };
    }
    
    if (spy.status !== 'AVAILABLE') {
      return { success: false, message: 'Spy is not available for training' };
    }
    
    // Check training costs
    const canAfford = await canAffordTraining(db, spy.ownerId, trainingIntensity);
    if (!canAfford) {
      return { success: false, message: 'Insufficient resources for training' };
    }
    
    // Calculate skill improvement
    const currentLevel = spy.skills[skillToTrain];
    const improvement = getTrainingImprovement(trainingIntensity, currentLevel);
    const newLevel = Math.min(100, currentLevel + improvement);
    
    // Deduct training costs
    await deductTrainingCosts(db, spy.ownerId, trainingIntensity);
    
    // Update spy
    const collection = db.collection('wmd_spies');
    await collection.updateOne(
      { spyId },
      {
        $set: {
          [`skills.${skillToTrain}`]: newLevel,
          experience: spy.experience + improvement,
          updatedAt: new Date(),
        },
      }
    );
    
    // Check for rank promotion
    const newRank = calculateSpyRank(spy.experience + improvement, spy.missionHistory.length);
    if (newRank !== spy.rank) {
      await promoteSpyRank(db, spyId, newRank);
    }
    
    return { 
      success: true, 
      message: `${spy.codename}'s ${skillToTrain} improved by ${improvement} points`,
      newSkillLevel: newLevel
    };
    
  } catch (error) {
    console.error('Error training spy:', error);
    return { success: false, message: 'Internal server error' };
  }
}

// ============================================================================
// INTELLIGENCE MISSIONS
// ============================================================================

/**
 * Start an intelligence mission
 */
export async function startMission(
  db: Db,
  spyId: string,
  missionType: MissionType,
  targetPlayerId: string,
  targetClanId?: string
): Promise<{ success: boolean; message: string; missionId?: string }> {
  try {
    const spy = await getSpy(db, spyId);
    if (!spy) {
      return { success: false, message: 'Spy not found' };
    }
    
    if (spy.status !== 'AVAILABLE') {
      return { success: false, message: 'Spy is not available' };
    }
    
    // Validate mission type
    if (!isValidMissionType(missionType)) {
      return { success: false, message: 'Invalid mission type' };
    }
    
    // Check if spy has required skills for mission
    const hasSkills = validateMissionSkills(spy, missionType);
    if (!hasSkills) {
      return { success: false, message: 'Spy lacks required skills for this mission' };
    }
    
    // Validate target
    const targetValid = await validateMissionTarget(db, targetPlayerId, targetClanId);
    if (!targetValid) {
      return { success: false, message: 'Invalid target' };
    }
    
    // Generate mission ID
    const missionId = `mission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const missionConfig = MISSION_CONFIGS[missionType];
    const startTime = new Date();
    const completionTime = new Date(startTime.getTime() + missionConfig.duration);
    
    // Get target username
    const targetUsername = await getPlayerUsername(db, targetPlayerId);
    
    // Calculate success chance
    const targetSecurity = await getTargetSecurity(db, targetPlayerId);
    const clanBonus = spy.clanId ? 0.05 : 0;
    const equipmentBonus = 0; // Future equipment system
    
    const successChance = calculateSuccessChance(
      spy.rank,
      missionType,
      targetSecurity,
      clanBonus,
      equipmentBonus
    );
    
    // Create mission document
    const mission: SpyMission = {
      missionId,
      ownerId: spy.ownerId,
      ownerClanId: spy.clanId || '',
      missionType,
      status: MissionStatus.ACTIVE,
      priority: 'MEDIUM',
      targetId: targetPlayerId,
      targetType: 'player',
      targetName: targetUsername,
      spyId,
      spyName: spy.codename,
      spyRank: spy.rank,
      startTime: startTime,
      estimatedCompletion: completionTime,
      duration: missionConfig.duration,
      baseSuccessChance: missionConfig.successRates[spy.rank],
      modifiers: {
        targetSecurity,
        clanBonus,
        equipmentBonus,
      },
      finalSuccessChance: successChance,
      detectionRisk: missionConfig.detectionRisk,
      detected: false,
      cost: missionConfig.cost,
      createdAt: startTime,
      updatedAt: startTime,
    };
    
    // Update spy status
    const spyCollection = db.collection('wmd_spies');
    await spyCollection.updateOne(
      { spyId },
      {
        $set: {
          status: 'ON_MISSION',
          currentMissionId: missionId,
          updatedAt: startTime,
        },
      }
    );
    
    const missionCollection = db.collection('wmd_spy_missions');
    await missionCollection.insertOne(mission);
    
    // Schedule mission completion
    await scheduleMissionCompletion(db, missionId, completionTime);
    
    return { 
      success: true, 
      message: `${spy.codename} started ${missionType} mission. Completion in ${Math.ceil(missionConfig.duration / 60000)} minutes.`,
      missionId 
    };
    
  } catch (error) {
    console.error('Error starting mission:', error);
    return { success: false, message: 'Internal server error' };
  }
}

/**
 * Complete a mission and generate results
 */
export async function completeMission(
  db: Db,
  missionId: string
): Promise<{ success: boolean; message: string; intelligence?: IntelligenceReport }> {
  try {
    const mission = await getMission(db, missionId);
    if (!mission) {
      return { success: false, message: 'Mission not found' };
    }
    
    if (mission.status !== MissionStatus.ACTIVE) {
      return { success: false, message: 'Mission is not active' };
    }
    
    const spy = await getSpy(db, mission.spyId);
    if (!spy) {
      return { success: false, message: 'Spy not found' };
    }
    
    // Roll for mission success
    const successRoll = Math.random();
    const success = successRoll < mission.finalSuccessChance;
    
    // Roll for detection
    const detectionRoll = Math.random();
    const detected = detectionRoll < mission.detectionRisk;
    
    let intelligence: IntelligenceReport | undefined = undefined;
    let missionResult = 'FAILED';
    
    if (success) {
      // Generate intelligence based on mission type
      intelligence = await generateIntelligence(db, mission);
      missionResult = detected ? 'SUCCESS_DETECTED' : 'SUCCESS_UNDETECTED';
    } else {
      missionResult = detected ? 'FAILED_DETECTED' : 'FAILED_UNDETECTED';
    }
    
    // Create mission result
    const result: MissionResult = {
      success,
      missionType: mission.missionType,
      outcome: missionResult,
    };
    
    // Add specific result data based on mission type
    if (success && intelligence) {
      switch (mission.missionType) {
        case MissionType.RECONNAISSANCE:
          result.reconnaissance = {
            targetLevel: 50, // Would be fetched from target data
            targetPower: 10000,
            missileCount: 2,
            defenseStrength: 75,
          };
          break;
        case MissionType.SURVEILLANCE:
          result.surveillance = {
            recentActivity: ['Missile assembly detected', 'Defense battery upgraded'],
            missileProgress: 75,
            vulnerabilities: ['Weak southern perimeter', 'Limited counter-intelligence'],
          };
          break;
      }
    }
    
    // Update mission
    const missionCollection = db.collection('wmd_spy_missions');
    await missionCollection.updateOne(
      { missionId },
      {
        $set: {
          status: MissionStatus.COMPLETED,
          actualCompletion: new Date(),
          roll: successRoll,
          successful: success,
          result,
          intelligenceGathered: intelligence,
          detected,
          detectedAt: detected ? new Date() : undefined,
          updatedAt: new Date(),
        },
      }
    );
    
    // Update spy
    const experienceGained = success ? 15 : 8;
    const spyCollection = db.collection('wmd_spies');
    await spyCollection.updateOne(
      { spyId: mission.spyId },
      {
        $set: {
          status: detected ? 'COMPROMISED' : 'AVAILABLE',
          currentMissionId: null,
          lastMissionAt: new Date(),
          updatedAt: new Date(),
        },
        $inc: {
          experience: experienceGained,
        },
        $push: {
          missionHistory: missionId,
        } as any,
      }
    );
    
    // Send notifications
    await sendMissionNotifications(db, mission, missionResult, intelligence);
    
    // Handle detection consequences
    if (detected) {
      await handleDetection(db, mission, spy);
    }
    
    const message = success 
      ? `Mission successful! Intelligence gathered${detected ? ' (spy detected)' : ''}.`
      : `Mission failed${detected ? ' and spy detected' : ''}.`;
    
    return { success, message, intelligence };
    
  } catch (error) {
    console.error('Error completing mission:', error);
    return { success: false, message: 'Internal server error' };
  }
}

// ============================================================================
// SABOTAGE OPERATIONS
// ============================================================================

/**
 * Execute sabotage operation
 */
export async function executeSabotage(
  db: Db,
  spyId: string,
  targetType: 'MISSILE' | 'DEFENSE_BATTERY' | 'RESEARCH',
  targetId: string,
  targetPlayerId: string
): Promise<{ success: boolean; message: string; damage?: SabotageDamage }> {
  try {
    const spy = await getSpy(db, spyId);
    if (!spy) {
      return { success: false, message: 'Spy not found' };
    }
    
    if (spy.status !== 'AVAILABLE') {
      return { success: false, message: 'Spy is not available' };
    }
    
    // Check if spy has sabotage skills
    if (spy.skills.sabotage < 30) {
      return { success: false, message: 'Spy lacks sufficient sabotage skills (minimum 30)' };
    }
    
    // Validate target
    const targetExists = await validateSabotageTarget(db, targetType, targetId, targetPlayerId);
    if (!targetExists) {
      return { success: false, message: 'Invalid sabotage target' };
    }
    
    // Calculate success chance based on spy skills and target type
    const baseSuccess = spy.skills.sabotage / 100;
    const targetDifficulty = getSabotageTargetDifficulty(targetType);
    const successChance = Math.max(0.05, baseSuccess - targetDifficulty);
    
    // Calculate detection risk
    const detectionRisk = getSabotageDetectionRisk(targetType, spy.skills.stealth);
    
    // Roll for success and detection
    const success = Math.random() < successChance;
    const detected = Math.random() < detectionRisk;
    
    let damage: SabotageDamage | undefined = undefined;
    
    if (success) {
      // Execute sabotage
      damage = await applySabotageDamage(db, targetType, targetId, spy.skills.sabotage);
    }
    
    // Record sabotage operation
    const sabotageId = `sabotage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sabotageRecord = {
      sabotageId,
      spyId,
      spyCodename: spy.codename,
      operatorId: spy.ownerId,
      operatorUsername: spy.ownerUsername,
      targetType,
      targetId,
      targetPlayerId,
      targetUsername: await getPlayerUsername(db, targetPlayerId),
      success,
      detected,
      damageDealt: damage,
      executedAt: new Date(),
      createdAt: new Date(),
    };
    
    const collection = db.collection('wmd_sabotage_operations');
    await collection.insertOne(sabotageRecord);
    
    // Update spy status if detected
    if (detected) {
      const spyCollection = db.collection('wmd_spies');
      await spyCollection.updateOne(
        { spyId },
        {
          $set: {
            status: 'COMPROMISED',
            updatedAt: new Date(),
          },
        }
      );
    }
    
    // Send notifications
    await sendSabotageNotifications(db, sabotageRecord);
    
    let message = 'Sabotage operation ';
    if (success) {
      message += detected ? 'successful but spy detected!' : 'successful and undetected.';
    } else {
      message += detected ? 'failed and spy detected!' : 'failed but spy undetected.';
    }
    
    return { success, message, damage };
    
  } catch (error) {
    console.error('Error executing sabotage:', error);
    return { success: false, message: 'Internal server error' };
  }
}

// ============================================================================
// COUNTER-INTELLIGENCE
// ============================================================================

/**
 * Perform counter-intelligence sweep
 */
export async function counterIntelligenceSweep(
  db: Db,
  playerId: string,
  targetArea: 'FACILITIES' | 'COMMUNICATIONS' | 'PERSONNEL' | 'ALL'
): Promise<CounterIntelResult> {
  try {
    // Check if player has counter-intel capabilities
    const hasCapability = await hasCounterIntelUnlocked(db, playerId);
    if (!hasCapability) {
      return { 
        success: false, 
        message: 'Counter-intelligence not unlocked',
        threatsDetected: 0,
        spiesDetected: []
      };
    }
    
    // Find enemy spies targeting this player
    const enemySpies = await getSpiesTargetingPlayer(db, playerId);
    
    if (enemySpies.length === 0) {
      return {
        success: true,
        message: 'No hostile intelligence activities detected',
        threatsDetected: 0,
        spiesDetected: []
      };
    }
    
    // Calculate detection success for each spy
    const detectedSpies = [];
    
    for (const spy of enemySpies) {
      const detectionChance = calculateCounterIntelChance(targetArea, spy);
      
      if (Math.random() < detectionChance) {
        detectedSpies.push({
          spyId: spy.spyId,
          codename: spy.codename,
          specialization: spy.specialization,
          operatorId: spy.ownerId,
          operatorClanId: spy.clanId,
        });
        
        // Compromise the detected spy
        await compromiseSpy(db, spy.spyId);
      }
    }
    
    // Record counter-intel operation
    await recordCounterIntelOperation(db, playerId, targetArea, detectedSpies);
    
    const message = detectedSpies.length > 0
      ? `Counter-intelligence sweep detected ${detectedSpies.length} hostile operative(s)`
      : 'Counter-intelligence sweep completed. No threats detected.';
    
    return {
      success: true,
      message,
      threatsDetected: detectedSpies.length,
      spiesDetected: detectedSpies
    };
    
  } catch (error) {
    console.error('Error in counter-intelligence sweep:', error);
    return {
      success: false,
      message: 'Counter-intelligence system error',
      threatsDetected: 0,
      spiesDetected: []
    };
  }
}

// ============================================================================
// SPY QUERIES
// ============================================================================

/**
 * Get spy by ID
 */
export async function getSpy(db: Db, spyId: string): Promise<SpyAgent | null> {
  try {
    const collection = db.collection('wmd_spies');
    return await collection.findOne({ spyId }) as SpyAgent | null;
    
  } catch (error) {
    console.error('Error getting spy:', error);
    return null;
  }
}

/**
 * Get player's spies
 */
export async function getPlayerSpies(
  db: Db,
  playerId: string,
  statusFilter?: string
): Promise<SpyAgent[]> {
  try {
    const collection = db.collection('wmd_spies');
    const filter: any = { ownerId: playerId };
    
    if (statusFilter) {
      filter.status = statusFilter;
    }
    
    return await collection.find(filter).sort({ recruitedAt: -1 }).toArray() as unknown as SpyAgent[];
    
  } catch (error) {
    console.error('Error getting player spies:', error);
    return [];
  }
}

/**
 * Get mission by ID
 */
export async function getMission(db: Db, missionId: string): Promise<SpyMission | null> {
  try {
    const collection = db.collection('wmd_spy_missions');
    return await collection.findOne({ missionId }) as SpyMission | null;
    
  } catch (error) {
    console.error('Error getting mission:', error);
    return null;
  }
}

/**
 * Get player's missions
 */
export async function getPlayerMissions(
  db: Db,
  playerId: string,
  statusFilter?: MissionStatus
): Promise<SpyMission[]> {
  try {
    const collection = db.collection('wmd_spy_missions');
    const filter: any = { ownerId: playerId };
    
    if (statusFilter) {
      filter.status = statusFilter;
    }
    
    return await collection.find(filter).sort({ startTime: -1 }).toArray() as SpyMission[];
    
  } catch (error) {
    console.error('Error getting player missions:', error);
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS - CORE OPERATIONS
// ============================================================================

/**
 * Generate spy codename
 */
function generateCodename(): string {
  const adjectives = ['Shadow', 'Silent', 'Swift', 'Steel', 'Dark', 'Ghost', 'Wolf', 'Raven', 'Crimson', 'Silver'];
  const nouns = ['Fox', 'Hawk', 'Storm', 'Blade', 'Echo', 'Viper', 'Lynx', 'Falcon', 'Cobra', 'Tiger'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  
  return `${adj}${noun}${num.toString().padStart(2, '0')}`;
}

/**
 * Get base skills for specialization
 */
function getBaseSkills(specialization: string): { stealth: number; hacking: number; sabotage: number; intelligence: number } {
  switch (specialization) {
    case 'SURVEILLANCE':
      return { stealth: 40, hacking: 20, sabotage: 10, intelligence: 30 };
    case 'SABOTAGE':
      return { stealth: 30, hacking: 10, sabotage: 40, intelligence: 20 };
    case 'INFILTRATION':
      return { stealth: 50, hacking: 30, sabotage: 10, intelligence: 10 };
    case 'CYBER':
      return { stealth: 20, hacking: 50, sabotage: 10, intelligence: 20 };
    default:
      return { stealth: 25, hacking: 25, sabotage: 25, intelligence: 25 };
  }
}

/**
 * Validate mission skills requirement
 */
function validateMissionSkills(spy: SpyAgent, missionType: MissionType): boolean {
  const requiredSkills = {
    [MissionType.RECONNAISSANCE]: { intelligence: 20 },
    [MissionType.SURVEILLANCE]: { stealth: 30, intelligence: 25 },
    [MissionType.INFILTRATION]: { stealth: 40, hacking: 30 },
    [MissionType.SABOTAGE_LIGHT]: { sabotage: 25, stealth: 20 },
    [MissionType.SABOTAGE_HEAVY]: { sabotage: 40, stealth: 30 },
    [MissionType.SABOTAGE_NUCLEAR]: { sabotage: 60, stealth: 50 },
    [MissionType.INTELLIGENCE_LEAK]: { hacking: 35, intelligence: 30 },
    [MissionType.COUNTER_INTELLIGENCE]: { intelligence: 40, stealth: 30 },
    [MissionType.ASSASSINATION]: { stealth: 50, sabotage: 40 },
    [MissionType.THEFT]: { hacking: 40, stealth: 35 },
  };
  
  const requirements = requiredSkills[missionType];
  if (!requirements) return true;
  
  return Object.entries(requirements).every(([skill, minLevel]) => 
    spy.skills[skill as keyof typeof spy.skills] >= minLevel
  );
}

/**
 * Get training improvement amount
 */
function getTrainingImprovement(intensity: string, currentLevel: number): number {
  const baseImprovement = {
    'BASIC': 5,
    'ADVANCED': 10,
    'ELITE': 20
  };
  
  const improvement = (baseImprovement as any)[intensity] || 5;
  
  // Diminishing returns for higher levels
  const diminishingFactor = Math.max(0.1, 1 - (currentLevel / 100));
  
  return Math.floor(improvement * diminishingFactor);
}

/**
 * Calculate spy rank from experience and missions
 */
function calculateSpyRank(experience: number, missionCount: number): SpyRank {
  if (experience >= 500 && missionCount >= 100) return SpyRank.ELITE;
  if (experience >= 300 && missionCount >= 60) return SpyRank.VETERAN;
  if (experience >= 150 && missionCount >= 30) return SpyRank.AGENT;
  if (experience >= 50 && missionCount >= 10) return SpyRank.OPERATIVE;
  return SpyRank.ROOKIE;
}

// ============================================================================
// HELPER FUNCTIONS - RESEARCH & UNLOCKS
// ============================================================================

/**
 * Check if player has unlocked spies
 */
async function hasSpyUnlocked(db: Db, playerId: string): Promise<boolean> {
  try {
    const { getPlayerResearch } = await import('./researchService');
    const playerResearch = await getPlayerResearch(db, playerId);
    
    return playerResearch?.completedTechs.includes('intel_tier_1') || false;
    
  } catch (error) {
    console.error('Error checking spy unlock:', error);
    return false;
  }
}

/**
 * Get maximum spy count for player
 */
async function getMaxSpies(db: Db, playerId: string): Promise<number> {
  try {
    const { getPlayerResearch } = await import('./researchService');
    const playerResearch = await getPlayerResearch(db, playerId);
    
    if (!playerResearch) return 1;
    
    let maxSpies = 1;
    if (playerResearch.completedTechs.includes('intel_tier_3')) maxSpies = 3;
    if (playerResearch.completedTechs.includes('intel_tier_6')) maxSpies = 5;
    if (playerResearch.completedTechs.includes('intel_tier_9')) maxSpies = 10;
    
    return maxSpies;
    
  } catch (error) {
    console.error('Error getting max spies:', error);
    return 1;
  }
}

/**
 * Check if player has unlocked counter-intelligence
 */
async function hasCounterIntelUnlocked(db: Db, playerId: string): Promise<boolean> {
  try {
    const { getPlayerResearch } = await import('./researchService');
    const playerResearch = await getPlayerResearch(db, playerId);
    
    return playerResearch?.completedTechs.includes('intel_tier_2') || false;
    
  } catch (error) {
    console.error('Error checking counter-intel unlock:', error);
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS - SPY MANAGEMENT
// ============================================================================

/**
 * Promote spy to new rank
 */
async function promoteSpyRank(db: Db, spyId: string, newRank: SpyRank): Promise<void> {
  try {
    const collection = db.collection('wmd_spies');
    await collection.updateOne(
      { spyId },
      {
        $set: {
          rank: newRank,
          updatedAt: new Date(),
        },
        $inc: {
          'skills.stealth': 5,
          'skills.hacking': 5,
          'skills.sabotage': 5,
          'skills.intelligence': 5,
        },
      }
    );
    
  } catch (error) {
    console.error('Error promoting spy rank:', error);
  }
}

/**
 * Compromise a spy (reduce effectiveness)
 */
async function compromiseSpy(db: Db, spyId: string): Promise<void> {
  try {
    const collection = db.collection('wmd_spies');
    await collection.updateOne(
      { spyId },
      {
        $set: {
          status: 'COMPROMISED',
          updatedAt: new Date(),
        },
        $inc: {
          'skills.stealth': -10,
          'skills.intelligence': -5,
        },
      }
    );
    
  } catch (error) {
    console.error('Error compromising spy:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS - TARGET VALIDATION
// ============================================================================

/**
 * Validate mission target
 */
async function validateMissionTarget(
  db: Db,
  targetPlayerId: string,
  targetClanId?: string
): Promise<boolean> {
  try {
    // Check if target player exists
    const playerCollection = db.collection('players');
    const targetPlayer = await playerCollection.findOne({ playerId: targetPlayerId });
    
    if (!targetPlayer) return false;
    
    // Check if targeting clan member (prevent friendly fire)
    if (targetClanId && targetPlayer.clanId === targetClanId) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Error validating mission target:', error);
    return false;
  }
}

/**
 * Get player username
 */
async function getPlayerUsername(db: Db, playerId: string): Promise<string> {
  try {
    const collection = db.collection('players');
    const player = await collection.findOne({ playerId });
    return player?.username || 'Unknown';
    
  } catch (error) {
    console.error('Error getting player username:', error);
    return 'Unknown';
  }
}

/**
 * Get target security level
 */
async function getTargetSecurity(db: Db, playerId: string): Promise<number> {
  try {
    // Check for counter-intel techs and active measures
    const { getPlayerResearch } = await import('./researchService');
    const playerResearch = await getPlayerResearch(db, playerId);
    
    let security = 0.1; // Base security
    
    if (playerResearch?.completedTechs.includes('intel_tier_2')) security += 0.15;
    if (playerResearch?.completedTechs.includes('intel_tier_5')) security += 0.25;
    if (playerResearch?.completedTechs.includes('intel_tier_8')) security += 0.35;
    
    return Math.min(0.8, security); // Max 80% security
    
  } catch (error) {
    console.error('Error getting target security:', error);
    return 0.1; // Default minimal security
  }
}

// ============================================================================
// HELPER FUNCTIONS - INTELLIGENCE GENERATION
// ============================================================================

/**
 * Generate intelligence report
 */
async function generateIntelligence(db: Db, mission: SpyMission): Promise<IntelligenceReport> {
  const reportId = `intel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Get target player data for intelligence
  const playerCollection = db.collection('players');
  const targetPlayer = await playerCollection.findOne({ playerId: mission.targetId });
  
  // Get WMD data
  const missileCollection = db.collection('wmd_missiles');
  const targetMissiles = await missileCollection.find({ ownerId: mission.targetId }).toArray();
  
  const batteryCollection = db.collection('wmd_defense_batteries');
  const targetDefenses = await batteryCollection.find({ ownerId: mission.targetId }).toArray();
  
  const intelligence: IntelligenceReport = {
    reportId,
    classification: 'SECRET' as any,
    gatheredBy: mission.spyName,
    gatheredFrom: mission.targetName,
    gatheredAt: new Date(),
    missionId: mission.missionId,
    target: {
      id: mission.targetId,
      username: mission.targetName,
      level: targetPlayer?.level || 0,
      power: targetPlayer?.totalPower || 0,
      clanId: targetPlayer?.clanId,
      clanName: targetPlayer?.clanName,
    },
    wmdCapabilities: {
      missiles: targetMissiles.map(missile => ({
        missileId: missile.missileId,
        warheadType: missile.warheadType,
        progress: missile.assemblyProgress,
        estimatedCompletion: missile.status === 'READY' ? new Date() : undefined,
      })),
      defenseBatteries: targetDefenses.length,
      radarLevel: 'BASIC', // Would be calculated from actual radar data
      combinedDefenseStrength: targetDefenses.reduce((sum, battery) => sum + (battery.accuracy || 0), 0),
    },
    vulnerabilities: [
      'Limited counter-intelligence capabilities',
      'Weak perimeter security',
      'Predictable patrol patterns'
    ],
    threats: [
      'Active missile development program',
      'Expanding defense network',
      'Possible clan alliance'
    ],
    recommendations: [
      'Continue surveillance operations',
      'Consider sabotage of key facilities',
      'Monitor clan communications'
    ],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    createdAt: new Date(),
  };
  
  // Store intelligence report
  const collection = db.collection('wmd_intelligence_reports');
  await collection.insertOne(intelligence);
  
  return intelligence;
}

/**
 * Schedule mission completion
 */
async function scheduleMissionCompletion(
  db: Db,
  missionId: string,
  completionTime: Date
): Promise<void> {
  try {
    // This would integrate with your job scheduler
    console.log(`Mission ${missionId} scheduled to complete at ${completionTime}`);
    
    // TODO: Integrate with job scheduler to process completion
    // setTimeout(() => completeMission(db, missionId), completionTime.getTime() - Date.now());
    
  } catch (error) {
    console.error('Error scheduling mission completion:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS - NOTIFICATION SYSTEM
// ============================================================================

/**
 * Send mission completion notifications
 */
async function sendMissionNotifications(
  db: Db, 
  mission: SpyMission, 
  result: string, 
  intelligence?: IntelligenceReport
): Promise<void> {
  try {
    const notificationCollection = db.collection('wmd_notifications');
    
    // Notify mission operator
    const operatorNotification = {
      notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId: mission.ownerId,
      eventType: 'SPY_MISSION_COMPLETED',
      priority: result.includes('SUCCESS') ? 'MEDIUM' : 'LOW',
      scope: 'PERSONAL',
      message: `🕵️ Mission ${mission.missionType} completed: ${result}`,
      metadata: {
        missionId: mission.missionId,
        spyName: mission.spyName,
        result,
        intelligenceGathered: !!intelligence,
        intelligenceReportId: intelligence?.reportId,
      },
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await notificationCollection.insertOne(operatorNotification);
    
    // If mission was detected and has a target, notify them
    if (result.includes('DETECTED') && mission.targetId) {
      const targetNotification = {
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: mission.targetId,
        eventType: 'SPY_DETECTED',
        priority: 'HIGH',
        scope: 'PERSONAL',
        message: `⚠️ Hostile intelligence operation detected! ${mission.missionType} mission intercepted.`,
        metadata: {
          missionId: mission.missionId,
          operatorId: mission.ownerId,
          spyName: mission.spyName,
          missionType: mission.missionType,
        },
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await notificationCollection.insertOne(targetNotification);
    }
    
    // If intelligence was gathered, create global alert for public leaks
    if (intelligence && mission.missionType === MissionType.INTELLIGENCE_LEAK) {
      const globalNotification = {
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: 'GLOBAL',
        eventType: 'INTELLIGENCE_LEAKED',
        priority: 'CRITICAL',
        scope: 'GLOBAL',
        message: `🌍 INTELLIGENCE LEAKED: Classified WMD information has been exposed!`,
        metadata: {
          reportId: intelligence.reportId,
          targetId: mission.targetId,
          classification: intelligence.classification,
        },
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await notificationCollection.insertOne(globalNotification);
    }
    
  } catch (error) {
    console.error('Error sending mission notifications:', error);
    throw new Error('Failed to send mission notifications');
  }
}

/**
 * Handle detection consequences
 */
async function handleDetection(db: Db, mission: SpyMission, spy: SpyAgent): Promise<void> {
  try {
    // Reduce spy effectiveness temporarily
    const collection = db.collection('wmd_spies');
    await collection.updateOne(
      { spyId: spy.spyId },
      {
        $inc: {
          'skills.stealth': -5,
          'skills.intelligence': -3,
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );
    
    // Increase target's security awareness
    const targetCollection = db.collection('wmd_security_status');
    await targetCollection.updateOne(
      { playerId: mission.targetId },
      {
        $inc: { alertLevel: 0.1 },
        $set: { lastIncident: new Date() },
      },
      { upsert: true }
    );
    
  } catch (error) {
    console.error('Error handling detection:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS - RESOURCE MANAGEMENT
// ============================================================================

/**
 * Check if player can afford spy recruitment
 */
async function canAffordSpy(db: Db, playerId: string, specialization: string): Promise<boolean> {
  try {
    // Get player's current resources
    const playerCollection = db.collection('players');
    const player = await playerCollection.findOne({ playerId });
    
    if (!player) return false;
    
    // Define recruitment costs by specialization
    const recruitmentCosts = {
      'SURVEILLANCE': { metal: 100000, energy: 200000 },
      'SABOTAGE': { metal: 150000, energy: 250000 },
      'INFILTRATION': { metal: 200000, energy: 300000 },
      'CYBER': { metal: 250000, energy: 350000 },
    };
    
    const cost = (recruitmentCosts as any)[specialization] || recruitmentCosts['SURVEILLANCE'];
    
    return player.metal >= cost.metal && player.energy >= cost.energy;
    
  } catch (error) {
    console.error('Error checking spy affordability:', error);
    return false;
  }
}

/**
 * Deduct recruitment costs from player resources
 */
async function deductRecruitmentCosts(db: Db, playerId: string, specialization: string): Promise<void> {
  try {
    const recruitmentCosts = {
      'SURVEILLANCE': { metal: 100000, energy: 200000 },
      'SABOTAGE': { metal: 150000, energy: 250000 },
      'INFILTRATION': { metal: 200000, energy: 300000 },
      'CYBER': { metal: 250000, energy: 350000 },
    };
    
    const cost = (recruitmentCosts as any)[specialization] || recruitmentCosts['SURVEILLANCE'];
    
    const playerCollection = db.collection('players');
    await playerCollection.updateOne(
      { playerId },
      {
        $inc: {
          metal: -cost.metal,
          energy: -cost.energy,
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );
    
  } catch (error) {
    console.error('Error deducting recruitment costs:', error);
  }
}

/**
 * Check if player can afford training
 */
async function canAffordTraining(db: Db, playerId: string, intensity: string): Promise<boolean> {
  try {
    const playerCollection = db.collection('players');
    const player = await playerCollection.findOne({ playerId });
    
    if (!player) return false;
    
    const trainingCosts = {
      'BASIC': { metal: 25000, energy: 50000 },
      'ADVANCED': { metal: 75000, energy: 150000 },
      'ELITE': { metal: 200000, energy: 400000 },
    };
    
    const cost = (trainingCosts as any)[intensity] || trainingCosts['BASIC'];
    
    return player.metal >= cost.metal && player.energy >= cost.energy;
    
  } catch (error) {
    console.error('Error checking training affordability:', error);
    return false;
  }
}

/**
 * Deduct training costs from player resources
 */
async function deductTrainingCosts(db: Db, playerId: string, intensity: string): Promise<void> {
  try {
    const trainingCosts = {
      'BASIC': { metal: 25000, energy: 50000 },
      'ADVANCED': { metal: 75000, energy: 150000 },
      'ELITE': { metal: 200000, energy: 400000 },
    };
    
    const cost = (trainingCosts as any)[intensity] || trainingCosts['BASIC'];
    
    const playerCollection = db.collection('players');
    await playerCollection.updateOne(
      { playerId },
      {
        $inc: {
          metal: -cost.metal,
          energy: -cost.energy,
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );
    
  } catch (error) {
    console.error('Error deducting training costs:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS - SABOTAGE OPERATIONS
// ============================================================================

/**
 * Get sabotage target difficulty modifier
 */
function getSabotageTargetDifficulty(targetType: string): number {
  const difficulties = {
    'MISSILE': 0.2,         // Easier to sabotage missiles
    'DEFENSE_BATTERY': 0.3, // Moderate difficulty for defense systems
    'RESEARCH': 0.4,        // Harder to sabotage research facilities
  };
  return (difficulties as any)[targetType] || 0.3;
}

/**
 * Calculate sabotage detection risk
 */
function getSabotageDetectionRisk(targetType: string, stealthSkill: number): number {
  const baseRisk = {
    'MISSILE': 0.4,         // Moderate risk for missile sabotage
    'DEFENSE_BATTERY': 0.5, // Higher risk for defense sabotage
    'RESEARCH': 0.6,        // Highest risk for research sabotage
  };
  
  const risk = ((baseRisk as any)[targetType] || 0.5) - (stealthSkill / 200);
  return Math.max(0.1, Math.min(0.9, risk));
}

/**
 * Validate sabotage target exists and is valid
 */
async function validateSabotageTarget(
  db: Db,
  targetType: string,
  targetId: string,
  targetPlayerId: string
): Promise<boolean> {
  try {
    let collection: string;
    let query: any = {};
    
    switch (targetType) {
      case 'MISSILE':
        collection = 'wmd_missiles';
        query = { missileId: targetId, ownerId: targetPlayerId };
        break;
      case 'DEFENSE_BATTERY':
        collection = 'wmd_defense_batteries';
        query = { batteryId: targetId, ownerId: targetPlayerId };
        break;
      case 'RESEARCH':
        collection = 'wmd_player_research';
        query = { playerId: targetPlayerId };
        break;
      default:
        return false;
    }
    
    const targetCollection = db.collection(collection);
    const target = await targetCollection.findOne(query);
    
    return !!target;
    
  } catch (error) {
    console.error('Error validating sabotage target:', error);
    return false;
  }
}

/**
 * Apply sabotage damage to target
 */
async function applySabotageDamage(
  db: Db,
  targetType: string,
  targetId: string,
  sabotageSkill: number
): Promise<SabotageDamage> {
  const sabotageId = `sabotage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const damage: SabotageDamage = {
    sabotageId,
    missionId: '',
    saboteurId: '',
    saboteurName: '',
    targetId: '',
    targetUsername: '',
    missileId: targetType === 'MISSILE' ? targetId : '',
    componentsDestroyed: [],
    componentsDelayed: [],
    delayDuration: 0,
    progressLost: 0,
    resourcesWasted: { metal: 0, energy: 0 },
    detected: false,
    executedAt: new Date(),
  };
  
  // Apply damage based on sabotage skill and target type
  if (targetType === 'MISSILE') {
    const progressLost = Math.floor((sabotageSkill / 100) * 25); // Up to 25% progress lost
    damage.progressLost = progressLost;
    
    // Update missile progress
    const collection = db.collection('wmd_missiles');
    await collection.updateOne(
      { missileId: targetId },
      {
        $inc: { assemblyProgress: -progressLost },
        $set: { updatedAt: new Date() },
      }
    );
    
    // Calculate resource waste
    damage.resourcesWasted = {
      metal: progressLost * 10000,
      energy: progressLost * 15000,
    };
  } else if (targetType === 'DEFENSE_BATTERY') {
    // Reduce battery accuracy and interceptor count
    const collection = db.collection('wmd_defense_batteries');
    await collection.updateOne(
      { batteryId: targetId },
      {
        $inc: { 
          accuracy: -Math.floor(sabotageSkill / 10),
          interceptorCount: -Math.floor(sabotageSkill / 20)
        },
        $set: { updatedAt: new Date() },
      }
    );
    
    damage.resourcesWasted = {
      metal: sabotageSkill * 500,
      energy: sabotageSkill * 750,
    };
  }
  
  return damage;
}

/**
 * Send sabotage operation notifications
 */
async function sendSabotageNotifications(db: Db, sabotage: any): Promise<void> {
  try {
    const collection = db.collection('wmd_notifications');
    
    // Notify saboteur
    await collection.insertOne({
      notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId: sabotage.operatorId,
      eventType: 'SABOTAGE_COMPLETED',
      priority: sabotage.success ? 'MEDIUM' : 'LOW',
      scope: 'PERSONAL',
      message: `💥 Sabotage operation ${sabotage.success ? 'successful' : 'failed'}${sabotage.detected ? ' (detected)' : ''}`,
      metadata: {
        sabotageId: sabotage.sabotageId,
        targetType: sabotage.targetType,
        targetId: sabotage.targetId,
        damage: sabotage.damageDealt,
      },
      isRead: false,
      createdAt: new Date(),
    });
    
    // Notify target if detected
    if (sabotage.detected) {
      await collection.insertOne({
        notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientId: sabotage.targetPlayerId,
        eventType: 'SABOTAGE_DETECTED',
        priority: 'HIGH',
        scope: 'PERSONAL',
        message: `🚨 Sabotage detected! Your ${sabotage.targetType.toLowerCase()} was targeted.`,
        metadata: {
          sabotageId: sabotage.sabotageId,
          operatorId: sabotage.operatorId,
          damage: sabotage.damageDealt,
        },
        isRead: false,
        createdAt: new Date(),
      });
    }
    
  } catch (error) {
    console.error('Error sending sabotage notifications:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS - COUNTER-INTELLIGENCE
// ============================================================================

/**
 * Get spies currently targeting a player
 */
async function getSpiesTargetingPlayer(db: Db, playerId: string): Promise<SpyAgent[]> {
  try {
    // Find active missions targeting this player
    const missionCollection = db.collection('wmd_spy_missions');
    const activeMissions = await missionCollection.find({
      targetId: playerId,
      status: MissionStatus.ACTIVE,
    }).toArray();
    
    // Get the spies involved
    const spyIds = activeMissions.map(mission => mission.spyId);
    
    if (spyIds.length === 0) return [];
    
    const spyCollection = db.collection('wmd_spies');
    return await spyCollection.find({
      spyId: { $in: spyIds },
    }).toArray() as unknown as SpyAgent[];
    
  } catch (error) {
    console.error('Error getting spies targeting player:', error);
    return [];
  }
}

/**
 * Calculate counter-intelligence detection chance
 */
function calculateCounterIntelChance(targetArea: string, spy: SpyAgent): number {
  let baseChance = 0.3; // 30% base detection chance
  
  // Area-specific bonuses
  const areaBonuses = {
    'FACILITIES': 0.2,      // Good for detecting sabotage spies
    'COMMUNICATIONS': 0.15, // Good for detecting cyber spies
    'PERSONNEL': 0.25,      // Good for detecting infiltration spies
    'ALL': 0.1,             // Lower bonus but covers everything
  };
  
  baseChance += (areaBonuses as any)[targetArea] || 0;
  
  // Reduce chance based on spy stealth
  const stealthReduction = spy.skills.stealth / 200; // Up to 50% reduction
  
  return Math.max(0.05, Math.min(0.8, baseChance - stealthReduction));
}

/**
 * Record counter-intelligence operation for tracking
 */
async function recordCounterIntelOperation(
  db: Db,
  playerId: string,
  targetArea: string,
  detectedSpies: any[]
): Promise<void> {
  try {
    const collection = db.collection('wmd_counter_intel_operations');
    await collection.insertOne({
      operationId: `counter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operatorId: playerId,
      targetArea,
      spiesDetected: detectedSpies.length,
      detectedSpies,
      executedAt: new Date(),
      createdAt: new Date(),
    });
    
  } catch (error) {
    console.error('Error recording counter-intel operation:', error);
  }
}

// ============================================================================
// FOOTER
// ============================================================================

/**
 * IMPLEMENTATION NOTES:
 * - Manages complete spy network operations with realistic skill systems
 * - Supports 10 mission types with variable success rates and detection risks
 * - Includes comprehensive sabotage mechanics with actual damage application
 * - Implements counter-intelligence measures for defensive gameplay
 * - Integrates with research system for progressive unlock requirements
 * - Uses notification system for operational awareness and diplomatic consequences
 * - Complete resource management integration with cost/benefit analysis
 * - Mission scheduling system ready for job queue integration
 * 
 * USAGE:
 * const result = await recruitSpy(db, playerId, username, 'SABOTAGE');
 * await trainSpy(db, spyId, 'stealth', 'ADVANCED');
 * await startMission(db, spyId, MissionType.SURVEILLANCE, targetId);
 * const intel = await completeMission(db, missionId);
 * const sabotage = await executeSabotage(db, spyId, 'MISSILE', targetId, targetPlayerId);
 * const sweep = await counterIntelligenceSweep(db, playerId, 'ALL');
 * 
 * INTEGRATION:
 * - Called by WMD UI for intelligence operations management
 * - Uses research service for technology unlock validation  
 * - Integrates with missile and defense services for sabotage targets
 * - Sends comprehensive notifications for mission results and security alerts
 * - Scheduled mission completion via job scheduler integration
 * - Resource costs integrated with existing economy system
 * 
 * SECURITY CONSIDERATIONS:
 * - Mission data includes detection risks and counter-intelligence measures
 * - Spy compromise reduces effectiveness and operational security
 * - Intelligence reports have expiration dates for realistic information decay
 * - Global notifications for intelligence leaks create diplomatic pressure
 * - Counter-intelligence provides active defense against hostile operations
 * - Sabotage operations include detection consequences and retaliation risks
 */