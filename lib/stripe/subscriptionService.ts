/**
 * Subscription Service - VIP Lifecycle Management
 * 
 * OVERVIEW:
 * Handles the complete lifecycle of VIP subscriptions in DarkFrame including
 * granting VIP status on payment, automatic renewal tracking, and revocation
 * on cancellation. Bridges Stripe payment events with internal VIP system.
 * 
 * KEY RESPONSIBILITIES:
 * - Grant VIP status when checkout session completes
 * - Calculate expiration dates based on subscription tier
 * - Handle subscription updates (upgrades, downgrades)
 * - Revoke VIP status on cancellation
 * - Track payment transactions for audit and analytics
 * - Update user records with Stripe customer IDs
 * 
 * BUSINESS LOGIC:
 * - VIP granted immediately on successful payment
 * - Expiration calculated from subscription interval (week/month/year)
 * - Renewals extend expiration date automatically
 * - Cancellation revokes VIP immediately (no refund period)
 * - Failed payments trigger notification but don't revoke immediately
 * 
 * SECURITY:
 * - All database operations require user validation
 * - Stripe customer IDs stored for subscription management
 * - Payment amounts logged for fraud detection
 * - Transaction history maintained for auditing
 * 
 * DEPENDENCIES:
 * - lib/db/connection (MongoDB connection)
 * - types/stripe.types (VIP tiers and payment types)
 * - types/database.types (User and PaymentTransaction schemas)
 * 
 * Created: 2025-10-24
 * Feature: FID-20251024-STRIPE
 * Author: ECHO v5.1
 */

import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb';
import { 
  VIPTier, 
  getVIPDurationDays,
  PaymentTransaction,
  VIP_PRICING,
} from '@/types/stripe.types';

/**
 * Grant VIP Status
 * 
 * Grants VIP status to a user after successful payment. Updates user record
 * with VIP expiration date and Stripe customer ID for future management.
 * Idempotent - safe to call multiple times for same transaction.
 * 
 * @param {object} params - VIP grant parameters
 * @param {string} params.userId - MongoDB User ID to grant VIP
 * @param {VIPTier} params.tier - VIP tier purchased
 * @param {string} params.stripeCustomerId - Stripe Customer ID for portal access
 * @param {string} params.stripeSubscriptionId - Stripe Subscription ID for tracking
 * @returns {Promise<boolean>} True if VIP granted successfully
 * 
 * @throws {Error} If database operation fails
 * 
 * @example
 * const success = await grantVIP({
 *   userId: '507f1f77bcf86cd799439011',
 *   tier: VIPTier.MONTHLY,
 *   stripeCustomerId: 'cus_1234abcd',
 *   stripeSubscriptionId: 'sub_5678efgh'
 * });
 */
export async function grantVIP(params: {
  userId: string;
  tier: VIPTier;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}): Promise<boolean> {
  try {
    const db = await getDatabase();
    const playersCollection = db.collection('players'); // Changed from 'users' to 'players'
    
    console.log('Attempting to grant VIP:', {
      userId: params.userId,
      tier: params.tier,
      stripeCustomerId: params.stripeCustomerId
    });
    
    // Calculate VIP expiration date
    const durationDays = getVIPDurationDays(params.tier);
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + durationDays);
    
    // Try to find the player first
    const player = await playersCollection.findOne({ _id: new ObjectId(params.userId) });
    
    if (!player) {
      console.error('Player not found for VIP grant:', {
        userId: params.userId,
        collectionName: 'players'
      });
      
      // Try alternative query by username if we have it
      const playerByUsername = await playersCollection.findOne({ username: { $exists: true } });
      console.log('Sample player document structure:', playerByUsername ? Object.keys(playerByUsername) : 'No players found');
      
      return false;
    }
    
    console.log('Player found, updating VIP status:', {
      playerId: player._id.toString(),
      currentVIP: player.vip || false
    });
    
    // Update player record with VIP status
    const result = await playersCollection.updateOne(
      { _id: new ObjectId(params.userId) },
      {
        $set: {
          vip: true,
          vipExpiration: expirationDate,
          vipTier: params.tier,
          stripeCustomerId: params.stripeCustomerId,
          stripeSubscriptionId: params.stripeSubscriptionId,
          vipLastUpdated: new Date(),
        },
      }
    );
    
    console.log('VIP grant update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    });
    
    if (result.matchedCount === 0) {
      console.error('Player not matched in update query');
      return false;
    }
    
    console.log('VIP granted successfully:', {
      userId: params.userId,
      tier: params.tier,
      expirationDate,
    });
    
    return true;
  } catch (error) {
    console.error('Failed to grant VIP:', error);
    return false;
  }
}

