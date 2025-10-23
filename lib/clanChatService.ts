/**
 * Clan Chat Service
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Manages clan chat functionality including message sending, history retrieval,
 * and moderation. Provides real-time chat experience for clan members with
 * role-based permissions and message persistence.
 * 
 * Features:
 * - Message sending with validation
 * - Message history with pagination
 * - Role-based moderation (delete messages)
 * - Message editing (own messages only)
 * - Anti-spam protection (rate limiting)
 * - System messages for clan events
 * 
 * Permissions:
 * - Send: All members except Recruit (24hr wait)
 * - Edit: Own messages within 5 minutes
 * - Delete: Leaders/Co-Leaders can delete any, others own only
 * - View: All members
 * 
 * @module lib/clanChatService
 */

import { MongoClient, Db, ObjectId } from 'mongodb';

let client: MongoClient;
let db: Db;

/**
 * Initialize chat service
 */
export function initializeChatService(mongoClient: MongoClient, database: Db): void {
  client = mongoClient;
  db = database;
}

/**
 * Get database instance
 */
function getDb(): Db {
  if (!db) {
    throw new Error('Chat service not initialized');
  }
  return db;
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export enum MessageType {
  USER = 'USER',           // Regular user message
  SYSTEM = 'SYSTEM',       // System-generated message (war declared, etc.)
  ANNOUNCEMENT = 'ANNOUNCEMENT', // Leader announcement (highlighted)
}

export interface ChatMessage {
  _id?: ObjectId;
  clanId: string;
  type: MessageType;
  
  // User messages
  playerId?: string;
  username?: string;
  role?: string;
  
  message: string;
  timestamp: Date;
  
  // Moderation
  editedAt?: Date;
  deletedAt?: Date;
  deletedBy?: string;
  
  // System messages
  eventType?: string;       // For system messages (e.g., 'WAR_DECLARED')
  eventData?: any;          // Additional event data
}

export interface ChatMessageWithAuthor extends ChatMessage {
  author?: {
    playerId: string;
    username: string;
    role: string;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const CHAT_LIMITS = {
  MESSAGE_MAX_LENGTH: 500,
  MESSAGES_PER_PAGE: 50,
  RATE_LIMIT_MESSAGES: 5,      // Max messages
  RATE_LIMIT_WINDOW_SECONDS: 60, // Per 60 seconds
  EDIT_WINDOW_MINUTES: 5,       // Can edit within 5 minutes
  RECRUIT_WAIT_HOURS: 24,       // Recruits must wait 24 hours
};

// ============================================================================
// MESSAGE FUNCTIONS
// ============================================================================

/**
 * Send chat message
 * 
 * @param clanId - Clan ID
 * @param playerId - Player sending message
 * @param message - Message text
 * @param type - Message type (default USER)
 * @returns Created message
 * @throws Error if validation fails or rate limited
 * @example
 * const msg = await sendMessage('clan123', 'player456', 'Hello clan!');
 */
export async function sendMessage(
  clanId: string,
  playerId: string,
  message: string,
  type: MessageType = MessageType.USER
): Promise<ChatMessage> {
  const database = getDb();
  const clansCollection = database.collection('clans');
  const playersCollection = database.collection('players');
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  // Validate message length
  if (!message || message.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }
  
  if (message.length > CHAT_LIMITS.MESSAGE_MAX_LENGTH) {
    throw new Error(`Message too long (max ${CHAT_LIMITS.MESSAGE_MAX_LENGTH} characters)`);
  }
  
  // Get clan and player
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }
  
  // Check recruit wait period
  if (member.role === 'RECRUIT') {
    const joinedAt = new Date(member.joinedAt);
    const hoursSinceJoin = (Date.now() - joinedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceJoin < CHAT_LIMITS.RECRUIT_WAIT_HOURS) {
      const hoursRemaining = Math.ceil(CHAT_LIMITS.RECRUIT_WAIT_HOURS - hoursSinceJoin);
      throw new Error(`Recruits must wait ${hoursRemaining} hours before chatting`);
    }
  }
  
  // Rate limiting check
  const rateLimitStart = new Date(Date.now() - CHAT_LIMITS.RATE_LIMIT_WINDOW_SECONDS * 1000);
  const recentMessages = await messagesCollection.countDocuments({
    clanId,
    playerId,
    timestamp: { $gte: rateLimitStart },
    deletedAt: { $exists: false },
  });
  
  if (recentMessages >= CHAT_LIMITS.RATE_LIMIT_MESSAGES) {
    throw new Error(`Rate limit exceeded. Max ${CHAT_LIMITS.RATE_LIMIT_MESSAGES} messages per ${CHAT_LIMITS.RATE_LIMIT_WINDOW_SECONDS} seconds`);
  }
  
  // Get player info
  const player = await playersCollection.findOne({ _id: new ObjectId(playerId) });
  
  // Create message
  const chatMessage: ChatMessage = {
    clanId,
    type,
    playerId,
    username: player?.username || 'Unknown',
    role: member.role,
    message: message.trim(),
    timestamp: new Date(),
  };
  
  const result = await messagesCollection.insertOne(chatMessage as any);
  chatMessage._id = result.insertedId;
  
  return chatMessage;
}

/**
 * Send system message
 * 
 * @param clanId - Clan ID
 * @param message - System message text
 * @param eventType - Event type (e.g., 'WAR_DECLARED')
 * @param eventData - Additional event data
 * @returns Created message
 * @example
 * await sendSystemMessage('clan123', 'War declared against Enemy Clan!', 'WAR_DECLARED', { targetClan: 'clan456' });
 */
export async function sendSystemMessage(
  clanId: string,
  message: string,
  eventType?: string,
  eventData?: any
): Promise<ChatMessage> {
  const database = getDb();
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  const chatMessage: ChatMessage = {
    clanId,
    type: MessageType.SYSTEM,
    message: message.trim(),
    timestamp: new Date(),
    eventType,
    eventData,
  };
  
  const result = await messagesCollection.insertOne(chatMessage as any);
  chatMessage._id = result.insertedId;
  
  return chatMessage;
}

/**
 * Get chat messages with pagination
 * 
 * @param clanId - Clan ID
 * @param limit - Number of messages to retrieve
 * @param before - Get messages before this timestamp (for pagination)
 * @returns Array of messages (newest first)
 * @example
 * const messages = await getMessages('clan123', 50);
 * const olderMessages = await getMessages('clan123', 50, messages[messages.length - 1].timestamp);
 */
export async function getMessages(
  clanId: string,
  limit = CHAT_LIMITS.MESSAGES_PER_PAGE,
  before?: Date
): Promise<ChatMessage[]> {
  const database = getDb();
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  const query: any = {
    clanId,
    deletedAt: { $exists: false }, // Exclude deleted messages
  };
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  const messages = await messagesCollection
    .find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(limit, CHAT_LIMITS.MESSAGES_PER_PAGE))
    .toArray();
  
  return messages;
}

/**
 * Edit message (own messages only, within time limit)
 * 
 * @param messageId - Message ID
 * @param playerId - Player editing (must be author)
 * @param newMessage - New message text
 * @returns Updated message
 * @throws Error if not authorized or time limit exceeded
 * @example
 * await editMessage('msg123', 'player456', 'Corrected message');
 */
export async function editMessage(
  messageId: string,
  playerId: string,
  newMessage: string
): Promise<ChatMessage> {
  const database = getDb();
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  // Validate new message
  if (!newMessage || newMessage.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }
  
  if (newMessage.length > CHAT_LIMITS.MESSAGE_MAX_LENGTH) {
    throw new Error(`Message too long (max ${CHAT_LIMITS.MESSAGE_MAX_LENGTH} characters)`);
  }
  
  // Get message
  const message = await messagesCollection.findOne({ _id: new ObjectId(messageId) });
  if (!message) {
    throw new Error('Message not found');
  }
  
  if (message.deletedAt) {
    throw new Error('Cannot edit deleted message');
  }
  
  // Verify ownership
  if (message.playerId !== playerId) {
    throw new Error('Can only edit your own messages');
  }
  
  // Check time limit
  const minutesSincePost = (Date.now() - message.timestamp.getTime()) / (1000 * 60);
  if (minutesSincePost > CHAT_LIMITS.EDIT_WINDOW_MINUTES) {
    throw new Error(`Can only edit messages within ${CHAT_LIMITS.EDIT_WINDOW_MINUTES} minutes`);
  }
  
  // Update message
  await messagesCollection.updateOne(
    { _id: new ObjectId(messageId) },
    {
      $set: {
        message: newMessage.trim(),
        editedAt: new Date(),
      },
    }
  );
  
  const updatedMessage = await messagesCollection.findOne({ _id: new ObjectId(messageId) });
  return updatedMessage as ChatMessage;
}

/**
 * Delete message
 * Leaders/Co-Leaders can delete any message, others can only delete own
 * 
 * @param messageId - Message ID
 * @param clanId - Clan ID
 * @param playerId - Player deleting
 * @returns Success status
 * @throws Error if not authorized
 * @example
 * await deleteMessage('msg123', 'clan123', 'player456');
 */
export async function deleteMessage(
  messageId: string,
  clanId: string,
  playerId: string
): Promise<void> {
  const database = getDb();
  const clansCollection = database.collection('clans');
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  // Get message
  const message = await messagesCollection.findOne({ _id: new ObjectId(messageId) });
  if (!message) {
    throw new Error('Message not found');
  }
  
  if (message.clanId !== clanId) {
    throw new Error('Message not in this clan');
  }
  
  if (message.deletedAt) {
    throw new Error('Message already deleted');
  }
  
  // Get clan and member
  const clan = await clansCollection.findOne({ _id: new ObjectId(clanId) });
  if (!clan) {
    throw new Error('Clan not found');
  }
  
  const member = clan.members.find((m: any) => m.playerId === playerId);
  if (!member) {
    throw new Error('Player is not a member of this clan');
  }
  
  // Check permissions
  const canDeleteAny = ['LEADER', 'CO_LEADER'].includes(member.role);
  const isOwnMessage = message.playerId === playerId;
  
  if (!canDeleteAny && !isOwnMessage) {
    throw new Error('Can only delete your own messages');
  }
  
  // Soft delete
  await messagesCollection.updateOne(
    { _id: new ObjectId(messageId) },
    {
      $set: {
        deletedAt: new Date(),
        deletedBy: playerId,
      },
    }
  );
}

/**
 * Get message count for clan
 * 
 * @param clanId - Clan ID
 * @returns Total message count (excluding deleted)
 */
export async function getMessageCount(clanId: string): Promise<number> {
  const database = getDb();
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  const count = await messagesCollection.countDocuments({
    clanId,
    deletedAt: { $exists: false },
  });
  
  return count;
}

/**
 * Get recent messages since timestamp
 * Used for real-time updates
 * 
 * @param clanId - Clan ID
 * @param since - Get messages after this timestamp
 * @returns Array of new messages
 */
export async function getMessagesSince(clanId: string, since: Date): Promise<ChatMessage[]> {
  const database = getDb();
  const messagesCollection = database.collection<ChatMessage>('clan_chat_messages');
  
  const messages = await messagesCollection
    .find({
      clanId,
      timestamp: { $gt: since },
      deletedAt: { $exists: false },
    })
    .sort({ timestamp: 1 }) // Oldest first for appending
    .toArray();
  
  return messages;
}
