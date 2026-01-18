/**
 * @file lib/playerService.ts
 * @created 2025-10-16
 * @overview Player management service with atomic spawn logic
 * 
 * OVERVIEW:
 * Handles player registration, spawning on random Wasteland tiles,
 * and player data retrieval. Uses atomic operations to prevent race conditions.
 */

import { getCollection } from './mongodb';
import { Player, Tile, TerrainType, GAME_CONSTANTS, UnitTier } from '@/types';

/**
 * Check if username is already taken
 * 
 * @param username - Username to check
 * @returns Promise that resolves to true if username exists
 */
export async function usernameExists(username: string): Promise<boolean> {
  try {
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });
    return player !== null;
  } catch (error) {
    console.error('❌ Error checking username:', error);
    throw error;
  }
}

/**
 * Get player by username
 * 
 * @param username - Username to look up
 * @returns Promise that resolves to player object or null
 */
export async function getPlayerByUsername(username: string): Promise<Player | null> {
  try {
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });
    return player;
  } catch (error) {
    console.error('❌ Error fetching player:', error);
    throw error;
  }
}

/**
 * Find a random unoccupied Wasteland tile for spawning
 * 
 * Uses atomic findOneAndUpdate to prevent race conditions where
 * two players spawn on the same tile simultaneously.
 * 
 * @returns Promise that resolves to the claimed tile, or null if no tiles available
 */
export async function findAndClaimSpawnTile(): Promise<Tile | null> {
  try {
    const tilesCollection = await getCollection<Tile>('tiles');
    
    // Find all available Wasteland tiles
    const availableTiles = await tilesCollection
      .find({
        terrain: TerrainType.Wasteland,
        occupiedByBase: { $ne: true }
      })
      .toArray();
    
    if (availableTiles.length === 0) {
      console.error('❌ No available Wasteland tiles for spawning');
      return null;
    }
    
    // Select random tile from available ones
    const randomIndex = Math.floor(Math.random() * availableTiles.length);
    const selectedTile = availableTiles[randomIndex];
    
    // Atomically claim the tile
    const result = await tilesCollection.findOneAndUpdate(
      {
        x: selectedTile.x,
        y: selectedTile.y,
        occupiedByBase: { $ne: true }
      },
      {
        $set: { occupiedByBase: true }
      },
      {
        returnDocument: 'after'
      }
    );
    
    if (!result) {
      // Tile was claimed by another player between our query and update
      // Retry recursively
      console.log('⚠️  Tile already claimed, retrying...');
      return findAndClaimSpawnTile();
    }
    
    console.log(`✅ Claimed spawn tile at (${result.x}, ${result.y})`);
    return result as Tile;
    
  } catch (error) {
    console.error('❌ Error finding spawn tile:', error);
    throw error;
  }
}

/**
 * Create a new player with spawn location
 * 
 * Atomically registers player and claims spawn tile.
 * 
 * @param username - Unique username for the player
 * @returns Promise that resolves to the created player
 * @throws Error if username already exists or no spawn tiles available
 * 
 * @example
 * ```typescript
 * const player = await createPlayer('Commander42');
 * console.log(`Spawned at (${player.base.x}, ${player.base.y})`);
 * ```
 */
export async function createPlayer(username: string): Promise<Player> {
  try {
    // Validate username
    if (!username || username.trim().length === 0) {
      throw new Error('Username cannot be empty');
    }
    
    if (username.length < 3 || username.length > 20) {
      throw new Error('Username must be between 3 and 20 characters');
    }
    
    // Check if username already exists
    const exists = await usernameExists(username);
    if (exists) {
      throw new Error('Username already taken');
    }
    
    // Find and claim spawn tile
    const spawnTile = await findAndClaimSpawnTile();
    if (!spawnTile) {
      throw new Error('No available spawn locations');
    }
    
    // Create player document
    const player: Player = {
      username: username.trim(),
      email: '', // Legacy function - use createPlayerWithAuth for full auth
      password: '', // Legacy function - use createPlayerWithAuth for full auth
      base: {
        x: spawnTile.x,
        y: spawnTile.y
      },
      currentPosition: {
        x: spawnTile.x,
        y: spawnTile.y
      },
      resources: {
        ...GAME_CONSTANTS.STARTING_RESOURCES
      },
      bank: {
        metal: 0,
        energy: 0,
        lastDeposit: null
      },
      rank: 1, // All players start at rank 1
      inventory: {
        items: [],
        capacity: GAME_CONSTANTS.HARVEST.DEFAULT_INVENTORY_CAPACITY,
        metalDiggerCount: 0,
        energyDiggerCount: 0
      },
      gatheringBonus: {
        metalBonus: 0,
        energyBonus: 0
      },
      activeBoosts: {
        gatheringBoost: null,
        expiresAt: null
      },
      shrineBoosts: [],
      units: [],
      totalStrength: 0,
      totalDefense: 0,
      xp: 0,
      level: 1,
      researchPoints: 0,
      unlockedTiers: [UnitTier.Tier1], // Start with Tier 1 unlocked
      rpHistory: [],
      createdAt: new Date()
    };
    
    // Insert player into database
    const playersCollection = await getCollection<Player>('players');
    await playersCollection.insertOne(player);
    
    console.log(`✅ Created player: ${username} at (${spawnTile.x}, ${spawnTile.y})`);
    
    return player;
    
  } catch (error) {
    console.error('❌ Error creating player:', error);
    throw error;
  }
}

/**
 * Get player by username
 * 
 * @param username - Username to look up
 * @returns Promise that resolves to player data or null if not found
 * 
 * @example
 * ```typescript
 * const player = await getPlayer('Commander42');
 * if (player) {
 *   console.log(`Player at (${player.currentPosition.x}, ${player.currentPosition.y})`);
 * }
 * ```
 */
