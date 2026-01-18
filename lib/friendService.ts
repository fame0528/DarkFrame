/**
 * Friend Service Layer
 * Created: 2025-10-26
 * 
 * OVERVIEW:
 * This service layer provides all business logic for the friend system, including
 * friend requests, friend management, blocking, and friend discovery. All functions
 * handle MongoDB operations, input validation, error handling, and return consistent
 * response types for API layer consumption.
 * 
 * KEY RESPONSIBILITIES:
 * - Friend request management (send, accept, decline, cancel)
 * - Friend relationship management (add, remove, list)
 * - User blocking and unblocking
 * - Friend discovery and search
 * - Friend status checking (relationship state)
 * - Input validation and sanitization
 * - Error handling with custom error classes
 * 
 * BUSINESS RULES:
 * 1. Users cannot send friend requests to themselves
 * 2. Users cannot send duplicate friend requests
 * 3. Max friends limit: 100 per user (configurable)
 * 4. Max pending requests: 50 (sent + received combined)
 * 5. Friend request messages limited to 200 characters
 * 6. Blocking removes existing friendship if present
 * 7. Blocked users cannot send friend requests
 * 8. Friend requests expire after 30 days
 * 9. Friendships are bidirectional (single document)
 * 10. Accepting request creates friendship and updates request status
 * 
 * DATABASE COLLECTIONS:
 * - friends: Stores accepted friendships
 * - friendRequests: Stores pending/declined/cancelled requests
 * - players: User data for friend display (username, level, etc.)
 * 
 * INTEGRATION:
 * - Used by API routes in app/api/friends/
 * - Types imported from types/friend.ts
 * - MongoDB connection from lib/mongodb.ts
 * - Authentication validated by API layer before calling service
 * 
 * ERROR HANDLING:
 * - ValidationError: Invalid input data
 * - NotFoundError: Resource doesn't exist
 * - PermissionError: User lacks permission
 * - Standard Error: Unexpected MongoDB or system errors
 */

import { ObjectId } from 'mongodb';
import clientPromise from './mongodb';
import {
  Friend,
  FriendRequest,
  FriendStatus,
  FriendRequestStatus,
  FriendWithPlayer,
  FriendRequestWithPlayer,
  FriendshipStatus,
  PlayerSearchResult,
  FRIEND_CONSTANTS,
} from '@/types/friend';
import { ValidationError, NotFoundError, PermissionError } from '@/lib/common/errors';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Player data interface for lookup maps
 */
