/**
 * @file lib/mapGeneration.ts
 * @created 2025-10-16
 * @overview Map generation logic with exact terrain distribution
 * 
 * OVERVIEW:
 * Generates a static 150×150 tile map with precise terrain distribution.
 * Uses Fisher-Yates shuffle to ensure exact counts for each terrain type.
 * Idempotent: safe to run multiple times without duplicating data.
 */

import { getCollection } from './mongodb';
import { Tile, TerrainType, GAME_CONSTANTS } from '@/types';

/**
 * Fisher-Yates shuffle algorithm for array randomization
 * 
 * @param array - Array to shuffle in-place
 * @returns The shuffled array
 * 
 * @example
 * ```typescript
 * const arr = [1, 2, 3, 4, 5];
 * shuffle(arr);
 * // arr is now randomly shuffled
 * ```
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate array of terrain types with exact distribution
 * 
 * Creates exactly 22,500 terrain type values:
 * - Metal: 4,500
 * - Energy: 4,500
 * - Cave: 2,250
 * - Factory: 2,250
 * - Wasteland: 9,000
 * 
 * @returns Array of terrain types in exact quantities
 */
function generateTerrainArray(): TerrainType[] {
  const terrains: TerrainType[] = [];
  
  // Add exact count for each terrain type
  for (const [terrain, count] of Object.entries(GAME_CONSTANTS.TERRAIN_COUNTS)) {
    for (let i = 0; i < count; i++) {
      terrains.push(terrain as TerrainType);
    }
  }
  
  // Verify total count
  if (terrains.length !== GAME_CONSTANTS.TOTAL_TILES) {
    throw new Error(
      `Terrain array length mismatch: expected ${GAME_CONSTANTS.TOTAL_TILES}, got ${terrains.length}`
    );
  }
  
  // Shuffle to randomize positions
  return shuffle(terrains);
}

/**
 * Fixed locations for Phase 3+ special tiles
 */
const FIXED_LOCATIONS = {
  SHRINE: { x: 1, y: 1 },
  BANKS: [
    { x: 25, y: 25, type: 'metal' as const },
    { x: 75, y: 75, type: 'energy' as const },
    { x: 50, y: 50, type: 'exchange' as const },
    { x: 100, y: 100, type: 'exchange' as const }
  ]
};

/**
 * Check if coordinate is a fixed special location
 */
function isFixedLocation(x: number, y: number): { type: 'shrine' | 'bank' | null; bankType?: 'metal' | 'energy' | 'exchange' } {
  // Check shrine
  if (x === FIXED_LOCATIONS.SHRINE.x && y === FIXED_LOCATIONS.SHRINE.y) {
    return { type: 'shrine' };
  }
  
  // Check banks
  const bank = FIXED_LOCATIONS.BANKS.find(b => b.x === x && b.y === y);
  if (bank) {
    return { type: 'bank', bankType: bank.type };
  }
  
  return { type: null };
}

/**
 * Generate all tiles for the 150×150 map
 * 
 * Creates tiles with coordinates (1,1) to (150,150) with randomized terrain distribution
 * Special fixed locations (Phase 3+):
 * - Shrine at (1,1)
 * - Metal Bank at (25,25)
 * - Energy Bank at (75,75)
 * - Exchange Banks at (50,50) and (100,100)
 * 
 * @returns Array of 22,500 tile objects
 */
function generateTiles(): Tile[] {
  const terrains = generateTerrainArray();
  const tiles: Tile[] = [];
  
  let terrainIndex = 0;
  
  // Generate tiles for each coordinate
  for (let y = 1; y <= GAME_CONSTANTS.MAP_HEIGHT; y++) {
    for (let x = 1; x <= GAME_CONSTANTS.MAP_WIDTH; x++) {
      const fixedLoc = isFixedLocation(x, y);
      
      if (fixedLoc.type === 'shrine') {
        // Shrine of Remembrance at (1,1)
        tiles.push({
          x,
          y,
          terrain: TerrainType.Shrine,
          occupiedByBase: false
        });
        terrainIndex++; // Skip one terrain in the random array
      } else if (fixedLoc.type === 'bank') {
        // Bank at fixed location
        tiles.push({
          x,
          y,
          terrain: TerrainType.Bank,
          bankType: fixedLoc.bankType,
          occupiedByBase: false
        });
        terrainIndex++; // Skip one terrain in the random array
      } else {
        // Regular terrain from randomized array
        tiles.push({
          x,
          y,
          terrain: terrains[terrainIndex],
          occupiedByBase: false
        });
        terrainIndex++;
      }
    }
  }
  
  return tiles;
}

/**
 * Check if map already exists in database
 * 
 * @returns Promise that resolves to true if map exists, false otherwise
 */
