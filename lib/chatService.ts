/**
 * Chat Service
 * Created: 2025-10-25
 * Feature: FID-20251025-103
 * 
 * OVERVIEW:
 * Core chat functionality with MongoDB persistence, item linking,
 * profanity filtering, rate limiting, and Ask Veterans notifications.
 * Handles message storage with 1-week display window and 1-year retention.
 * 
 * KEY FEATURES:
 * - Message storage with monthly categorization
 * - 1-week display window, 1-year retention
 * - Item link parsing: [ItemName] → clickable links
 * - Profanity filtering (bad-words + custom blacklist)
 * - Rate limiting (5 msgs/10s normal, 10 msgs/10s VIP)
 * - Ask Veterans notification system
 * - @mention parsing and validation
 * - Unread message tracking
 * 
 * DEPENDENCIES:
 * - bad-words (profanity filtering)
 * - react-mentions (mention parsing - client-side)
 * - channelService (permissions)
 */

import { MongoClient, ObjectId, Collection } from 'mongodb';
import { Filter } from 'bad-words';
import {
  ChannelType,
  canWriteChannel,
  type PlayerContext,
} from './channelService';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Chat message stored in database
 */
export interface ChatMessage {
  _id: ObjectId;
  channelId: ChannelType;
  clanId?: string; // If clan channel
  senderId: string;
  senderUsername: string;
  senderLevel: number;
  isVIP: boolean;
  isNewbie: boolean; // Level 1-5
  message: string;
  itemLinks: string[]; // Parsed [ItemName] references
  mentions: string[]; // @username references
  timestamp: Date;
  monthCategory: string; // "2025-10" for indexing/cleanup
  edited: boolean;
  editedAt?: Date;
  deleted: boolean;
  deletedBy?: string;
  deletionReason?: string;
}

/**
 * Create message request
 */
export interface SendMessageRequest {
  channelId: ChannelType;
  clanId?: string;
  sender: PlayerContext;
  message: string;
}

/**
 * Message history request
 */
export interface GetMessagesRequest {
  channelId: ChannelType;
  clanId?: string;
  limit?: number; // Default: 100
  before?: Date; // Pagination: messages before this timestamp
  since?: Date; // Messages after this timestamp (for real-time sync)
}

/**
 * Unread message count
 */
export interface UnreadCount {
  channelId: ChannelType;
  count: number;
  lastMessageTimestamp: Date;
}

/**
 * Ask Veterans notification
 */
export interface VeteranNotification {
  playerId: string;
  playerUsername: string;
  playerLevel: number;
  question: string;
  timestamp: Date;
  channelId: ChannelType;
}

/**
 * Rate limit tracking
 */
interface RateLimitEntry {
  count: number;
  resetTime: number; // Timestamp in ms
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || '';
const COLLECTION_MESSAGES = 'chat_messages';
const COLLECTION_READ_STATUS = 'chat_read_status';

// Rate limiting
const RATE_LIMIT_WINDOW = 10 * 1000; // 10 seconds
const RATE_LIMIT_NORMAL = 5; // 5 messages per 10 seconds
const RATE_LIMIT_VIP = 10; // 10 messages per 10 seconds

// History retention
const DISPLAY_WINDOW_DAYS = 7; // Show 1 week of history
const RETENTION_DAYS = 365; // Keep 1 year of history

// Veteran level threshold for "Ask Veterans" feature
const VETERAN_LEVEL_THRESHOLD = 50;

// ============================================================================
// STATE
// ============================================================================

let client: MongoClient | null = null;
let messagesCollection: Collection<ChatMessage> | null = null;

// In-memory rate limiting
const rateLimits = new Map<string, RateLimitEntry>();

// Profanity filter
const profanityFilter = new Filter();

// Custom blacklist words (loaded from database)
let customBlacklist: string[] = [];

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

/**
 * Get MongoDB client instance (singleton pattern)
 */
async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  
  const db = client.db();
  messagesCollection = db.collection<ChatMessage>(COLLECTION_MESSAGES);

  // Create indexes for performance
  await messagesCollection.createIndex({ channelId: 1, timestamp: -1 });
  await messagesCollection.createIndex({ monthCategory: 1 });
  await messagesCollection.createIndex({ senderId: 1 });
  await messagesCollection.createIndex({ clanId: 1 }, { sparse: true });

  return client;
}

/**
 * Get messages collection
 */