interface PlayerData {
  _id: ObjectId;
  username: string;
  level: number;
  vip?: boolean;
  clanTag?: string;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates MongoDB ObjectId format
 * 
 * @param id - ID string to validate
 * @returns True if valid ObjectId format
 * 
 * @example
 * if (!isValidObjectId(userId)) {
 *   throw new ValidationError('Invalid user ID format');
 * }
 */
function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

/**
 * Validates friend request message length
 * 
 * @param message - Message string to validate
 * @returns True if message is valid
 * 
 * @example
 * if (!isValidMessage(message)) {
 *   throw new ValidationError('Message exceeds 200 characters');
 * }
 */
function isValidMessage(message: string | undefined): boolean {
  if (!message) return true; // Optional message
  return (
    typeof message === 'string' &&
    message.trim().length > 0 &&
    message.length <= FRIEND_CONSTANTS.MAX_REQUEST_MESSAGE_LENGTH
  );
}

/**
 * Sanitizes user input strings
 * 
 * @param input - String to sanitize
 * @returns Sanitized string
 * 
 * @example
 * const cleanMessage = sanitizeInput(userMessage);
 */
function sanitizeInput(input: string): string {
  return input.trim().slice(0, FRIEND_CONSTANTS.MAX_REQUEST_MESSAGE_LENGTH);
}

// ============================================================================
// FRIEND REQUEST FUNCTIONS
// ============================================================================

/**
 * Send a friend request to another user
 * 
 * Validates that:
 * - User is not sending request to themselves
 * - Target user exists
 * - No existing friendship or pending request
 * - Sender hasn't exceeded request limit
 * - User is not blocked by target
 * 
 * @param userId - ID of user sending request
 * @param toUserId - ID of user receiving request
 * @param message - Optional intro message (max 200 chars)
 * @returns Created friend request
 * @throws {ValidationError} Invalid input or limits exceeded
 * @throws {PermissionError} Blocked or already friends
 * @throws {NotFoundError} Target user not found
 * 
 * @example
 * const request = await sendFriendRequest(
 *   'player-123',
 *   'player-456',
 *   'Hey! Want to team up?'
 * );
 */
export async function sendFriendRequest(
  userId: string,
  toUserId: string,
  message?: string
): Promise<FriendRequest> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid sender user ID format');
  }
  if (!isValidObjectId(toUserId)) {
    throw new ValidationError('Invalid recipient user ID format');
  }
  if (userId === toUserId) {
    throw new ValidationError('Cannot send friend request to yourself');
  }
  if (message && !isValidMessage(message)) {
    throw new ValidationError(
      `Message must be ${FRIEND_CONSTANTS.MAX_REQUEST_MESSAGE_LENGTH} characters or less`
    );
  }

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'darkframe');

  // Check if target user exists
  const targetUser = await db.collection('players').findOne({
    _id: new ObjectId(toUserId),
  });
  if (!targetUser) {
    throw new NotFoundError('User not found');
  }

  // Check if already friends
  const existingFriendship = await db.collection('friends').findOne({
    $or: [
      { userId, friendId: toUserId },
      { userId: toUserId, friendId: userId },
    ],
    status: FriendStatus.ACCEPTED,
  });
  if (existingFriendship) {
    throw new PermissionError('You are already friends with this user');
  }

  // Check if blocked
  const isBlocked = await db.collection('friends').findOne({
    $or: [
      { userId, friendId: toUserId, status: FriendStatus.BLOCKED },
      { userId: toUserId, friendId: userId, status: FriendStatus.BLOCKED },
    ],
  });
  if (isBlocked) {
    throw new PermissionError('Cannot send friend request to this user');
  }

  // Check for existing pending request (either direction)
  const existingRequest = await db.collection('friendRequests').findOne({
    $or: [
      { from: userId, to: toUserId, status: FriendRequestStatus.PENDING },
      { from: toUserId, to: userId, status: FriendRequestStatus.PENDING },
    ],
  });
  if (existingRequest) {
    throw new PermissionError('A pending friend request already exists');
  }

  // Check sender's pending request count
  const pendingCount = await db.collection('friendRequests').countDocuments({
    $or: [{ from: userId }, { to: userId }],
    status: FriendRequestStatus.PENDING,
  });
  if (pendingCount >= FRIEND_CONSTANTS.MAX_PENDING_REQUESTS) {
    throw new ValidationError(
      `Maximum ${FRIEND_CONSTANTS.MAX_PENDING_REQUESTS} pending friend requests allowed`
    );
  }

  // Create friend request
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + FRIEND_CONSTANTS.REQUEST_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
  );

  const requestDoc = {
    from: userId,
    to: toUserId,
    status: FriendRequestStatus.PENDING,
    message: message ? sanitizeInput(message) : undefined,
    createdAt: now,
    expiresAt,
  };

  const result = await db.collection('friendRequests').insertOne(requestDoc);

  return {
    _id: result.insertedId.toString(),
    ...requestDoc,
  };
}

/**
 * Accept a friend request
 * 
 * Validates that:
 * - Request exists and is pending
 * - User is the recipient of the request
 * - Neither user has reached max friends limit
 * 
 * Creates friendship and updates request status.
 * 
 * @param userId - ID of user accepting request
 * @param requestId - ID of friend request to accept
 * @returns Created friendship
 * @throws {ValidationError} Invalid input
 * @throws {NotFoundError} Request not found
 * @throws {PermissionError} Not recipient or limits exceeded
 * 
 * @example
 * const friendship = await acceptRequest('player-456', 'req-123');
 */
