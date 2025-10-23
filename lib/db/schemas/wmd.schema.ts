/**
 * @file lib/db/schemas/wmd.schema.ts
 * @created 2025-10-22
 * @overview MongoDB Collection Schemas for WMD System
 * 
 * OVERVIEW:
 * Defines all MongoDB collection schemas, indexes, and validation rules
 * for the Weapons of Mass Destruction system. Includes 12 collections
 * covering missiles, defense, intelligence, research, and notifications.
 * 
 * Collections:
 * - wmd_player_research: Player research progress tracking
 * - wmd_missiles: Missile inventory and assembly
 * - wmd_missile_components: Component inventory tracking
 * - wmd_defense_batteries: Defense battery installations
 * - wmd_clan_defense_grid: Clan defense pooling
 * - wmd_spies: Spy agent roster
 * - wmd_spy_missions: Active and completed missions
 * - wmd_launch_history: Missile launch records
 * - wmd_interception_attempts: Defense interception logs
 * - wmd_sabotage_events: Sabotage operation records
 * - wmd_notifications: System notifications and alerts
 * - wmd_clan_votes: Authorization voting records
 * 
 * Dependencies:
 * - mongodb for database access
 * - /types/wmd for type definitions
 */

import { Db, Collection, CreateIndexesOptions } from 'mongodb';

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Initialize all WMD collections with proper schemas and indexes
 */
export async function initializeWMDCollections(db: Db): Promise<void> {
  // Collection 1: Player Research Progress
  await createPlayerResearchCollection(db);
  
  // Collection 2: Missiles
  await createMissilesCollection(db);
  
  // Collection 3: Missile Components
  await createMissileComponentsCollection(db);
  
  // Collection 4: Defense Batteries
  await createDefenseBatteriesCollection(db);
  
  // Collection 5: Clan Defense Grid
  await createClanDefenseGridCollection(db);
  
  // Collection 6: Spies
  await createSpiesCollection(db);
  
  // Collection 7: Spy Missions
  await createSpyMissionsCollection(db);
  
  // Collection 8: Launch History
  await createLaunchHistoryCollection(db);
  
  // Collection 9: Interception Attempts
  await createInterceptionAttemptsCollection(db);
  
  // Collection 10: Sabotage Events
  await createSabotageEventsCollection(db);
  
  // Collection 11: Notifications
  await createNotificationsCollection(db);
  
  // Collection 12: Clan Votes
  await createClanVotesCollection(db);
  
  console.log('✅ All WMD collections initialized successfully');
}

// ============================================================================
// COLLECTION 1: PLAYER RESEARCH
// ============================================================================