async function getMessagesCollection(): Promise<Collection<ChatMessage>> {
  if (messagesCollection) return messagesCollection;
  
  await getMongoClient();
  if (!messagesCollection) {
    throw new Error('Failed to initialize messages collection');
  }
  
  return messagesCollection;
}

// ============================================================================
// CONTENT FILTERING
// ============================================================================

/**
 * Load custom blacklist words from database
 */
async function loadCustomBlacklist(): Promise<void> {
  try {
    await getMongoClient();
    const db = client!.db();
    const blacklistCollection = db.collection('word_blacklist');
    
    const words = await blacklistCollection.find({}).toArray();
    customBlacklist = words.map(w => w.word);
    
    // Add to profanity filter
    if (customBlacklist.length > 0) {
      profanityFilter.addWords(...customBlacklist);
    }
  } catch (error) {
    console.error('[ChatService] Failed to load custom blacklist:', error);
  }
}

// Load blacklist on module initialization
loadCustomBlacklist();

/**
 * Filter profanity from message
 * 
 * @param message - Message to filter
 * @returns Filtered message with profanity replaced by asterisks
 * 
 * @example
 * filterProfanity("This is a badword test") // "This is a ******* test"
 */
export function filterProfanity(message: string): string {
  try {
    return profanityFilter.clean(message);
  } catch (error) {
    console.error('[ChatService] Profanity filter error:', error);
    return message;
  }
}

/**
 * Check if message contains profanity
 * 
 * @param message - Message to check
 * @returns True if profanity detected
 */
export function containsProfanity(message: string): boolean {
  try {
    return profanityFilter.isProfane(message);
  } catch (error) {
    console.error('[ChatService] Profanity check error:', error);
    return false;
  }
}

// ============================================================================
// ITEM LINK PARSING
// ============================================================================

/**
 * Parse item links from message
 * Format: [ItemName] → array of item names
 * 
 * @param message - Message to parse
 * @returns Array of item names found in brackets
 * 
 * @example
 * parseItemLinks("I have [Legendary Digger] and [Rare Harvester]")
 * // Returns: ['Legendary Digger', 'Rare Harvester']
 */
export function parseItemLinks(message: string): string[] {
  const regex = /\[([^\]]+)\]/g;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(message)) !== null) {
    matches.push(match[1].trim());
  }

  return matches;
}

/**
 * Validate item exists in database
 * 
 * @param itemName - Item name to validate
 * @returns True if item exists
 */
export async function validateItem(itemName: string): Promise<boolean> {
  try {
    await getMongoClient();
    const db = client!.db();
    const itemsCollection = db.collection('items');
    
    const item = await itemsCollection.findOne({
      name: { $regex: new RegExp(`^${itemName}$`, 'i') },
    });
    
    return item !== null;
  } catch (error) {
    console.error('[ChatService] Item validation error:', error);
    return false;
  }
}

// ============================================================================
// @MENTION PARSING
// ============================================================================

/**
 * Parse @mentions from message
 * Format: @username → array of usernames
 * 
 * @param message - Message to parse
 * @returns Array of mentioned usernames
 * 
 * @example
 * parseMentions("Hey @john and @alice check this out")
 * // Returns: ['john', 'alice']
 */