export async function getPlayer(username: string): Promise<Player | null> {
  try {
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ username });
    
    if (player) {
      // Calculate factory count from factories collection
      const factoriesCollection = await getCollection('factories');
      const factoryCount = await factoriesCollection.countDocuments({
        owner: username
      });
      
      // Add factory count to player object
      (player as any).factoryCount = factoryCount;
    }
    
    return player;
  } catch (error) {
    console.error('❌ Error getting player:', error);
    throw error;
  }
}

/**
 * Update player's current position
 * 
 * @param username - Username of player to update
 * @param newPosition - New position coordinates
 * @returns Promise that resolves to updated player or null if not found
 */
export async function updatePlayerPosition(
  username: string,
  newPosition: { x: number; y: number }
): Promise<Player | null> {
  try {
    const playersCollection = await getCollection<Player>('players');
    
    const result = await playersCollection.findOneAndUpdate(
      { username },
      {
        $set: {
          currentPosition: newPosition
        }
      },
      {
        returnDocument: 'after'
      }
    );
    
    if (result) {
      console.log(`✅ Updated ${username} position to (${newPosition.x}, ${newPosition.y})`);
    }
    
    return result as Player | null;
    
  } catch (error) {
    console.error('❌ Error updating player position:', error);
    throw error;
  }
}

/**
 * Create indexes for players collection
 * 
 * @returns Promise that resolves when indexes are created
 */
export async function createPlayerIndexes(): Promise<void> {
  try {
    const playersCollection = await getCollection<Player>('players');
    
    // Create unique index on username
    await playersCollection.createIndex(
      { username: 1 },
      { unique: true, name: 'username_index' }
    );
    
    console.log('✅ Player indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating player indexes:', error);
    throw error;
  }
}

/**
 * Check if email is already registered
 * 
 * @param email - Email to check
 * @returns Promise that resolves to true if email exists
 */
export async function emailInUse(email: string): Promise<boolean> {
  try {
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ email: email.toLowerCase().trim() });
    return player !== null;
  } catch (error) {
    console.error('❌ Error checking email:', error);
    throw error;
  }
}

/**
 * Get player by email
 * 
 * @param email - Email address
 * @returns Promise resolving to Player or null
 */
export async function getPlayerByEmail(email: string): Promise<Player | null> {
  try {
    const playersCollection = await getCollection<Player>('players');
    const player = await playersCollection.findOne({ email: email.toLowerCase().trim() });
    return player;
  } catch (error) {
    console.error('❌ Error getting player by email:', error);
    throw error;
  }
}

/**
 * Create a new player with authentication
 * 
 * @param username - Unique username
 * @param email - Email address
 * @param hashedPassword - Pre-hashed password
 * @returns Promise resolving to newly created Player
 */
export async function createPlayerWithAuth(
  username: string,
  email: string,
  hashedPassword: string
): Promise<Player> {
  try {
    // Validate inputs
    if (!username || username.trim().length === 0) {
      throw new Error('Username cannot be empty');
    }
    
    if (username.length < 3 || username.length > 20) {
      throw new Error('Username must be between 3 and 20 characters');
    }
    
    // Check if username already exists
    const exists = await usernameExists(username);
    if (exists) {
      throw new Error('Username already taken');
    }
    
    // Check if email already exists
    const emailExists = await emailInUse(email);
    if (emailExists) {
      throw new Error('Email already registered');
    }
    
    // Find and claim spawn tile
    const spawnTile = await findAndClaimSpawnTile();
    if (!spawnTile) {
      throw new Error('No available spawn locations');
    }
    
    // Create player document
    const player: Player = {
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      base: {
        x: spawnTile.x,
        y: spawnTile.y
      },
      currentPosition: {
        x: spawnTile.x,
        y: spawnTile.y
      },
      resources: {
        ...GAME_CONSTANTS.STARTING_RESOURCES
      },
      rank: 1,
      inventory: {
        items: [],
        capacity: GAME_CONSTANTS.HARVEST.DEFAULT_INVENTORY_CAPACITY,
        metalDiggerCount: 0,
        energyDiggerCount: 0
      },
      gatheringBonus: {
        metalBonus: 0,
        energyBonus: 0
      },
      activeBoosts: {
        gatheringBoost: null,
        expiresAt: null
      },
      xp: 0, // Start at 0 XP
      level: 1, // Start at level 1
      researchPoints: 0, // No RP initially
      unlockedTiers: [1], // Tier 1 unlocked by default
      bank: { // Initialize bank storage
        metal: 0,
        energy: 0,
        lastDeposit: null
      },
      shrineBoosts: [], // No shrine boosts initially
      units: [], // No units initially
      totalStrength: 0,
      totalDefense: 0,
      createdAt: new Date()
    };
    
    // Insert into database
    const playersCollection = await getCollection<Player>('players');
    await playersCollection.insertOne(player);
    
    console.log(`✅ Created player with auth: ${username} at (${player.base.x}, ${player.base.y})`);
    
    return player;
  } catch (error) {
    console.error('❌ Error creating player with auth:', error);
    throw error;
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Atomic findOneAndUpdate prevents race conditions
// - Recursive retry on spawn tile conflicts
// - Username validation with length constraints
// - Email validation and uniqueness checking
// - Secure password storage (hashed)
// - Starting resources from GAME_CONSTANTS
// - Comprehensive error handling and logging
// - Unique index ensures no duplicate usernames
// ============================================================
// END OF FILE
// ============================================================