export async function acceptRequest(
  userId: string,
  requestId: string
): Promise<Friend> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(requestId)) {
    throw new ValidationError('Invalid request ID format');
  }

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'darkframe');

  // Find request
  const request = await db.collection('friendRequests').findOne({
    _id: new ObjectId(requestId),
  });

  if (!request) {
    throw new NotFoundError('Friend request not found');
  }

  if (request.status !== FriendRequestStatus.PENDING) {
    throw new PermissionError('Friend request is no longer pending');
  }

  if (request.to !== userId) {
    throw new PermissionError('You can only accept requests sent to you');
  }

  // Check friend limits for both users
  const requesterFriendCount = await db.collection('friends').countDocuments({
    $or: [{ userId: request.from }, { friendId: request.from }],
    status: FriendStatus.ACCEPTED,
  });

  if (requesterFriendCount >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new ValidationError('Requester has reached maximum friends limit');
  }

  const recipientFriendCount = await db.collection('friends').countDocuments({
    $or: [{ userId }, { friendId: userId }],
    status: FriendStatus.ACCEPTED,
  });

  if (recipientFriendCount >= FRIEND_CONSTANTS.MAX_FRIENDS) {
    throw new ValidationError('You have reached maximum friends limit');
  }

  // Create friendship
  const now = new Date();
  const friendshipDoc = {
    userId: request.from,
    friendId: request.to,
    status: FriendStatus.ACCEPTED,
    initiatedBy: request.from,
    createdAt: now,
    updatedAt: now,
  };

  const friendResult = await db.collection('friends').insertOne(friendshipDoc);

  // Update request status
  await db.collection('friendRequests').updateOne(
    { _id: new ObjectId(requestId) },
    {
      $set: {
        status: FriendRequestStatus.ACCEPTED,
        respondedAt: now,
      },
    }
  );

  return {
    _id: friendResult.insertedId.toString(),
    ...friendshipDoc,
  };
}

/**
 * Decline a friend request
 * 
 * Validates that:
 * - Request exists and is pending
 * - User is the recipient of the request
 * 
 * @param userId - ID of user declining request
 * @param requestId - ID of friend request to decline
 * @returns Updated request with declined status
 * @throws {ValidationError} Invalid input
 * @throws {NotFoundError} Request not found
 * @throws {PermissionError} Not recipient
 * 
 * @example
 * await declineRequest('player-456', 'req-123');
 */
export async function declineRequest(
  userId: string,
  requestId: string
): Promise<FriendRequest> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(requestId)) {
    throw new ValidationError('Invalid request ID format');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Find request
  const request = await db.collection('friendRequests').findOne({
    _id: new ObjectId(requestId),
  });

  if (!request) {
    throw new NotFoundError('Friend request not found');
  }

  if (request.status !== FriendRequestStatus.PENDING) {
    throw new PermissionError('Friend request is no longer pending');
  }

  if (request.to !== userId) {
    throw new PermissionError('You can only decline requests sent to you');
  }

  // Update request status
  const now = new Date();
  await db.collection('friendRequests').updateOne(
    { _id: new ObjectId(requestId) },
    {
      $set: {
        status: FriendRequestStatus.DECLINED,
        respondedAt: now,
      },
    }
  );

  return {
    _id: requestId,
    from: request.from,
    to: request.to,
    status: FriendRequestStatus.DECLINED,
    message: request.message,
    createdAt: request.createdAt,
    respondedAt: now,
    expiresAt: request.expiresAt,
  };
}

// ============================================================================
// FRIEND MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Remove a friend
 * 
 * Validates that:
 * - Friendship exists
 * - User is part of the friendship
 * 
 * Deletes the friendship document (soft delete could be implemented).
 * 
 * @param userId - ID of user removing friend
 * @param friendId - ID of friend to remove
 * @returns True if removed successfully
 * @throws {ValidationError} Invalid input
 * @throws {NotFoundError} Friendship not found
 * 
 * @example
 * await removeFriend('player-123', 'player-456');
 */
export async function removeFriend(
  userId: string,
  friendId: string
): Promise<boolean> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(friendId)) {
    throw new ValidationError('Invalid friend ID format');
  }
  if (userId === friendId) {
    throw new ValidationError('Cannot remove yourself as a friend');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Find friendship (bidirectional)
  const result = await db.collection('friends').deleteOne({
    $or: [
      { userId, friendId, status: FriendStatus.ACCEPTED },
      { userId: friendId, friendId: userId, status: FriendStatus.ACCEPTED },
    ],
  });

  if (result.deletedCount === 0) {
    throw new NotFoundError('Friendship not found');
  }

  return true;
}

