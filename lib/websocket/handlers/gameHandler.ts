/**
 * Game Event Handler
 * Created: 2025-10-19
 * 
 * OVERVIEW:
 * Handles game-related WebSocket events such as position updates, resource changes,
 * level-ups, and tile ownership changes. Coordinates with database and broadcasts
 * events to relevant users.
 * 
 * Event Categories:
 * - Position Updates: Player movement on the game grid
 * - Resource Changes: Wood, stone, iron, gold, food, energy
 * - Level-ups: Player progression events
 * - Tile Updates: Ownership changes, building construction
 * - Player Presence: Online/offline status
 * 
 * Usage:
 * - Called from Socket.io main event router
 * - Updates database when necessary
 * - Broadcasts to appropriate rooms (location, user, clan)
 */

import type { Server, Socket } from 'socket.io';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedUser } from '../auth';
import {
  broadcastToLocation,
  broadcastToUser,
  broadcastToClan,
  broadcastTileUpdate,
} from '../broadcast';
import {
  joinLocationRoom,
  leaveLocationRoom,
  updateLocationRoom,
} from '../rooms';
import type {
  GamePositionUpdatePayload,
  GameResourceChangePayload,
  GameLevelUpPayload,
  GameTileUpdatePayload,
} from '@/types/websocket';

// ============================================================================
// POSITION UPDATE HANDLER
// ============================================================================

/**
 * Handles player position update
 * Updates database, changes location rooms, broadcasts to new location
 * 
 * @param io - Socket.io server instance
 * @param socket - Socket requesting position update
 * @param data - New position coordinates
 * 
 * @example
 * socket.on('game:update_position', async (data) => {
 *   await handlePositionUpdate(io, socket, data);
 * });
 */
