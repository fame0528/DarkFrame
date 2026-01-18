/**
 * Messaging Service
 * Created: 2025-10-25
 * Feature: FID-20251025-102
 * 
 * OVERVIEW:
 * Core business logic for the private messaging system. Handles message sending,
 * conversation management, read receipts, profanity filtering, and rate limiting.
 * 
 * KEY RESPONSIBILITIES:
 * - Send and receive private messages between players
 * - Manage conversations and message history
 * - Filter profanity using bad-words package
 * - Enforce rate limits to prevent spam
 * - Track read receipts and delivery status
 * - Provide pagination for message history
 * 
 * DEPENDENCIES:
 * - MongoDB for persistence
 * - bad-words for profanity filtering
 * - types/messaging.types.ts for type safety
 */

import { ObjectId } from 'mongodb';
import { Filter } from 'bad-words';
import clientPromise from './mongodb';
import type {
  Message,
  Conversation,
  SendMessageRequest,
  SendMessageValidation,
  GetMessagesRequest,
  GetConversationsRequest,
  MessageResponse,
  ConversationsResponse,
  MessagesResponse,
  RateLimitState,
  MessageStatus,
  DEFAULT_MESSAGING_CONFIG,
} from '@/types/messaging.types';

// Initialize profanity filter
const profanityFilter = new Filter();

// Rate limiting cache (in production, use Redis)
const rateLimitCache = new Map<string, RateLimitState>();

// ============================================================================
// VALIDATION & FILTERING
// ============================================================================

/**
 * Validate message content before sending
 * @param request - Send message request to validate
 * @returns Validation result with errors and filtered content
 */
export async function validateMessage(
  request: SendMessageRequest
): Promise<SendMessageValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Content length validation
  if (!request.content || request.content.trim().length === 0) {
    errors.push('Message content cannot be empty');
  }

  const config = {
    minLength: 1,
    maxLength: 1000,
    allowEmojis: true,
    allowLinks: true,
    profanityFilter: true,
    rateLimitPerMinute: 20,
  };

  if (request.content.length < config.minLength) {
    errors.push(`Message must be at least ${config.minLength} character(s)`);
  }

  if (request.content.length > config.maxLength) {
    errors.push(`Message cannot exceed ${config.maxLength} characters`);
  }

  // Recipient validation
  if (!request.recipientId || request.recipientId.trim().length === 0) {
    errors.push('Recipient ID is required');
  }

  // Profanity filtering
  let filteredContent = request.content;
  if (config.profanityFilter) {
    const originalContent = request.content;
    filteredContent = profanityFilter.clean(request.content);
    
    if (filteredContent !== originalContent) {
      warnings.push('Message contains filtered content');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    filteredContent,
  };
}

/**
 * Check if player has exceeded direct message rate limit
 * @param playerId - Player to check
 * @returns Rate limit state
 */
export function checkDirectMessageRateLimit(playerId: string): RateLimitState {
  const now = new Date();
  const existing = rateLimitCache.get(playerId);

  if (!existing) {
    // First message
    const state: RateLimitState = {
      playerId,
      messageCount: 1,
      windowStart: now,
      isBlocked: false,
      resetAt: new Date(now.getTime() + 60000), // 1 minute from now
    };
    rateLimitCache.set(playerId, state);
    return state;
  }

  // Check if window has expired
  const windowAge = now.getTime() - existing.windowStart.getTime();
  if (windowAge > 60000) {
    // Reset window
    const state: RateLimitState = {
      playerId,
      messageCount: 1,
      windowStart: now,
      isBlocked: false,
      resetAt: new Date(now.getTime() + 60000),
    };
    rateLimitCache.set(playerId, state);
    return state;
  }

  // Increment count
  const config = {
    minLength: 1,
    maxLength: 1000,
    allowEmojis: true,
    allowLinks: true,
    profanityFilter: true,
    rateLimitPerMinute: 20,
  };

  existing.messageCount++;
  existing.isBlocked = existing.messageCount > config.rateLimitPerMinute;
  rateLimitCache.set(playerId, existing);

  return existing;
}

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

/**
 * Get or create a conversation between two players
 * @param player1Id - First player ID/username
 * @param player2Id - Second player ID/username
 * @returns Conversation object
 */