/**
 * Revoke VIP Status
 * 
 * Revokes VIP status from a user. Called when subscription is cancelled
 * or payment fails. Maintains Stripe customer ID for potential re-subscription.
 * 
 * @param {string} userId - MongoDB User ID to revoke VIP
 * @returns {Promise<boolean>} True if VIP revoked successfully
 * 
 * @throws {Error} If database operation fails
 * 
 * @example
 * const success = await revokeVIP('507f1f77bcf86cd799439011');
 * if (success) {
 *   console.log('VIP access removed');
 * }
 */
export async function revokeVIP(userId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const playersCollection = db.collection('players'); // Changed from 'users' to 'players'
    
    const result = await playersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          vip: false,
          vipExpiration: null,
          vipTier: null,
          vipLastUpdated: new Date(),
        },
        // Keep stripeCustomerId and stripeSubscriptionId for historical reference
      }
    );
    
    if (result.matchedCount === 0) {
      console.error('Player not found for VIP revocation:', userId);
      return false;
    }
    
    console.log('VIP revoked successfully:', userId);
    return true;
  } catch (error) {
    console.error('Failed to revoke VIP:', error);
    return false;
  }
}

/**
 * Extend VIP Subscription
 * 
 * Extends existing VIP subscription when renewal payment succeeds.
 * Adds additional time to current expiration date (doesn't reset from today).
 * 
 * @param {object} params - Extension parameters
 * @param {string} params.userId - MongoDB User ID to extend
 * @param {VIPTier} params.tier - VIP tier being renewed
 * @returns {Promise<boolean>} True if extension successful
 * 
 * @example
 * const success = await extendVIP({
 *   userId: '507f1f77bcf86cd799439011',
 *   tier: VIPTier.MONTHLY
 * });
 */
export async function extendVIP(params: {
  userId: string;
  tier: VIPTier;
}): Promise<boolean> {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('users');
    
    // Get current user to check existing expiration
    const user = await usersCollection.findOne({ _id: new ObjectId(params.userId) });
    
    if (!user) {
      console.error('User not found for VIP extension:', params.userId);
      return false;
    }
    
    // Calculate new expiration from current expiration (or now if expired)
    const currentExpiration = user.vipExpiration || new Date();
    const baseDate = currentExpiration > new Date() ? currentExpiration : new Date();
    
    const durationDays = getVIPDurationDays(params.tier);
    const newExpiration = new Date(baseDate);
    newExpiration.setDate(newExpiration.getDate() + durationDays);
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(params.userId) },
      {
        $set: {
          vip: true,
          vipExpiration: newExpiration,
          vipTier: params.tier,
          vipLastUpdated: new Date(),
        },
      }
    );
    
    console.log('VIP extended successfully:', {
      userId: params.userId,
      tier: params.tier,
      newExpiration,
    });
    
    return result.modifiedCount > 0;
  } catch (error) {
    console.error('Failed to extend VIP:', error);
    return false;
  }
}