export async function handlePositionUpdate(
  io: Server,
  socket: Socket,
  data: { x: number; y: number }
): Promise<void> {
  const user = socket.data.user as AuthenticatedUser | undefined;
  
  if (!user) {
    console.error('[Game Handler] Position update denied: User not authenticated');
    return;
  }
  
  try {
    const db = await connectToDatabase();
    
    // Fetch current position from database
    const currentUser = await db.collection('users').findOne(
      { _id: new ObjectId(user.userId) },
      { projection: { x: 1, y: 1 } }
    );
    
    if (!currentUser) {
      console.error('[Game Handler] User not found in database');
      return;
    }
    
    const oldX = currentUser.x || 0;
    const oldY = currentUser.y || 0;
    const { x: newX, y: newY } = data;
    
    // Validate coordinates (assuming 150x150 grid)
    if (newX < 0 || newX >= 150 || newY < 0 || newY >= 150) {
      console.error('[Game Handler] Invalid coordinates:', data);
      return;
    }
    
    // Update user position in database
    await db.collection('users').updateOne(
      { _id: new ObjectId(user.userId) },
      { 
        $set: { 
          x: newX, 
          y: newY,
          lastMoved: Date.now()
        } 
      }
    );
    
    // Update location room subscriptions
    await updateLocationRoom(socket, oldX, oldY, newX, newY);
    
    // Broadcast position update to new location
    const payload: GamePositionUpdatePayload = {
      userId: user.userId,
      username: user.username,
      x: newX,
      y: newY,
      timestamp: Date.now(),
    };
    
    await broadcastToLocation(io, newX, newY, 'game:position_update', payload);
    
    console.log(`[Game Handler] ${user.username} moved from (${oldX},${oldY}) to (${newX},${newY})`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle position update:', error);
  }
}

// ============================================================================
// RESOURCE CHANGE HANDLER
// ============================================================================

/**
 * Handles resource change event
 * Validates change, updates database, broadcasts to user
 * 
 * @param io - Socket.io server instance
 * @param user - Authenticated user
 * @param resourceType - Type of resource changed
 * @param change - Amount changed (positive or negative)
 * @param reason - Reason for change
 * 
 * @example
 * await handleResourceChange(io, user, 'wood', 100, 'Harvested from forest');
 */
export async function handleResourceChange(
  io: Server,
  user: AuthenticatedUser,
  resourceType: 'wood' | 'stone' | 'iron' | 'gold' | 'food' | 'energy',
  change: number,
  reason: string
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    // Fetch current resource amount
    const currentUser = await db.collection('users').findOne(
      { _id: new ObjectId(user.userId) },
      { projection: { [resourceType]: 1 } }
    );
    
    if (!currentUser) {
      console.error('[Game Handler] User not found for resource change');
      return;
    }
    
    const previousAmount = currentUser[resourceType] || 0;
    const newAmount = Math.max(0, previousAmount + change); // Prevent negative
    
    // Update resource in database
    await db.collection('users').updateOne(
      { _id: new ObjectId(user.userId) },
      { 
        $set: { [resourceType]: newAmount },
        $push: {
          resourceHistory: {
            type: resourceType,
            change,
            reason,
            timestamp: Date.now(),
          }
        } as any
      }
    );
    
    // Broadcast resource change to user
    const payload: GameResourceChangePayload = {
      userId: user.userId,
      resourceType,
      previousAmount,
      newAmount,
      change,
      reason,
    };
    
    await broadcastToUser(io, user.userId, 'game:resource_change', payload);
    
    console.log(`[Game Handler] ${user.username} ${resourceType}: ${previousAmount} → ${newAmount} (${change >= 0 ? '+' : ''}${change})`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle resource change:', error);
  }
}

// ============================================================================
// LEVEL-UP HANDLER
// ============================================================================

/**
 * Handles level-up event
 * Updates database, unlocks features, broadcasts to user and clan
 * 
 * @param io - Socket.io server instance
 * @param user - Authenticated user
 * @param newLevel - New level achieved
 * @param unlockedFeatures - Features unlocked at this level
 * 
 * @example
 * await handleLevelUp(io, user, 10, ['Advanced Units', 'Territory Control']);
 */
export async function handleLevelUp(
  io: Server,
  user: AuthenticatedUser,
  newLevel: number,
  unlockedFeatures?: string[]
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    const previousLevel = user.level;
    
    // Update level in database
    await db.collection('users').updateOne(
      { _id: new ObjectId(user.userId) },
      { 
        $set: { 
          level: newLevel,
          levelUpTime: Date.now()
        },
        $push: {
          levelHistory: {
            level: newLevel,
            timestamp: Date.now(),
            unlockedFeatures: unlockedFeatures || []
          }
        } as any
      }
    );
    
    // Broadcast level-up to user
    const payload: GameLevelUpPayload = {
      userId: user.userId,
      username: user.username,
      previousLevel,
      newLevel,
      unlockedFeatures,
    };
    
    await broadcastToUser(io, user.userId, 'game:level_up', payload);
    
    // Also broadcast to clan if user is in a clan
    if (user.clanId) {
      await broadcastToClan(io, user.clanId, 'game:level_up', payload);
    }
    
    console.log(`[Game Handler] ${user.username} leveled up: ${previousLevel} → ${newLevel}`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle level-up:', error);
  }
}

// ============================================================================
// TILE UPDATE HANDLER
// ============================================================================

/**
 * Handles tile ownership/type change
 * Updates database, broadcasts to location
 * 
 * @param io - Socket.io server instance
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param tileType - New tile type
 * @param owner - New owner (optional)
 * 
 * @example
 * await handleTileUpdate(io, 50, 75, 'fortress', user);
 */
export async function handleTileUpdate(
  io: Server,
  x: number,
  y: number,
  tileType: string,
  owner?: AuthenticatedUser
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    // Update tile in database
    await db.collection('tiles').updateOne(
      { x, y },
      { 
        $set: { 
          type: tileType,
          ownerId: owner?.userId || null,
          ownerName: owner?.username || null,
          clanId: owner?.clanId || null,
          clanName: owner?.clanName || null,
          lastUpdated: Date.now()
        } 
      },
      { upsert: true }
    );
    
    // Broadcast tile update to location
    const payload: GameTileUpdatePayload = {
      x,
      y,
      tileType,
      ownerId: owner?.userId,
      ownerName: owner?.username,
      clanId: owner?.clanId,
      clanName: owner?.clanName,
    };
    
    await broadcastTileUpdate(io, payload);
    
    console.log(`[Game Handler] Tile (${x},${y}) updated: ${tileType} owned by ${owner?.username || 'none'}`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle tile update:', error);
  }
}

// ============================================================================
// PLAYER PRESENCE HANDLERS
// ============================================================================

/**
 * Handles player coming online
 * Broadcasts to clan and nearby players
 * 
 * @param io - Socket.io server instance
 * @param socket - Newly connected socket
 * @param user - Authenticated user
 * 
 * @example
 * await handlePlayerOnline(io, socket, user);
 */
export async function handlePlayerOnline(
  io: Server,
  socket: Socket,
  user: AuthenticatedUser
): Promise<void> {
  try {
    const db = await connectToDatabase();
    
    // Fetch user's position
    const userData = await db.collection('users').findOne(
      { _id: new ObjectId(user.userId) },
      { projection: { x: 1, y: 1 } }
    );
    
    if (!userData) return;
    
    const x = userData.x || 0;
    const y = userData.y || 0;
    
    // Join location room
    await joinLocationRoom(socket, x, y);
    
    // Broadcast player online to location
    await broadcastToLocation(io, x, y, 'game:player_online', {
      userId: user.userId,
      username: user.username,
      level: user.level,
      x,
      y,
    });
    
    // Broadcast to clan if applicable
    if (user.clanId) {
      await broadcastToClan(io, user.clanId, 'game:player_online', {
        userId: user.userId,
        username: user.username,
        level: user.level,
        x,
        y,
      });
    }
    
    console.log(`[Game Handler] ${user.username} came online at (${x},${y})`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle player online:', error);
  }
}

/**
 * Handles player going offline
 * Broadcasts to clan and nearby players
 * 
 * @param io - Socket.io server instance
 * @param user - Authenticated user
 * 
 * @example
 * await handlePlayerOffline(io, user);
 */
export async function handlePlayerOffline(
  io: Server,
  user: AuthenticatedUser
): Promise<void> {
  try {
    // Broadcast player offline to clan
    if (user.clanId) {
      await broadcastToClan(io, user.clanId, 'game:player_offline', {
        userId: user.userId,
        username: user.username,
      });
    }
    
    console.log(`[Game Handler] ${user.username} went offline`);
    
  } catch (error) {
    console.error('[Game Handler] Failed to handle player offline:', error);
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Database Integration:
 *    - All state changes persisted to MongoDB
 *    - Optimistic updates on client, confirmed via broadcast
 *    - Use projection to minimize data transfer
 * 
 * 2. Validation:
 *    - Coordinate bounds checking (0-149 for 150x150 grid)
 *    - Resource amounts can't go negative
 *    - Authenticated user required for all operations
 * 
 * 3. Broadcasting Strategy:
 *    - Position updates: Broadcast to new location room
 *    - Resource changes: Broadcast to individual user
 *    - Level-ups: Broadcast to user + clan
 *    - Tile updates: Broadcast to location room
 *    - Presence: Broadcast to clan + location
 * 
 * 4. Location Room Management:
 *    - Auto-join location room on position update
 *    - Auto-leave old location room
 *    - Efficient for proximity-based events
 * 
 * 5. Error Handling:
 *    - All errors logged with context
 *    - Failed operations don't crash server
 *    - Database errors handled gracefully
 * 
 * 6. Performance:
 *    - Use targeted room broadcasts
 *    - Minimal database queries
 *    - Async operations don't block
 * 
 * FUTURE ENHANCEMENTS:
 * - Add position validation (can't teleport)
 * - Implement movement cooldowns
 * - Add resource change rate limiting
 * - Track position history for analytics
 * - Implement fog of war (selective broadcasts)
 */