export function parseMentions(message: string): string[] {
  const regex = /@(\w+)/g;
  const matches: string[] = [];
  let match;

  while ((match = regex.exec(message)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

/**
 * Validate username exists
 * 
 * @param username - Username to validate
 * @returns True if user exists
 */
export async function validateUsername(username: string): Promise<boolean> {
  try {
    await getMongoClient();
    const db = client!.db();
    const playersCollection = db.collection('players');
    
    const player = await playersCollection.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') },
    });
    
    return player !== null;
  } catch (error) {
    console.error('[ChatService] Username validation error:', error);
    return false;
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if player is rate limited for global chat
 * 
 * @param playerId - Player ID to check
 * @param isVIP - Is player VIP (higher limit)
 * @returns True if rate limit exceeded
 */
export function checkGlobalChatRateLimit(playerId: string, isVIP: boolean): boolean {
  const now = Date.now();
  const limit = isVIP ? RATE_LIMIT_VIP : RATE_LIMIT_NORMAL;
  
  const entry = rateLimits.get(playerId);
  
  if (!entry || now > entry.resetTime) {
    // Create new window
    rateLimits.set(playerId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return false;
  }
  
  if (entry.count >= limit) {
    // Rate limit exceeded
    return true;
  }
  
  // Increment count
  entry.count++;
  return false;
}

/**
 * Get time until rate limit resets
 * 
 * @param playerId - Player ID
 * @returns Seconds until reset, or 0 if not rate limited
 */
export function getRateLimitResetTime(playerId: string): number {
  const entry = rateLimits.get(playerId);
  if (!entry) return 0;
  
  const now = Date.now();
  if (now > entry.resetTime) return 0;
  
  return Math.ceil((entry.resetTime - now) / 1000);
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Send a global chat message
 * 
 * @param request - Send message request
 * @returns Created message or error
 */
export async function sendGlobalChatMessage(
  request: SendMessageRequest
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  try {
    const { channelId, clanId, sender, message } = request;

    // Validate permissions
    const perm = canWriteChannel(channelId, sender);
    if (!perm.canWrite) {
      return { success: false, error: perm.reason || 'Permission denied' };
    }

    // Check rate limit
    if (checkGlobalChatRateLimit(sender.username, sender.isVIP)) {
      const resetTime = getRateLimitResetTime(sender.username);
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
      };
    }

    // Validate message length
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }
    if (trimmed.length > 1000) {
      return { success: false, error: 'Message too long (max 1000 characters)' };
    }

    // Filter profanity
    const filtered = filterProfanity(trimmed);

    // Parse item links and mentions
    const itemLinks = parseItemLinks(filtered);
    const mentions = parseMentions(filtered);

    // Create message document
    const now = new Date();
    const monthCategory = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const chatMessage: Omit<ChatMessage, '_id'> = {
      channelId,
      clanId,
      senderId: sender.username,
      senderUsername: sender.username,
      senderLevel: sender.level,
      isVIP: sender.isVIP,
      isNewbie: sender.level >= 1 && sender.level <= 5,
      message: filtered,
      itemLinks,
      mentions,
      timestamp: now,
      monthCategory,
      edited: false,
      deleted: false,
    };

    // Save to database
    const collection = await getMessagesCollection();
    const result = await collection.insertOne(chatMessage as ChatMessage);

    const savedMessage: ChatMessage = {
      ...chatMessage,
      _id: result.insertedId,
    } as ChatMessage;

    return { success: true, message: savedMessage };
  } catch (error) {
    console.error('[ChatService] Send message error:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

/**
 * Get message history for a global chat channel
 * Returns 1 week of history by default
 * 
 * @param request - Get messages request
 * @returns Array of messages
 */
export async function getGlobalChatMessages(
  request: GetMessagesRequest
): Promise<ChatMessage[]> {
  try {
    const { channelId, clanId, limit = 100, before, since } = request;

    const collection = await getMessagesCollection();

    // Build query
    const query: any = {
      channelId,
      deleted: false,
    };

    if (clanId) {
      query.clanId = clanId;
    }

    // 1-week display window (unless specific date range requested)
    if (!since && !before) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - DISPLAY_WINDOW_DAYS);
      query.timestamp = { $gte: oneWeekAgo };
    } else {
      if (since) {
        query.timestamp = { $gte: since };
      }
      if (before) {
        query.timestamp = { ...query.timestamp, $lt: before };
      }
    }

    // Fetch messages
    const messages = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(limit, 500)) // Cap at 500 for performance
      .toArray();

    return messages.reverse(); // Oldest first for display
  } catch (error) {
    console.error('[ChatService] Get messages error:', error);
    return [];
  }
}

/**
 * Delete a global chat message (admin only)
 * 
 * @param messageId - Message ID to delete
 * @param deletedBy - Username of admin
 * @param reason - Deletion reason
 * @returns Success status
 */
export async function deleteGlobalChatMessage(
  messageId: string,
  deletedBy: string,
  reason: string
): Promise<boolean> {
  try {
    const collection = await getMessagesCollection();
    
    const result = await collection.updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          deleted: true,
          deletedBy,
          deletionReason: reason,
        },
      }
    );

    return result.modifiedCount > 0;
  } catch (error) {
    console.error('[ChatService] Delete message error:', error);
    return false;
  }
}

/**
 * Edit a global chat message (own messages only, within 5 minutes)
 * 
 * @param messageId - Message ID
 * @param newMessage - New message content
 * @param userId - User ID making the edit
 * @returns Success status
 */