/**
 * Get user's friends list with player data
 * 
 * Returns array of friends with populated player information
 * (username, level, VIP status, clan tag).
 * 
 * @param userId - ID of user to get friends for
 * @returns Array of friends with player data
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * const friends = await getFriends('player-123');
 * friends.forEach(f => console.log(f.username, f.level));
 */
export async function getFriends(userId: string): Promise<FriendWithPlayer[]> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }

  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || 'darkframe');

  // Get all friendships where user is involved
  const friendships = await db
    .collection('friends')
    .find({
      $or: [{ userId }, { friendId: userId }],
      status: FriendStatus.ACCEPTED,
    })
    .toArray();

  if (friendships.length === 0) {
    return [];
  }

  // Extract friend IDs (the other user in each friendship)
  const friendIds = friendships.map((f: any) =>
    f.userId === userId ? new ObjectId(f.friendId) : new ObjectId(f.userId)
  );

  // Get player data for all friends
  const players = await db
    .collection('players')
    .find({
      _id: { $in: friendIds },
    })
    .project({
      _id: 1,
      username: 1,
      level: 1,
      vip: 1,
      clanTag: 1,
    })
    .toArray();

  // Create lookup map for quick player data access
  const playerMap = new Map<string, PlayerData>(
    players.map((p: any) => [p._id.toString(), p as PlayerData])
  );

  // Combine friendship and player data
  const friendsWithData: FriendWithPlayer[] = friendships.map((f: any) => {
    const friendUserId = f.userId === userId ? f.friendId : f.userId;
    const playerData = playerMap.get(friendUserId);

    return {
      _id: f._id.toString(),
      userId: f.userId,
      friendId: f.friendId,
      status: f.status,
      initiatedBy: f.initiatedBy,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      username: playerData?.username || 'Unknown',
      level: playerData?.level || 1,
      vip: playerData?.vip || false,
      clanTag: playerData?.clanTag,
    };
  });

  return friendsWithData;
}

/**
 * Get pending friend requests received by user
 * 
 * Returns requests with sender's player data populated.
 * 
 * @param userId - ID of user to get requests for
 * @returns Array of pending requests with sender data
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * const requests = await getPendingRequests('player-456');
 * requests.forEach(r => console.log(r.fromUsername, r.message));
 */
export async function getPendingRequests(
  userId: string
): Promise<FriendRequestWithPlayer[]> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Get all pending requests TO this user
  const requests = await db
    .collection('friendRequests')
    .find({
      to: userId,
      status: FriendRequestStatus.PENDING,
    })
    .sort({ createdAt: -1 })
    .toArray();

  if (requests.length === 0) {
    return [];
  }

  // Get sender player data
  const senderIds = requests.map((r: any) => new ObjectId(r.from));
  const senders = await db
    .collection('players')
    .find({
      _id: { $in: senderIds },
    })
    .project({
      _id: 1,
      username: 1,
      level: 1,
      vip: 1,
      clanTag: 1,
    })
    .toArray();

  // Create lookup map
  const senderMap = new Map<string, PlayerData>(
    senders.map((s: any) => [s._id.toString(), s as PlayerData])
  );

  // Combine request and sender data
  const requestsWithData: FriendRequestWithPlayer[] = requests.map((r: any) => {
    const senderData = senderMap.get(r.from);

    return {
      _id: r._id.toString(),
      from: r.from,
      to: r.to,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      expiresAt: r.expiresAt,
      fromUsername: senderData?.username || 'Unknown',
      fromLevel: senderData?.level || 1,
      fromVip: senderData?.vip || false,
      fromClanTag: senderData?.clanTag,
    };
  });

  return requestsWithData;
}

/**
 * Get pending friend requests sent by user
 * 
 * Returns requests with recipient's player data populated.
 * 
 * @param userId - ID of user to get sent requests for
 * @returns Array of pending sent requests with recipient data
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * const sentRequests = await getSentRequests('player-123');
 * sentRequests.forEach(r => console.log('Sent to:', r.fromUsername));
 */