async function createPlayerResearchCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_player_research';
  
  // Create collection if it doesn't exist
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['playerId', 'playerUsername', 'completedTechs', 'availableTechs', 'lockedTechs', 'totalRPSpent', 'updatedAt'],
          properties: {
            playerId: { bsonType: 'string', description: 'Player ID (required)' },
            playerUsername: { bsonType: 'string', description: 'Player username for display' },
            clanId: { bsonType: ['string', 'null'], description: 'Clan ID if player is in clan' },
            completedTechs: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Array of completed tech IDs' },
            availableTechs: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Techs that can be researched now' },
            lockedTechs: { bsonType: 'array', items: { bsonType: 'string' }, description: 'Techs with unmet prerequisites' },
            currentResearch: {
              bsonType: ['object', 'null'],
              properties: {
                techId: { bsonType: 'string' },
                startedAt: { bsonType: 'date' },
                rpSpent: { bsonType: 'number' },
                rpRequired: { bsonType: 'number' },
              },
            },
            totalRPSpent: { bsonType: 'number', minimum: 0, description: 'Total RP spent across all techs' },
            clanBonusActive: { bsonType: 'bool', description: 'Whether clan research bonus applies' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  // Create indexes
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { playerId: 1 }, unique: true, name: 'playerId_unique' },
    { key: { clanId: 1 }, name: 'clanId_lookup' },
    { key: { 'currentResearch.techId': 1 }, name: 'current_research_lookup', sparse: true },
    { key: { updatedAt: -1 }, name: 'updated_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 2: MISSILES
// ============================================================================

async function createMissilesCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_missiles';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['missileId', 'ownerId', 'ownerUsername', 'warheadType', 'components', 'assemblyProgress', 'status', 'createdAt', 'updatedAt'],
          properties: {
            missileId: { bsonType: 'string', description: 'Unique missile identifier' },
            ownerId: { bsonType: 'string', description: 'Player ID of owner' },
            ownerUsername: { bsonType: 'string', description: 'Owner username for display' },
            clanId: { bsonType: ['string', 'null'], description: 'Clan ID if clan-owned' },
            warheadType: { enum: ['TACTICAL', 'STRATEGIC', 'NEUTRON', 'CLUSTER', 'CLAN_BUSTER'], description: 'Warhead type' },
            components: {
              bsonType: 'object',
              required: ['WARHEAD', 'GUIDANCE', 'PROPULSION', 'FUEL', 'CHASSIS'],
              properties: {
                WARHEAD: { bsonType: 'number', minimum: 0, maximum: 100 },
                GUIDANCE: { bsonType: 'number', minimum: 0, maximum: 100 },
                PROPULSION: { bsonType: 'number', minimum: 0, maximum: 100 },
                FUEL: { bsonType: 'number', minimum: 0, maximum: 100 },
                CHASSIS: { bsonType: 'number', minimum: 0, maximum: 100 },
              },
            },
            assemblyProgress: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Assembly completion %' },
            status: { enum: ['ASSEMBLING', 'READY', 'LAUNCHED', 'DESTROYED'], description: 'Missile status' },
            launchedAt: { bsonType: ['date', 'null'], description: 'Launch timestamp if launched' },
            targetPlayerId: { bsonType: ['string', 'null'], description: 'Target player ID if launched' },
            targetClanId: { bsonType: ['string', 'null'], description: 'Target clan ID if clan buster' },
            createdAt: { bsonType: 'date', description: 'Creation timestamp' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { missileId: 1 }, unique: true, name: 'missileId_unique' },
    { key: { ownerId: 1, status: 1 }, name: 'owner_status_lookup' },
    { key: { clanId: 1, status: 1 }, name: 'clan_status_lookup', sparse: true },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { launchedAt: -1 }, name: 'launched_at_desc', sparse: true },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 3: MISSILE COMPONENTS
// ============================================================================

async function createMissileComponentsCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_missile_components';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['playerId', 'playerUsername', 'componentCounts', 'updatedAt'],
          properties: {
            playerId: { bsonType: 'string', description: 'Player ID' },
            playerUsername: { bsonType: 'string', description: 'Player username for display' },
            componentCounts: {
              bsonType: 'object',
              required: ['WARHEAD', 'GUIDANCE', 'PROPULSION', 'FUEL', 'CHASSIS'],
              properties: {
                WARHEAD: { bsonType: 'number', minimum: 0 },
                GUIDANCE: { bsonType: 'number', minimum: 0 },
                PROPULSION: { bsonType: 'number', minimum: 0 },
                FUEL: { bsonType: 'number', minimum: 0 },
                CHASSIS: { bsonType: 'number', minimum: 0 },
              },
            },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { playerId: 1 }, unique: true, name: 'playerId_unique' },
    { key: { updatedAt: -1 }, name: 'updated_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 4: DEFENSE BATTERIES
// ============================================================================

async function createDefenseBatteriesCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_defense_batteries';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['batteryId', 'ownerId', 'ownerUsername', 'batteryType', 'status', 'condition', 'createdAt', 'updatedAt'],
          properties: {
            batteryId: { bsonType: 'string', description: 'Unique battery identifier' },
            ownerId: { bsonType: 'string', description: 'Player ID of owner' },
            ownerUsername: { bsonType: 'string', description: 'Owner username for display' },
            clanId: { bsonType: ['string', 'null'], description: 'Clan ID if pooled' },
            batteryType: { enum: ['BASIC', 'ADVANCED', 'ELITE', 'FORTRESS', 'AEGIS'], description: 'Battery tier' },
            status: { enum: ['ACTIVE', 'COOLDOWN', 'DESTROYED'], description: 'Battery status' },
            condition: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Battery health %' },
            lastFiredAt: { bsonType: ['date', 'null'], description: 'Last interception attempt timestamp' },
            cooldownUntil: { bsonType: ['date', 'null'], description: 'Cooldown expiry timestamp' },
            sabotageResistance: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Sabotage damage reduction %' },
            pooledWithClan: { bsonType: 'bool', description: 'Whether battery is in clan defense pool' },
            createdAt: { bsonType: 'date', description: 'Creation timestamp' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { batteryId: 1 }, unique: true, name: 'batteryId_unique' },
    { key: { ownerId: 1, status: 1 }, name: 'owner_status_lookup' },
    { key: { clanId: 1, pooledWithClan: 1 }, name: 'clan_pooled_lookup', sparse: true },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { cooldownUntil: 1 }, name: 'cooldown_expiry', sparse: true },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 5: CLAN DEFENSE GRID
// ============================================================================

async function createClanDefenseGridCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_clan_defense_grid';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['clanId', 'clanName', 'pooledBatteries', 'totalInterceptChance', 'radarLevel', 'updatedAt'],
          properties: {
            clanId: { bsonType: 'string', description: 'Clan ID' },
            clanName: { bsonType: 'string', description: 'Clan name for display' },
            pooledBatteries: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['batteryId', 'batteryType', 'ownerId', 'status'],
                properties: {
                  batteryId: { bsonType: 'string' },
                  batteryType: { enum: ['BASIC', 'ADVANCED', 'ELITE', 'FORTRESS', 'AEGIS'] },
                  ownerId: { bsonType: 'string' },
                  status: { enum: ['ACTIVE', 'COOLDOWN', 'DESTROYED'] },
                },
              },
            },
            totalInterceptChance: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Combined intercept %' },
            radarLevel: { enum: ['NONE', 'LOCAL', 'REGIONAL', 'GLOBAL'], description: 'Best radar in clan' },
            radarWarningTime: { bsonType: 'number', minimum: 0, description: 'Warning time in seconds' },
            radarRange: { bsonType: 'number', minimum: 0, description: 'Radar detection range in tiles' },
            canDetectStealth: { bsonType: 'bool', description: 'Whether clan can detect stealth missiles' },
            memberCount: { bsonType: 'number', minimum: 0, description: 'Number of clan members' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { clanId: 1 }, unique: true, name: 'clanId_unique' },
    { key: { totalInterceptChance: -1 }, name: 'intercept_chance_desc' },
    { key: { radarLevel: 1 }, name: 'radar_level_lookup' },
    { key: { updatedAt: -1 }, name: 'updated_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 6: SPIES
// ============================================================================

async function createSpiesCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_spies';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['spyId', 'ownerId', 'ownerUsername', 'spyName', 'rank', 'status', 'experience', 'successfulMissions', 'createdAt', 'updatedAt'],
          properties: {
            spyId: { bsonType: 'string', description: 'Unique spy identifier' },
            ownerId: { bsonType: 'string', description: 'Player ID of owner' },
            ownerUsername: { bsonType: 'string', description: 'Owner username for display' },
            spyName: { bsonType: 'string', description: 'Spy agent name' },
            rank: { enum: ['RECRUIT', 'OPERATIVE', 'AGENT', 'VETERAN', 'ELITE'], description: 'Spy rank' },
            status: { enum: ['AVAILABLE', 'ON_MISSION', 'CAPTURED', 'KILLED'], description: 'Spy status' },
            experience: { bsonType: 'number', minimum: 0, description: 'Total XP earned' },
            successfulMissions: { bsonType: 'number', minimum: 0, description: 'Successful mission count' },
            failedMissions: { bsonType: 'number', minimum: 0, description: 'Failed mission count' },
            currentMissionId: { bsonType: ['string', 'null'], description: 'Active mission ID if on mission' },
            specialty: { enum: ['RECONNAISSANCE', 'SABOTAGE', 'COUNTER_INTELLIGENCE', 'THEFT', 'ASSASSINATION', 'NONE'], description: 'Spy specialty' },
            createdAt: { bsonType: 'date', description: 'Recruitment timestamp' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { spyId: 1 }, unique: true, name: 'spyId_unique' },
    { key: { ownerId: 1, status: 1 }, name: 'owner_status_lookup' },
    { key: { rank: 1 }, name: 'rank_lookup' },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { currentMissionId: 1 }, name: 'mission_lookup', sparse: true },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 7: SPY MISSIONS
// ============================================================================

async function createSpyMissionsCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_spy_missions';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['missionId', 'spyId', 'operatorId', 'operatorUsername', 'missionType', 'targetPlayerId', 'targetUsername', 'status', 'createdAt', 'updatedAt'],
          properties: {
            missionId: { bsonType: 'string', description: 'Unique mission identifier' },
            spyId: { bsonType: 'string', description: 'Assigned spy ID' },
            operatorId: { bsonType: 'string', description: 'Player ID who ordered mission' },
            operatorUsername: { bsonType: 'string', description: 'Operator username' },
            missionType: { 
              enum: ['RECONNAISSANCE', 'SURVEILLANCE', 'COUNTER_INTELLIGENCE', 'INFILTRATION', 
                     'SABOTAGE_LIGHT', 'SABOTAGE_HEAVY', 'SABOTAGE_NUCLEAR', 'INTELLIGENCE_LEAK', 
                     'THEFT', 'ASSASSINATION'],
              description: 'Mission type' 
            },
            targetPlayerId: { bsonType: 'string', description: 'Target player ID' },
            targetUsername: { bsonType: 'string', description: 'Target username' },
            targetClanId: { bsonType: ['string', 'null'], description: 'Target clan ID if applicable' },
            status: { enum: ['PREPARING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED'], description: 'Mission status' },
            startedAt: { bsonType: ['date', 'null'], description: 'Mission start timestamp' },
            completedAt: { bsonType: ['date', 'null'], description: 'Mission completion timestamp' },
            duration: { bsonType: ['number', 'null'], minimum: 0, description: 'Mission duration in seconds' },
            successChance: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Calculated success probability' },
            detectionChance: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Calculated detection probability' },
            result: {
              bsonType: ['object', 'null'],
              properties: {
                success: { bsonType: 'bool' },
                detected: { bsonType: 'bool' },
                spyCaptured: { bsonType: 'bool' },
                spyKilled: { bsonType: 'bool' },
                intelGained: { bsonType: ['object', 'null'] },
                damageDealt: { bsonType: ['object', 'null'] },
                resourcesStolen: { bsonType: ['object', 'null'] },
              },
            },
            createdAt: { bsonType: 'date', description: 'Mission creation timestamp' },
            updatedAt: { bsonType: 'date', description: 'Last update timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { missionId: 1 }, unique: true, name: 'missionId_unique' },
    { key: { spyId: 1, status: 1 }, name: 'spy_status_lookup' },
    { key: { operatorId: 1, status: 1 }, name: 'operator_status_lookup' },
    { key: { targetPlayerId: 1, status: 1 }, name: 'target_status_lookup' },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { completedAt: -1 }, name: 'completed_at_desc', sparse: true },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 8: LAUNCH HISTORY
// ============================================================================

async function createLaunchHistoryCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_launch_history';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['launchId', 'missileId', 'attackerId', 'attackerUsername', 'targetPlayerId', 'targetUsername', 'warheadType', 'launchedAt', 'impactAt', 'status'],
          properties: {
            launchId: { bsonType: 'string', description: 'Unique launch identifier' },
            missileId: { bsonType: 'string', description: 'Missile ID that was launched' },
            attackerId: { bsonType: 'string', description: 'Player ID of attacker' },
            attackerUsername: { bsonType: 'string', description: 'Attacker username' },
            attackerClanId: { bsonType: ['string', 'null'], description: 'Attacker clan ID if applicable' },
            targetPlayerId: { bsonType: 'string', description: 'Target player ID' },
            targetUsername: { bsonType: 'string', description: 'Target username' },
            targetClanId: { bsonType: ['string', 'null'], description: 'Target clan ID if clan buster' },
            targetLocation: {
              bsonType: 'object',
              required: ['x', 'y'],
              properties: {
                x: { bsonType: 'number' },
                y: { bsonType: 'number' },
              },
            },
            warheadType: { enum: ['TACTICAL', 'STRATEGIC', 'NEUTRON', 'CLUSTER', 'CLAN_BUSTER'], description: 'Warhead type' },
            flightTime: { bsonType: 'number', minimum: 0, description: 'Flight duration in seconds' },
            launchedAt: { bsonType: 'date', description: 'Launch timestamp' },
            impactAt: { bsonType: 'date', description: 'Expected impact timestamp' },
            status: { enum: ['IN_FLIGHT', 'INTERCEPTED', 'HIT', 'MISSED'], description: 'Launch status' },
            interceptedBy: {
              bsonType: ['array', 'null'],
              items: {
                bsonType: 'object',
                properties: {
                  batteryId: { bsonType: 'string' },
                  ownerId: { bsonType: 'string' },
                  timestamp: { bsonType: 'date' },
                },
              },
            },
            damageDealt: {
              bsonType: ['object', 'null'],
              properties: {
                primaryTarget: { bsonType: 'number' },
                secondaryTargets: { bsonType: ['array', 'null'] },
                totalDamage: { bsonType: 'number' },
              },
            },
            clanVoteId: { bsonType: ['string', 'null'], description: 'Clan vote ID if clan authorized' },
            createdAt: { bsonType: 'date', description: 'Record creation timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { launchId: 1 }, unique: true, name: 'launchId_unique' },
    { key: { missileId: 1 }, name: 'missileId_lookup' },
    { key: { attackerId: 1, launchedAt: -1 }, name: 'attacker_chronological' },
    { key: { targetPlayerId: 1, launchedAt: -1 }, name: 'target_chronological' },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { impactAt: 1 }, name: 'impact_at_asc' },
    { key: { launchedAt: -1 }, name: 'launched_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 9: INTERCEPTION ATTEMPTS
// ============================================================================

async function createInterceptionAttemptsCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_interception_attempts';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['attemptId', 'launchId', 'batteryId', 'defenderId', 'defenderUsername', 'targetedMissile', 'success', 'attemptedAt'],
          properties: {
            attemptId: { bsonType: 'string', description: 'Unique attempt identifier' },
            launchId: { bsonType: 'string', description: 'Launch ID being intercepted' },
            batteryId: { bsonType: 'string', description: 'Battery ID that attempted interception' },
            defenderId: { bsonType: 'string', description: 'Player ID of defender' },
            defenderUsername: { bsonType: 'string', description: 'Defender username' },
            defenderClanId: { bsonType: ['string', 'null'], description: 'Defender clan ID if pooled' },
            targetedMissile: {
              bsonType: 'object',
              required: ['missileId', 'warheadType', 'attackerId'],
              properties: {
                missileId: { bsonType: 'string' },
                warheadType: { enum: ['TACTICAL', 'STRATEGIC', 'NEUTRON', 'CLUSTER', 'CLAN_BUSTER'] },
                attackerId: { bsonType: 'string' },
              },
            },
            interceptChance: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Calculated intercept probability' },
            roll: { bsonType: 'number', minimum: 0, maximum: 100, description: 'Random roll result' },
            success: { bsonType: 'bool', description: 'Whether interception succeeded' },
            damageReduced: { bsonType: ['number', 'null'], minimum: 0, description: 'Damage reduced if partial intercept' },
            attemptedAt: { bsonType: 'date', description: 'Attempt timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { attemptId: 1 }, unique: true, name: 'attemptId_unique' },
    { key: { launchId: 1 }, name: 'launchId_lookup' },
    { key: { batteryId: 1 }, name: 'batteryId_lookup' },
    { key: { defenderId: 1, attemptedAt: -1 }, name: 'defender_chronological' },
    { key: { success: 1 }, name: 'success_lookup' },
    { key: { attemptedAt: -1 }, name: 'attempted_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 10: SABOTAGE EVENTS
// ============================================================================

async function createSabotageEventsCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_sabotage_events';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['sabotageId', 'missionId', 'attackerId', 'attackerUsername', 'targetPlayerId', 'targetUsername', 'sabotageType', 'success', 'occurredAt'],
          properties: {
            sabotageId: { bsonType: 'string', description: 'Unique sabotage identifier' },
            missionId: { bsonType: 'string', description: 'Parent mission ID' },
            attackerId: { bsonType: 'string', description: 'Player ID of attacker' },
            attackerUsername: { bsonType: 'string', description: 'Attacker username' },
            targetPlayerId: { bsonType: 'string', description: 'Target player ID' },
            targetUsername: { bsonType: 'string', description: 'Target username' },
            sabotageType: { enum: ['LIGHT', 'HEAVY', 'NUCLEAR'], description: 'Sabotage severity' },
            targetType: { enum: ['MISSILE', 'BATTERY', 'COMPONENTS', 'RESEARCH'], description: 'What was sabotaged' },
            success: { bsonType: 'bool', description: 'Whether sabotage succeeded' },
            damageDealt: {
              bsonType: ['object', 'null'],
              properties: {
                missilesDestroyed: { bsonType: ['number', 'null'] },
                batteriesDamaged: { bsonType: ['number', 'null'] },
                componentsLost: { bsonType: ['object', 'null'] },
                researchDelayed: { bsonType: ['object', 'null'] },
              },
            },
            detected: { bsonType: 'bool', description: 'Whether sabotage was detected' },
            occurredAt: { bsonType: 'date', description: 'Sabotage timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { sabotageId: 1 }, unique: true, name: 'sabotageId_unique' },
    { key: { missionId: 1 }, name: 'missionId_lookup' },
    { key: { attackerId: 1, occurredAt: -1 }, name: 'attacker_chronological' },
    { key: { targetPlayerId: 1, occurredAt: -1 }, name: 'target_chronological' },
    { key: { success: 1 }, name: 'success_lookup' },
    { key: { occurredAt: -1 }, name: 'occurred_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 11: NOTIFICATIONS
// ============================================================================

async function createNotificationsCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_notifications';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['notificationId', 'recipientId', 'eventType', 'priority', 'scope', 'message', 'read', 'createdAt'],
          properties: {
            notificationId: { bsonType: 'string', description: 'Unique notification identifier' },
            recipientId: { bsonType: 'string', description: 'Player ID of recipient' },
            recipientClanId: { bsonType: ['string', 'null'], description: 'Clan ID if clan notification' },
            eventType: {
              enum: ['MISSILE_LAUNCHED', 'MISSILE_INCOMING', 'MISSILE_HIT', 'MISSILE_INTERCEPTED',
                     'RESEARCH_COMPLETED', 'BATTERY_READY', 'BATTERY_COOLDOWN', 'BATTERY_DESTROYED',
                     'SPY_MISSION_SUCCESS', 'SPY_MISSION_FAILED', 'SPY_CAPTURED', 'SPY_KILLED',
                     'SABOTAGE_DETECTED', 'SABOTAGE_SUCCESS', 'INTELLIGENCE_LEAK',
                     'CLAN_VOTE_STARTED', 'CLAN_VOTE_PASSED', 'CLAN_VOTE_FAILED', 'RADAR_WARNING'],
              description: 'Event type'
            },
            priority: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Notification priority' },
            scope: { enum: ['PERSONAL', 'CLAN', 'SYSTEM', 'GLOBAL'], description: 'Notification scope' },
            message: { bsonType: 'string', description: 'Notification message text' },
            icon: { bsonType: ['string', 'null'], description: 'Icon identifier' },
            color: { bsonType: ['string', 'null'], description: 'Color code' },
            actionUrl: { bsonType: ['string', 'null'], description: 'Action link URL' },
            metadata: { bsonType: ['object', 'null'], description: 'Additional event data' },
            read: { bsonType: 'bool', description: 'Whether notification has been read' },
            readAt: { bsonType: ['date', 'null'], description: 'Read timestamp' },
            expiresAt: { bsonType: ['date', 'null'], description: 'Expiration timestamp' },
            createdAt: { bsonType: 'date', description: 'Creation timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { notificationId: 1 }, unique: true, name: 'notificationId_unique' },
    { key: { recipientId: 1, read: 1, createdAt: -1 }, name: 'recipient_unread_chronological' },
    { key: { recipientClanId: 1, createdAt: -1 }, name: 'clan_chronological', sparse: true },
    { key: { eventType: 1 }, name: 'event_type_lookup' },
    { key: { priority: 1 }, name: 'priority_lookup' },
    { key: { expiresAt: 1 }, name: 'expiration_cleanup', sparse: true },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// COLLECTION 12: CLAN VOTES
// ============================================================================

async function createClanVotesCollection(db: Db): Promise<void> {
  const collectionName = 'wmd_clan_votes';
  
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['voteId', 'clanId', 'clanName', 'proposerId', 'proposerUsername', 'voteType', 'status', 'createdAt', 'expiresAt'],
          properties: {
            voteId: { bsonType: 'string', description: 'Unique vote identifier' },
            clanId: { bsonType: 'string', description: 'Clan ID' },
            clanName: { bsonType: 'string', description: 'Clan name for display' },
            proposerId: { bsonType: 'string', description: 'Player ID who proposed vote' },
            proposerUsername: { bsonType: 'string', description: 'Proposer username' },
            voteType: { enum: ['MISSILE_LAUNCH', 'RESEARCH_PRIORITY', 'DEFENSE_UPGRADE', 'SPY_OPERATION'], description: 'Vote type' },
            status: { enum: ['ACTIVE', 'PASSED', 'FAILED', 'CANCELLED'], description: 'Vote status' },
            subject: { bsonType: 'string', description: 'Vote subject/description' },
            requiredVotes: { bsonType: 'number', minimum: 1, description: 'Number of votes needed to pass' },
            yesVotes: { bsonType: 'number', minimum: 0, description: 'Current yes votes' },
            noVotes: { bsonType: 'number', minimum: 0, description: 'Current no votes' },
            abstainVotes: { bsonType: 'number', minimum: 0, description: 'Current abstain votes' },
            voters: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  playerId: { bsonType: 'string' },
                  vote: { enum: ['YES', 'NO', 'ABSTAIN'] },
                  votedAt: { bsonType: 'date' },
                },
              },
            },
            relatedEntityId: { bsonType: ['string', 'null'], description: 'Related missile/mission/etc ID' },
            createdAt: { bsonType: 'date', description: 'Vote creation timestamp' },
            expiresAt: { bsonType: 'date', description: 'Vote expiration timestamp' },
            completedAt: { bsonType: ['date', 'null'], description: 'Vote completion timestamp' },
          },
        },
      },
    });
  }
  
  const collection = db.collection(collectionName);
  await collection.createIndexes([
    { key: { voteId: 1 }, unique: true, name: 'voteId_unique' },
    { key: { clanId: 1, status: 1, createdAt: -1 }, name: 'clan_status_chronological' },
    { key: { proposerId: 1 }, name: 'proposer_lookup' },
    { key: { status: 1 }, name: 'status_lookup' },
    { key: { expiresAt: 1 }, name: 'expiration_cleanup' },
    { key: { createdAt: -1 }, name: 'created_at_desc' },
  ]);
  
  console.log(`✅ Created collection: ${collectionName}`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Drop all WMD collections (use with caution!)
 */
export async function dropWMDCollections(db: Db): Promise<void> {
  const collectionNames = [
    'wmd_player_research',
    'wmd_missiles',
    'wmd_missile_components',
    'wmd_defense_batteries',
    'wmd_clan_defense_grid',
    'wmd_spies',
    'wmd_spy_missions',
    'wmd_launch_history',
    'wmd_interception_attempts',
    'wmd_sabotage_events',
    'wmd_notifications',
    'wmd_clan_votes',
  ];
  
  for (const name of collectionNames) {
    try {
      await db.dropCollection(name);
      console.log(`🗑️  Dropped collection: ${name}`);
    } catch (error) {
      // Collection might not exist, ignore error
    }
  }
  
  console.log('✅ All WMD collections dropped');
}

/**
 * Get collection statistics
 */
export async function getWMDCollectionStats(db: Db): Promise<Record<string, any>> {
  const stats: Record<string, any> = {};
  
  const collectionNames = [
    'wmd_player_research',
    'wmd_missiles',
    'wmd_missile_components',
    'wmd_defense_batteries',
    'wmd_clan_defense_grid',
    'wmd_spies',
    'wmd_spy_missions',
    'wmd_launch_history',
    'wmd_interception_attempts',
    'wmd_sabotage_events',
    'wmd_notifications',
    'wmd_clan_votes',
  ];
  
  for (const name of collectionNames) {
    try {
      const collection = db.collection(name);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();
      stats[name] = { documentCount: count, indexCount: indexes.length };
    } catch (error) {
      stats[name] = { error: 'Collection not found' };
    }
  }
  
  return stats;
}

// ============================================================================
// FOOTER
// ============================================================================

/**
 * IMPLEMENTATION NOTES:
 * - All collections use strict JSON schema validation
 * - Indexes optimized for common query patterns
 * - Compound indexes for frequently combined filters
 * - Sparse indexes for optional fields
 * - TTL indexes for automatic expiration (notifications, votes)
 * 
 * TESTING:
 * - Run initializeWMDCollections() on fresh database
 * - Verify schema validation with invalid documents
 * - Test index performance with sample queries
 * - Confirm referential integrity patterns
 * 
 * MAINTENANCE:
 * - Monitor index usage with explain() plans
 * - Add indexes for new query patterns as needed
 * - Regular defragmentation for large collections
 * - Archive old data (launch_history, notifications)
 */