/**
 * Record Payment Transaction
 * 
 * Creates a payment transaction record for auditing and analytics.
 * Stores all payment details including amount, status, and Stripe IDs.
 * 
 * @param {object} transaction - Transaction details
 * @param {string} transaction.userId - User who made payment
 * @param {string} transaction.username - Username for display
 * @param {string} transaction.stripeCustomerId - Stripe Customer ID
 * @param {string} transaction.stripeSessionId - Checkout Session ID
 * @param {string} transaction.stripeSubscriptionId - Subscription ID
 * @param {number} transaction.amount - Payment amount in USD cents
 * @param {VIPTier} transaction.tier - VIP tier purchased
 * @param {string} transaction.status - Payment status (completed, failed, refunded)
 * @returns {Promise<string | null>} Transaction ID or null if failed
 * 
 * @example
 * const txnId = await recordPaymentTransaction({
 *   userId: '507f1f77bcf86cd799439011',
 *   username: 'player123',
 *   stripeCustomerId: 'cus_1234abcd',
 *   stripeSessionId: 'cs_test_5678',
 *   stripeSubscriptionId: 'sub_9012',
 *   amount: 1499,
 *   tier: VIPTier.MONTHLY,
 *   status: 'completed'
 * });
 */
export async function recordPaymentTransaction(transaction: {
  userId: string;
  username: string;
  stripeCustomerId: string;
  stripeSessionId: string;
  stripeSubscriptionId: string;
  amount: number;
  tier: VIPTier;
  status: 'completed' | 'failed' | 'refunded';
}): Promise<string | null> {
  try {
    const db = await getDatabase();
    const transactionsCollection = db.collection('paymentTransactions');
    
    const paymentTransaction: Omit<PaymentTransaction, '_id'> = {
      userId: transaction.userId,
      username: transaction.username,
      stripeCustomerId: transaction.stripeCustomerId,
      stripeSessionId: transaction.stripeSessionId,
      stripeSubscriptionId: transaction.stripeSubscriptionId,
      stripePriceId: VIP_PRICING[transaction.tier].stripePriceId,
      amount: transaction.amount,
      tier: transaction.tier,
      status: transaction.status,
      createdAt: new Date(),
      completedAt: transaction.status === 'completed' ? new Date() : undefined,
      refundedAt: transaction.status === 'refunded' ? new Date() : undefined,
    };
    
    const result = await transactionsCollection.insertOne(paymentTransaction);
    
    console.log('Payment transaction recorded:', {
      transactionId: result.insertedId,
      userId: transaction.userId,
      amount: transaction.amount,
      status: transaction.status,
    });
    
    return result.insertedId.toString();
  } catch (error) {
    console.error('Failed to record payment transaction:', error);
    return null;
  }
}

/**
 * Get User Payment History
 * 
 * Retrieves all payment transactions for a specific user.
 * Used for admin dashboard and user billing history display.
 * 
 * @param {string} userId - User ID to get payment history for
 * @param {number} [limit=50] - Maximum number of transactions to return
 * @returns {Promise<PaymentTransaction[]>} Array of payment transactions
 * 
 * @example
 * const history = await getUserPaymentHistory('507f1f77bcf86cd799439011', 10);
 * console.log(`User has ${history.length} transactions`);
 */
export async function getUserPaymentHistory(
  userId: string,
  limit: number = 50
): Promise<PaymentTransaction[]> {
  try {
    const db = await getDatabase();
    const transactionsCollection = db.collection<PaymentTransaction>('paymentTransactions');
    
    const transactions = await transactionsCollection
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    
    return transactions;
  } catch (error) {
    console.error('Failed to get user payment history:', error);
    return [];
  }
}

/**
 * Get User by Stripe Customer ID
 * 
 * Retrieves user record using Stripe Customer ID. Used in webhook
 * processing when we only have Stripe data and need to find the user.
 * 
 * @param {string} stripeCustomerId - Stripe Customer ID
 * @returns {Promise<{_id: ObjectId, username: string} | null>} User object or null
 * 
 * @example
 * const user = await getUserByStripeCustomerId('cus_1234abcd');
 * if (user) {
 *   await grantVIP({ userId: user._id.toString(), ... });
 * }
 */