export async function getSentRequests(
  userId: string
): Promise<FriendRequestWithPlayer[]> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Get all pending requests FROM this user
  const requests = await db
    .collection('friendRequests')
    .find({
      from: userId,
      status: FriendRequestStatus.PENDING,
    })
    .sort({ createdAt: -1 })
    .toArray();

  if (requests.length === 0) {
    return [];
  }

  // Get recipient player data
  const recipientIds = requests.map((r: any) => new ObjectId(r.to));
  const recipients = await db
    .collection('players')
    .find({
      _id: { $in: recipientIds },
    })
    .project({
      _id: 1,
      username: 1,
      level: 1,
      vip: 1,
      clanTag: 1,
    })
    .toArray();

  // Create lookup map
  const recipientMap = new Map<string, PlayerData>(
    recipients.map((p: any) => [p._id.toString(), p as PlayerData])
  );

  // Combine request and recipient data (use "from" fields for recipient data)
  const requestsWithData: FriendRequestWithPlayer[] = requests.map((r: any) => {
    const recipientData = recipientMap.get(r.to);

    return {
      _id: r._id.toString(),
      from: r.from,
      to: r.to,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      expiresAt: r.expiresAt,
      fromUsername: recipientData?.username || 'Unknown',
      fromLevel: recipientData?.level || 1,
      fromVip: recipientData?.vip || false,
      fromClanTag: recipientData?.clanTag,
    };
  });

  return requestsWithData;
}

// ============================================================================
// BLOCKING FUNCTIONS
// ============================================================================

/**
 * Block a user
 * 
 * Validates input and:
 * - Removes existing friendship if present
 * - Cancels any pending friend requests
 * - Creates block entry to prevent future requests
 * 
 * @param userId - ID of user doing the blocking
 * @param targetUserId - ID of user to block
 * @returns True if blocked successfully
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * await blockUser('player-123', 'player-789');
 */