export async function getOrCreateConversation(
  player1Id: string,
  player2Id: string
): Promise<Conversation> {
  const client = await clientPromise;
  const db = client.db();
  const conversations = db.collection<Conversation>('conversations');

  // Normalize participant order for consistent lookup
  const participants: [string, string] = [player1Id, player2Id].sort() as [string, string];

  // Try to find existing conversation
  let conversation = await conversations.findOne({
    participants: { $all: participants },
  });

  if (!conversation) {
    // Create new conversation
    const newConversation: Conversation = {
      _id: new ObjectId(),
      participants,
      unreadCount: {
        [player1Id]: 0,
        [player2Id]: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await conversations.insertOne(newConversation as any);
    conversation = newConversation;
  }

  return conversation;
}

/**
 * Get all conversations for a player
 * @param request - Request with player ID and pagination options
 * @returns List of conversations with metadata
 */
export async function getConversations(
  request: GetConversationsRequest
): Promise<ConversationsResponse> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const conversations = db.collection<Conversation>('conversations');

    const limit = request.limit || 20;
    const offset = request.offset || 0;

    // Build query
    const query: any = {
      participants: request.playerId,
    };

    if (!request.includeArchived) {
      query[`isArchived.${request.playerId}`] = { $ne: true };
    }

    // Build sort
    let sort: any = { updatedAt: -1 }; // Default: most recent first

    if (request.sortBy === 'unread') {
      sort = { [`unreadCount.${request.playerId}`]: -1, updatedAt: -1 };
    } else if (request.sortBy === 'pinned') {
      sort = { [`isPinned.${request.playerId}`]: -1, updatedAt: -1 };
    }

    // Execute query
    const totalCount = await conversations.countDocuments(query);
    const results = await conversations
      .find(query)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .toArray();

    return {
      success: true,
      conversations: results,
      totalCount,
      hasMore: offset + results.length < totalCount,
    };
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return {
      success: false,
      conversations: [],
      totalCount: 0,
      hasMore: false,
      error: error.message || 'Failed to fetch conversations',
    };
  }
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Send a direct message to another player
 * @param senderId - Sender player ID/username
 * @param request - Message request with recipient and content
 * @returns Message response with created message
 */
export async function sendDirectMessage(
  senderId: string,
  request: SendMessageRequest
): Promise<MessageResponse> {
  try {
    // Rate limit check
    const rateLimit = checkDirectMessageRateLimit(senderId);
    if (rateLimit.isBlocked) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait until ${rateLimit.resetAt.toISOString()}`,
      };
    }

    // Validate message
    const validation = await validateMessage(request);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        validationErrors: validation.errors,
      };
    }

    // Get or create conversation
    const conversation = await getOrCreateConversation(senderId, request.recipientId);

    // Create message
    const client = await clientPromise;
    const db = client.db();
    const messages = db.collection<Message>('messages');

    const message: Message = {
      _id: new ObjectId(),
      conversationId: conversation._id,
      senderId,
      recipientId: request.recipientId,
      content: validation.filteredContent || request.content,
      contentType: request.contentType || 'text',
      status: 'sent',
      createdAt: new Date(),
      metadata: validation.filteredContent !== request.content
        ? { originalContent: request.content }
        : undefined,
    };

    await messages.insertOne(message as any);

    // Update conversation
    const conversations = db.collection<Conversation>('conversations');
    await conversations.updateOne(
      { _id: conversation._id },
      {
        $set: {
          lastMessage: {
            content: message.content,
            senderId: message.senderId,
            createdAt: message.createdAt,
            status: message.status,
          },
          updatedAt: new Date(),
        },
        $inc: {
          [`unreadCount.${request.recipientId}`]: 1,
        },
      }
    );

    return {
      success: true,
      message,
      conversation,
    };
  } catch (error: any) {
    console.error('Error sending message:', error);
    return {
      success: false,
      error: error.message || 'Failed to send message',
    };
  }
}

/**
 * Get message history for a conversation
 * @param request - Request with conversation ID and pagination
 * @returns List of messages
 */
export async function getMessageHistory(
  request: GetMessagesRequest
): Promise<MessagesResponse> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const messages = db.collection<Message>('messages');

    const limit = request.limit || 50;

    // Build query
    const query: any = {
      conversationId: new ObjectId(request.conversationId),
      deletedAt: { $exists: false }, // Exclude soft-deleted messages
    };

    if (request.before) {
      query.createdAt = { $lt: new Date(request.before) };
    } else if (request.after) {
      query.createdAt = { $gt: new Date(request.after) };
    }

    // Fetch messages (sorted newest first)
    const results = await messages
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1) // Fetch one extra to check hasMore
      .toArray();

    const hasMore = results.length > limit;
    const messageList = hasMore ? results.slice(0, limit) : results;

    return {
      success: true,
      messages: messageList.reverse(), // Reverse to show oldest first
      hasMore,
      conversationId: request.conversationId,
    };
  } catch (error: any) {
    console.error('Error fetching message history:', error);
    return {
      success: false,
      messages: [],
      hasMore: false,
      conversationId: request.conversationId,
      error: error.message || 'Failed to fetch messages',
    };
  }
}

/**
 * Mark messages as read in a conversation
 * @param conversationId - Conversation ID
 * @param playerId - Player marking messages as read
 * @param messageIds - Specific message IDs to mark (optional, marks all if empty)
 * @returns Success status
 */
export async function markMessagesAsRead(
  conversationId: string,
  playerId: string,
  messageIds?: string[]
): Promise<{ success: boolean; error?: string; readCount?: number }> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const messages = db.collection<Message>('messages');
    const conversations = db.collection<Conversation>('conversations');

    // Build query
    const query: any = {
      conversationId: new ObjectId(conversationId),
      recipientId: playerId,
      status: { $ne: 'read' },
    };

    if (messageIds && messageIds.length > 0) {
      query._id = { $in: messageIds.map(id => new ObjectId(id)) };
    }

    // Mark messages as read
    const result = await messages.updateMany(query, {
      $set: {
        status: 'read',
        readAt: new Date(),
      },
    });

    // Update conversation unread count
    await conversations.updateOne(
      { _id: new ObjectId(conversationId) },
      {
        $set: {
          [`unreadCount.${playerId}`]: 0,
        },
      }
    );

    return {
      success: true,
      readCount: result.modifiedCount,
    };
  } catch (error: any) {
    console.error('Error marking messages as read:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark messages as read',
    };
  }
}

/**
 * Delete a direct message (soft delete)
 * @param messageId - Message ID to delete
 * @param playerId - Player requesting deletion
 * @returns Success status
 */
export async function deleteDirectMessage(
  messageId: string,
  playerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const messages = db.collection<Message>('messages');

    // Verify ownership
    const message = await messages.findOne({
      _id: new ObjectId(messageId),
      senderId: playerId,
    });

    if (!message) {
      return {
        success: false,
        error: 'Message not found or you do not have permission to delete it',
      };
    }

    // Soft delete
    await messages.updateOne(
      { _id: new ObjectId(messageId) },
      {
        $set: {
          deletedAt: new Date(),
          status: 'failed',
        },
      }
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting message:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete message',
    };
  }
}

/**
 * Search conversations by participant username
 * @param playerId - Current player ID
 * @param searchQuery - Search query
 * @returns Filtered conversations
 */
export async function searchConversations(
  playerId: string,
  searchQuery: string
): Promise<ConversationsResponse> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const conversations = db.collection<Conversation>('conversations');

    // Get all player's conversations
    const results = await conversations
      .find({
        participants: playerId,
      })
      .toArray();

    // Filter by search query (client-side for now)
    // TODO: Implement server-side search with player name index
    const filtered = results.filter(conv => {
      const otherParticipant = conv.participants.find(p => p !== playerId);
      return otherParticipant?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return {
      success: true,
      conversations: filtered,
      totalCount: filtered.length,
      hasMore: false,
    };
  } catch (error: any) {
    console.error('Error searching conversations:', error);
    return {
      success: false,
      conversations: [],
      totalCount: 0,
      hasMore: false,
      error: error.message || 'Failed to search conversations',
    };
  }
}

// ============================================================================
// IMPLEMENTATION NOTES
// ============================================================================

/**
 * TODO: Future enhancements
 * 
 * 1. Message editing:
 *    - Add editMessage(messageId, newContent) function
 *    - Store edit history in metadata.editHistory
 *    - Set editedAt timestamp
 * 
 * 2. Message reactions:
 *    - Add emoji reactions to messages
 *    - Store in message.metadata.reactions
 * 
 * 3. File attachments:
 *    - Support image/file uploads
 *    - Store URLs in message.metadata.attachments
 * 
 * 4. Conversation settings:
 *    - Mute notifications
 *    - Archive conversations
 *    - Pin important conversations
 * 
 * 5. Enhanced search:
 *    - Full-text search in message content
 *    - Filter by date range
 *    - Search by participant
 * 
 * 6. Delivery status updates:
 *    - Update status from 'sent' to 'delivered' when recipient comes online
 *    - Emit Socket.io events for status changes
 */