export async function getUserByStripeCustomerId(
  stripeCustomerId: string
): Promise<{ _id: ObjectId; username: string; email: string } | null> {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne(
      { stripeCustomerId },
      { projection: { _id: 1, username: 1, email: 1 } }
    );
    
    return user as { _id: ObjectId; username: string; email: string } | null;
  } catch (error) {
    console.error('Failed to get user by Stripe customer ID:', error);
    return null;
  }
}

/**
 * Check VIP Status
 * 
 * Checks if user currently has active VIP status. Validates expiration
 * date and automatically revokes if expired.
 * 
 * @param {string} userId - User ID to check
 * @returns {Promise<{isVIP: boolean, tier?: VIPTier, expiresAt?: Date}>} VIP status
 * 
 * @example
 * const status = await checkVIPStatus('507f1f77bcf86cd799439011');
 * if (status.isVIP) {
 *   console.log(`VIP ${status.tier} expires ${status.expiresAt}`);
 * }
 */
export async function checkVIPStatus(
  userId: string
): Promise<{ isVIP: boolean; tier?: VIPTier; expiresAt?: Date }> {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { vip: 1, vipExpiration: 1, vipTier: 1 } }
    );
    
    if (!user || !user.vip) {
      return { isVIP: false };
    }
    
    // Check if VIP expired
    if (user.vipExpiration && user.vipExpiration < new Date()) {
      // Auto-revoke expired VIP
      await revokeVIP(userId);
      return { isVIP: false };
    }
    
    return {
      isVIP: true,
      tier: user.vipTier,
      expiresAt: user.vipExpiration,
    };
  } catch (error) {
    console.error('Failed to check VIP status:', error);
    return { isVIP: false };
  }
}

/* ============================================================================
 * IMPLEMENTATION NOTES
 * ============================================================================
 * 
 * BUSINESS LOGIC:
 * - VIP granted immediately on payment success (no delay)
 * - Expiration calculated from subscription interval (7, 30, 365 days)
 * - Renewals extend from current expiration (not from today)
 * - Cancellation revokes VIP immediately (could add grace period in future)
 * - Auto-revoke on expiration check (cleanup for missed webhooks)
 * 
 * DATABASE SCHEMA:
 * users collection:
 *   - vip: boolean (VIP status flag)
 *   - vipExpiration: Date (when VIP expires)
 *   - vipTier: VIPTier enum (subscription tier)
 *   - stripeCustomerId: string (for portal access)
 *   - stripeSubscriptionId: string (for management)
 *   - vipLastUpdated: Date (audit trail)
 * 
 * paymentTransactions collection:
 *   - userId: ObjectId (user who paid)
 *   - username: string (display name)
 *   - stripeCustomerId: string (Stripe customer)
 *   - stripeSessionId: string (checkout session)
 *   - stripeSubscriptionId: string (subscription)
 *   - amount: number (USD cents)
 *   - tier: VIPTier (subscription tier)
 *   - status: string (completed, failed, refunded)
 *   - createdAt: Date (transaction start)
 *   - completedAt?: Date (payment success)
 *   - refundedAt?: Date (refund processed)
 * 
 * ERROR HANDLING:
 * - All functions return boolean success flags
 * - Errors logged to console for debugging
 * - Database operations wrapped in try-catch
 * - Idempotent operations safe to retry
 * 
 * TESTING:
 * - Test with Stripe test mode subscriptions
 * - Verify expiration date calculations
 * - Test renewal extension logic
 * - Verify auto-revoke on expiration
 * - Test transaction history retrieval
 * 
 * FUTURE ENHANCEMENTS:
 * - Add grace period before revocation (3 days)
 * - Implement prorated upgrades/downgrades
 * - Add email notifications for renewals/cancellations
 * - Implement refund processing workflow
 * - Add promotional VIP grants (manual admin action)
 * - Track VIP usage metrics (revenue per user)
 */