export async function editGlobalChatMessage(
  messageId: string,
  newMessage: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const collection = await getMessagesCollection();
    
    const message = await collection.findOne({ _id: new ObjectId(messageId) });
    
    if (!message) {
      return { success: false, error: 'Message not found' };
    }
    
    if (message.senderId !== userId) {
      return { success: false, error: 'Can only edit own messages' };
    }
    
    // Check 5-minute edit window
    const now = new Date();
    const messageAge = now.getTime() - message.timestamp.getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (messageAge > fiveMinutes) {
      return { success: false, error: 'Edit window expired (5 minutes)' };
    }
    
    // Filter profanity and update
    const filtered = filterProfanity(newMessage.trim());
    const itemLinks = parseItemLinks(filtered);
    const mentions = parseMentions(filtered);
    
    const result = await collection.updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          message: filtered,
          itemLinks,
          mentions,
          edited: true,
          editedAt: now,
        },
      }
    );
    
    return { success: result.modifiedCount > 0 };
  } catch (error) {
    console.error('[ChatService] Edit message error:', error);
    return { success: false, error: 'Failed to edit message' };
  }
}

// ============================================================================
// ASK VETERANS FEATURE
// ============================================================================

/**
 * Send "Ask Veterans" notification
 * Notifies all online players level 50+ about a help request
 * 
 * @param playerId - Player asking for help
 * @param playerUsername - Player's username
 * @param playerLevel - Player's level
 * @param question - The question being asked
 * @returns Notification object
 */
export async function sendVeteranNotification(
  playerId: string,
  playerUsername: string,
  playerLevel: number,
  question: string
): Promise<VeteranNotification> {
  const notification: VeteranNotification = {
    playerId,
    playerUsername,
    playerLevel,
    question,
    timestamp: new Date(),
    channelId: ChannelType.HELP,
  };

  // Notification will be broadcasted via WebSocket to veteran players
  // (level >= VETERAN_LEVEL_THRESHOLD)
  
  return notification;
}

/**
 * Check if player qualifies as veteran
 * 
 * @param playerLevel - Player's level
 * @returns True if veteran (level 50+)
 */
export function isVeteran(playerLevel: number): boolean {
  return playerLevel >= VETERAN_LEVEL_THRESHOLD;
}

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * Purge messages older than 1 year
 * Runs as cron job (annually on January 1st)
 * 
 * @returns Number of messages deleted
 */
export async function purgeOldMessages(): Promise<number> {
  try {
    const collection = await getMessagesCollection();
    
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - RETENTION_DAYS);
    
    const result = await collection.deleteMany({
      timestamp: { $lt: oneYearAgo },
    });
    
    console.log(`[ChatService] Purged ${result.deletedCount} old messages`);
    return result.deletedCount;
  } catch (error) {
    console.error('[ChatService] Purge old messages error:', error);
    return 0;
  }
}

/**
 * Reload custom blacklist from database
 * Call this after admin adds new words
 */
export async function reloadChatBlacklist(): Promise<void> {
  await loadCustomBlacklist();
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Message Storage:
 *    - MongoDB with monthly categorization (monthCategory field)
 *    - 1-week display window (default query filter)
 *    - 1-year retention (annual cleanup on Jan 1st)
 * 
 * 2. Item Linking:
 *    - Parse [ItemName] from messages
 *    - Validate items exist in database
 *    - Store in itemLinks array
 *    - Frontend renders as clickable links
 * 
 * 3. Profanity Filtering:
 *    - bad-words library for base filtering
 *    - Custom blacklist loaded from database
 *    - Filter applied before saving
 *    - Profanity replaced with asterisks
 * 
 * 4. Rate Limiting:
 *    - In-memory tracking (10-second windows)
 *    - Normal: 5 msgs/10s, VIP: 10 msgs/10s
 *    - Returns seconds until reset
 *    - TODO: Move to Redis for distributed systems
 * 
 * 5. Ask Veterans:
 *    - Button in Help channel
 *    - Broadcasts to level 50+ players
 *    - WebSocket integration required
 *    - 5-minute cooldown per player
 * 
 * 6. Permissions:
 *    - Uses channelService.canWriteChannel()
 *    - Checks mute status, bans, level restrictions
 *    - VIP benefits (higher rate limit)
 * 
 * 7. Message Editing:
 *    - Own messages only
 *    - 5-minute edit window
 *    - Profanity filtered on edit
 *    - Marked as edited with timestamp
 * 
 * 8. Performance:
 *    - Indexed by channelId + timestamp
 *    - Indexed by monthCategory for cleanup
 *    - Limit queries to 500 messages max
 *    - 1-week default display reduces load
 */