export async function blockUser(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(targetUserId)) {
    throw new ValidationError('Invalid target user ID format');
  }
  if (userId === targetUserId) {
    throw new ValidationError('Cannot block yourself');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Remove existing friendship if any
  await db.collection('friends').deleteOne({
    $or: [
      { userId, friendId: targetUserId, status: FriendStatus.ACCEPTED },
      { userId: targetUserId, friendId: userId, status: FriendStatus.ACCEPTED },
    ],
  });

  // Cancel any pending requests
  await db.collection('friendRequests').updateMany(
    {
      $or: [
        { from: userId, to: targetUserId },
        { from: targetUserId, to: userId },
      ],
      status: FriendRequestStatus.PENDING,
    },
    {
      $set: {
        status: FriendRequestStatus.CANCELLED,
        respondedAt: new Date(),
      },
    }
  );

  // Create block entry
  const now = new Date();
  await db.collection('friends').updateOne(
    { userId, friendId: targetUserId },
    {
      $set: {
        userId,
        friendId: targetUserId,
        status: FriendStatus.BLOCKED,
        initiatedBy: userId,
        isBlocked: true,
        blockedBy: userId,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return true;
}

/**
 * Unblock a user
 * 
 * Removes block entry. Does not restore friendship.
 * 
 * @param userId - ID of user doing the unblocking
 * @param targetUserId - ID of user to unblock
 * @returns True if unblocked successfully
 * @throws {ValidationError} Invalid input
 * @throws {NotFoundError} Block not found
 * 
 * @example
 * await unblockUser('player-123', 'player-789');
 */
export async function unblockUser(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(targetUserId)) {
    throw new ValidationError('Invalid target user ID format');
  }
  if (userId === targetUserId) {
    throw new ValidationError('Cannot unblock yourself');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Remove block entry
  const result = await db.collection('friends').deleteOne({
    userId,
    friendId: targetUserId,
    status: FriendStatus.BLOCKED,
  });

  if (result.deletedCount === 0) {
    throw new NotFoundError('Block entry not found');
  }

  return true;
}

// ============================================================================
// SEARCH & DISCOVERY FUNCTIONS
// ============================================================================

/**
 * Search for users by username
 * 
 * Returns users matching search query with friend status information.
 * Excludes current user and blocked users.
 * 
 * @param userId - ID of user performing search
 * @param query - Search query string
 * @param limit - Maximum results to return (default 20)
 * @returns Array of matching players with friend status
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * const results = await searchUsers('player-123', 'warrior', 10);
 * results.forEach(r => console.log(r.username, r.friendStatus));
 */
export async function searchUsers(
  userId: string,
  query: string,
  limit: number = FRIEND_CONSTANTS.MAX_SEARCH_RESULTS
): Promise<PlayerSearchResult[]> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }
  if (query.length > 50) {
    throw new ValidationError('Search query too long (max 50 characters)');
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Sanitize and prepare regex search
  const sanitizedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchRegex = new RegExp(sanitizedQuery, 'i');

  // Get blocked user IDs
  const blockedUsers = await db
    .collection('friends')
    .find({
      $or: [
        { userId, status: FriendStatus.BLOCKED },
        { friendId: userId, status: FriendStatus.BLOCKED },
      ],
    })
    .toArray();

  const blockedIds = blockedUsers.map((b: any) =>
    b.userId === userId ? new ObjectId(b.friendId) : new ObjectId(b.userId)
  );

  // Search players
  const players = await db
    .collection('players')
    .find({
      username: { $regex: searchRegex },
      _id: {
        $ne: new ObjectId(userId),
        $nin: blockedIds,
      },
    })
    .project({
      _id: 1,
      username: 1,
      level: 1,
      vip: 1,
      clanTag: 1,
    })
    .sort({ level: -1 })
    .limit(Math.min(limit, FRIEND_CONSTANTS.MAX_SEARCH_RESULTS))
    .toArray();

  if (players.length === 0) {
    return [];
  }

  // Get player IDs for friend status lookup
  const playerIds = players.map((p: any) => p._id.toString());

  // Get existing friendships
  const friendships = await db
    .collection('friends')
    .find({
      $or: [
        { userId, friendId: { $in: playerIds } },
        { userId: { $in: playerIds }, friendId: userId },
      ],
      status: FriendStatus.ACCEPTED,
    })
    .toArray();

  const friendIdSet = new Set(
    friendships.map((f: any) =>
      f.userId === userId ? f.friendId : f.userId
    )
  );

  // Get pending requests
  const requests = await db
    .collection('friendRequests')
    .find({
      $or: [
        { from: userId, to: { $in: playerIds } },
        { from: { $in: playerIds }, to: userId },
      ],
      status: FriendRequestStatus.PENDING,
    })
    .toArray();

  const requestIdSet = new Set(
    requests.map((r: any) => (r.from === userId ? r.to : r.from))
  );

  // Combine data
  const results: PlayerSearchResult[] = players.map((p: any) => {
    const playerId = p._id.toString();
    const isFriend = friendIdSet.has(playerId);
    const hasPendingRequest = requestIdSet.has(playerId);

    return {
      _id: playerId,
      username: p.username,
      level: p.level,
      vip: p.vip || false,
      clanTag: p.clanTag,
      friendStatus: isFriend ? FriendStatus.ACCEPTED : undefined,
      hasPendingRequest,
    };
  });

  return results;
}

/**
 * Get friend status between two users
 * 
 * Checks if users are friends, have pending request, or if blocked.
 * 
 * @param userId - First user ID
 * @param targetUserId - Second user ID
 * @returns Friendship status information
 * @throws {ValidationError} Invalid input
 * 
 * @example
 * const status = await getFriendStatus('player-123', 'player-456');
 * if (status.areFriends) {
 *   console.log('You are friends!');
 * } else if (status.hasPendingRequest) {
 *   console.log('Request direction:', status.requestDirection);
 * }
 */
export async function getFriendStatus(
  userId: string,
  targetUserId: string
): Promise<FriendshipStatus> {
  // Validate input
  if (!isValidObjectId(userId)) {
    throw new ValidationError('Invalid user ID format');
  }
  if (!isValidObjectId(targetUserId)) {
    throw new ValidationError('Invalid target user ID format');
  }
  if (userId === targetUserId) {
    return {
      areFriends: false,
      hasPendingRequest: false,
      isBlocked: false,
    };
  }

  const client = await clientPromise;
  const db = client.db('darkframe');

  // Check for friendship
  const friendship = await db.collection('friends').findOne({
    $or: [
      { userId, friendId: targetUserId },
      { userId: targetUserId, friendId: userId },
    ],
  });

  if (friendship) {
    if (friendship.status === FriendStatus.BLOCKED) {
      return {
        areFriends: false,
        hasPendingRequest: false,
        isBlocked: true,
        status: FriendStatus.BLOCKED,
      };
    }

    if (friendship.status === FriendStatus.ACCEPTED) {
      return {
        areFriends: true,
        hasPendingRequest: false,
        isBlocked: false,
        status: FriendStatus.ACCEPTED,
      };
    }
  }

  // Check for pending request
  const request = await db.collection('friendRequests').findOne({
    $or: [
      { from: userId, to: targetUserId },
      { from: targetUserId, to: userId },
    ],
    status: FriendRequestStatus.PENDING,
  });

  if (request) {
    return {
      areFriends: false,
      hasPendingRequest: true,
      isBlocked: false,
      requestDirection: request.from === userId ? 'sent' : 'received',
      status: FriendStatus.PENDING,
    };
  }

  // No relationship
  return {
    areFriends: false,
    hasPendingRequest: false,
    isBlocked: false,
  };
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. MONGODB QUERIES:
 *    - Bidirectional friend queries use $or with both user combinations
 *    - Indexes needed: (userId, friendId, status), (from, to, status)
 *    - Consider compound indexes for performance at scale
 * 
 * 2. ERROR HANDLING:
 *    - Custom error classes for specific error types
 *    - API layer should catch and map to HTTP status codes:
 *      * ValidationError → 400 Bad Request
 *      * NotFoundError → 404 Not Found
 *      * PermissionError → 403 Forbidden
 *      * Error → 500 Internal Server Error
 * 
 * 3. PERFORMANCE OPTIMIZATION:
 *    - Use projection to limit fields returned from MongoDB
 *    - Batch operations where possible (e.g., getFriends gets all at once)
 *    - Consider caching friend counts in player document
 *    - For large friend lists, implement cursor-based pagination
 * 
 * 4. FUTURE ENHANCEMENTS:
 *    - Implement soft delete for audit trail (deletedAt field)
 *    - Add notification triggers (emit events for UI updates)
 *    - Implement request expiration cleanup job
 *    - Add friend suggestions based on mutual friends
 *    - Track online status (integrate with Redis cache)
 *    - Add friend groups/categories
 *    - Implement favorite friends feature
 * 
 * 5. SECURITY CONSIDERATIONS:
 *    - Always validate ObjectId format to prevent injection
 *    - Sanitize user input (messages, usernames in search)
 *    - Rate limit friend request sending (implement in API layer)
 *    - Prevent abuse of block/unblock cycling
 * 
 * 6. TESTING RECOMMENDATIONS:
 *    - Test all validation error cases
 *    - Test bidirectional friendship queries
 *    - Test concurrent request handling (race conditions)
 *    - Test max limits enforcement
 *    - Test blocking prevents all interaction
 *    - Mock MongoDB for unit tests
 * 
 * 7. INTEGRATION WITH OTHER SYSTEMS:
 *    - DM system: Check friend status before allowing DMs
 *    - @Mentions: Filter autocomplete by friends first
 *    - Online status: Integrate with WebSocket/polling system
 *    - Notifications: Emit events for friend requests, accepts
 * 
 * 8. DATABASE SCHEMA RECOMMENDATIONS:
 *    friends collection:
 *    - Index: { userId: 1, friendId: 1, status: 1 } (unique)
 *    - Index: { friendId: 1, userId: 1, status: 1 }
 *    - Index: { status: 1, createdAt: -1 }
 *    
 *    friendRequests collection:
 *    - Index: { from: 1, to: 1, status: 1 } (unique for pending)
 *    - Index: { to: 1, status: 1, createdAt: -1 }
 *    - Index: { expiresAt: 1 } (for cleanup job)
 * 
 * 9. CRON JOB REQUIREMENTS:
 *    - Clean up expired requests (run daily)
 *    - Delete declined/cancelled requests older than 90 days
 *    - Archive old friend data if needed
 * 
 * 10. MONITORING & METRICS:
 *     - Track friend request acceptance rate
 *     - Monitor average time to accept/decline
 *     - Track block/unblock frequency
 *     - Monitor search query patterns
 *     - Alert on unusual patterns (mass blocking, spam requests)
 */