export async function mapExists(): Promise<boolean> {
  try {
    const tilesCollection = await getCollection<Tile>('tiles');
    const count = await tilesCollection.countDocuments();
    
    console.log(`📊 Current tile count in database: ${count}`);
    
    return count === GAME_CONSTANTS.TOTAL_TILES;
  } catch (error) {
    console.error('❌ Error checking map existence:', error);
    return false;
  }
}

/**
 * Create indexes for tiles collection
 * Ensures efficient queries and prevents duplicate coordinates
 * 
 * @returns Promise that resolves when indexes are created
 */
export async function createTileIndexes(): Promise<void> {
  try {
    const tilesCollection = await getCollection<Tile>('tiles');
    
    // Create unique compound index on (x, y) coordinates
    await tilesCollection.createIndex(
      { x: 1, y: 1 },
      { unique: true, name: 'coordinate_index' }
    );
    
    // Create index on terrain type for efficient filtering
    await tilesCollection.createIndex(
      { terrain: 1 },
      { name: 'terrain_index' }
    );
    
    // Create index on occupiedByBase for spawn queries
    await tilesCollection.createIndex(
      { occupiedByBase: 1, terrain: 1 },
      { name: 'spawn_index' }
    );
    
    console.log('✅ Tile indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating tile indexes:', error);
    throw error;
  }
}

/**
 * Initialize the game map (idempotent)
 * 
 * Generates and stores 22,500 tiles if they don't already exist.
 * Safe to run multiple times - will skip generation if map already exists.
 * 
 * @returns Promise that resolves when initialization is complete
 * 
 * @example
 * ```typescript
 * await initializeMap();
 * console.log('Map ready!');
 * ```
 */
export async function initializeMap(): Promise<void> {
  console.log('🗺️  Initializing map...');
  
  try {
    // Check if map already exists
    const exists = await mapExists();
    
    if (exists) {
      console.log('✅ Map already exists, skipping generation');
      return;
    }
    
    console.log('🔨 Generating new map...');
    
    // Generate all tiles
    const tiles = generateTiles();
    
    console.log(`📦 Generated ${tiles.length} tiles`);
    
    // Insert tiles into database
    const tilesCollection = await getCollection<Tile>('tiles');
    
    // Use ordered: false to continue on duplicate key errors (shouldn't happen, but safety measure)
    await tilesCollection.insertMany(tiles, { ordered: false });
    
    console.log('✅ Tiles inserted successfully');
    
    // Create indexes
    await createTileIndexes();
    
    // Verify final count
    const finalCount = await tilesCollection.countDocuments();
    console.log(`✅ Map initialization complete! Total tiles: ${finalCount}`);
    
    // Verify terrain distribution
    const distribution = await tilesCollection.aggregate([
      {
        $group: {
          _id: '$terrain',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    console.log('📊 Terrain distribution:');
    distribution.forEach(({ _id, count }) => {
      // Bank and Shrine are fixed locations, not in TERRAIN_COUNTS
      if (_id === 'Bank') {
        const match = count === 4 ? '✅' : '❌';
        console.log(`  ${match} ${_id}: ${count} (expected: 4 fixed locations)`);
      } else if (_id === 'Shrine') {
        const match = count === 1 ? '✅' : '❌';
        console.log(`  ${match} ${_id}: ${count} (expected: 1 fixed location)`);
      } else {
        // Type guard for original terrain types
        const terrainType = _id as TerrainType;
        if (terrainType in GAME_CONSTANTS.TERRAIN_COUNTS) {
          const expected = GAME_CONSTANTS.TERRAIN_COUNTS[terrainType as keyof typeof GAME_CONSTANTS.TERRAIN_COUNTS];
          // Wasteland count will be 5 less (replaced by 1 shrine + 4 banks)
          const adjustedExpected = (terrainType === TerrainType.Wasteland) ? expected - 5 : expected;
          const match = count === adjustedExpected ? '✅' : '❌';
          console.log(`  ${match} ${_id}: ${count} (expected: ${adjustedExpected})`);
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error initializing map:', error);
    throw error;
  }
}

/**
 * Get terrain distribution statistics from database
 * 
 * @returns Promise that resolves to terrain count distribution
 */
export async function getTerrainDistribution(): Promise<Record<TerrainType, number>> {
  try {
    const tilesCollection = await getCollection<Tile>('tiles');
    
    const distribution = await tilesCollection.aggregate([
      {
        $group: {
          _id: '$terrain',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    const result: Record<string, number> = {};
    distribution.forEach(({ _id, count }) => {
      result[_id] = count;
    });
    
    return result as Record<TerrainType, number>;
  } catch (error) {
    console.error('❌ Error getting terrain distribution:', error);
    throw error;
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Fisher-Yates shuffle ensures truly random distribution
// - Pre-allocated array guarantees exact terrain counts
// - Idempotent design prevents duplicate data
// - Bulk insert operation for efficiency
// - Compound unique index prevents coordinate conflicts
// - Additional indexes optimize spawn and query operations
// - Comprehensive logging for debugging and verification
// ============================================================
// END OF FILE
// ============================================================
