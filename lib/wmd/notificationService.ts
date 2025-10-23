/**
 * @file lib/wmd/notificationService.ts
 * @created 2025-10-22
 * @overview WMD Notification Service - Event Broadcasting
 * 
 * OVERVIEW:
 * Creates and manages WMD notifications using the proper type structure.
 * Production notification service with complete database integration.
 * 
 * Features:
 * - Proper notification structure matching WMDNotification type
 * - Helper functions for common notification scenarios
 * - Query functions for retrieving notifications
 * 
 * Dependencies:
 * - /types/wmd for notification types
 * - MongoDB for notification persistence
 */

import { Db } from 'mongodb';
import { WMDNotification, WMDEventType, NotificationPriority, NotificationScope } from '@/types/wmd';

/**
 * Create a WMD notification
 */
export async function createWMDNotification(
  db: Db,
  eventType: WMDEventType,
  priority: NotificationPriority,
  scope: NotificationScope,
  sourceId: string,
  sourceName: string,
  title: string,
  message: string,
  details: any = {},
  targetId?: string,
  targetName?: string
): Promise<{ success: boolean; notificationId?: string }> {
  try {
    const notificationId = `wmd_notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const notification: WMDNotification = {
      notificationId,
      eventType,
      priority,
      scope,
      sourceId,
      sourceName,
      targetId,
      targetName,
      details,
      title,
      message,
      broadcastAt: new Date(),
      viewCount: 0,
      viewedBy: [],
      createdAt: new Date(),
    };
    
    const collection = db.collection('wmd_notifications');
    await collection.insertOne(notification);
    
    return { success: true, notificationId };
    
  } catch (error) {
    console.error('Error creating WMD notification:', error);
    return { success: false };
  }
}

/**
 * Quick helper: Missile launched notification
 */
export async function notifyMissileLaunch(
  db: Db,
  launcherId: string,
  launcherName: string,
  targetId: string,
  targetName: string,
  missileId: string,
  warheadType: string
): Promise<void> {
  await createWMDNotification(
    db,
    WMDEventType.MISSILE_LAUNCHED,
    NotificationPriority.CRITICAL,
    NotificationScope.GLOBAL,
    launcherId,
    launcherName,
    '🚀 Missile Launched',
    `${launcherName} has launched a ${warheadType} missile at ${targetName}!`,
    { missileId, warheadType },
    targetId,
    targetName
  );
}

/**
 * Quick helper: Research completed notification
 */
export async function notifyResearchComplete(
  db: Db,
  playerId: string,
  playerName: string,
  techId: string,
  techName: string,
  tier: number
): Promise<void> {
  await createWMDNotification(
    db,
    WMDEventType.RESEARCH_COMPLETED,
    NotificationPriority.INFO,
    NotificationScope.PERSONAL,
    playerId,
    playerName,
    '🔬 Research Complete',
    `${techName} (Tier ${tier}) research completed!`,
    { techId, techTier: tier }
  );
}

/**
 * Get notifications for display
 */
export async function getNotifications(
  db: Db,
  scope: NotificationScope,
  limit: number = 50
): Promise<WMDNotification[]> {
  try {
    const collection = db.collection('wmd_notifications');
    return await collection
      .find({ scope })
      .sort({ broadcastAt: -1 })
      .limit(limit)
      .toArray() as unknown as WMDNotification[];
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
}
