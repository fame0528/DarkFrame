/**
 * WMD Alert Service
 * Created: 2025-10-22
 * 
 * OVERVIEW:
 * Comprehensive alert and notification system for critical WMD events.
 * Monitors missile launches, vote completions, cooldown expirations, and suspicious activity.
 * Delivers notifications through multiple channels: in-game, admin dashboard, and email.
 * 
 * KEY FEATURES:
 * - Real-time event detection and alert creation
 * - Multi-channel notification delivery (in-game, email, dashboard)
 * - Alert severity levels (INFO, WARNING, CRITICAL)
 * - Alert acknowledgment and resolution tracking
 * - Configurable alert thresholds and rules
 * - Alert history and audit trail
 * 
 * ALERT TYPES:
 * - MISSILE_LAUNCH: When a clan launches a WMD missile
 * - MISSILE_IMPACT: When a missile hits its target
 * - MISSILE_INTERCEPTED: When a missile is intercepted by defenses
 * - VOTE_PASSED: When a clan vote succeeds
 * - VOTE_FAILED: When a clan vote fails
 * - COOLDOWN_EXPIRED: When a clan's WMD cooldown expires
 * - SUSPICIOUS_ACTIVITY: Flagged by admin or auto-detected
 * - SYSTEM_ERROR: Critical WMD system errors
 * 
 * NOTIFICATION CHANNELS:
 * - In-Game: WebSocket broadcast to affected players
 * - Dashboard: Admin dashboard real-time updates
 * - Email: Critical alerts sent to admin email (future)
 * 
 * DEPENDENCIES:
 * - MongoDB for alert storage
 * - WebSocket for real-time notifications
 * - Email service for critical alerts (future)
 */

import { Db, ObjectId } from 'mongodb';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

/**
 * Alert types for different WMD events
 */
export enum AlertType {
  MISSILE_LAUNCH = 'MISSILE_LAUNCH',
  MISSILE_IMPACT = 'MISSILE_IMPACT',
  MISSILE_INTERCEPTED = 'MISSILE_INTERCEPTED',
  VOTE_PASSED = 'VOTE_PASSED',
  VOTE_FAILED = 'VOTE_FAILED',
  COOLDOWN_EXPIRED = 'COOLDOWN_EXPIRED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  EMERGENCY_DISARM = 'EMERGENCY_DISARM',
  VOTE_VETOED = 'VOTE_VETOED'
}

/**
 * Alert status
 */
export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
  ARCHIVED = 'ARCHIVED'
}

/**
 * Notification channel types
 */
export enum NotificationChannel {
  IN_GAME = 'IN_GAME',
  DASHBOARD = 'DASHBOARD',
  EMAIL = 'EMAIL'
}

/**
 * Alert interface
 */
export interface WMDAlert {
  _id?: ObjectId;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  
  // Context
  playerId?: ObjectId;
  playerName?: string;
  clanId?: ObjectId;
  clanName?: string;
  targetClanId?: ObjectId;
  targetClanName?: string;
  
  // Related entities
  missileId?: ObjectId;
  voteId?: ObjectId;
  operationId?: ObjectId;
  
  // Metadata
  data?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  
  // Notification tracking
  channels: NotificationChannel[];
  deliveryStatus: Record<string, { sent: boolean; sentAt?: Date; error?: string }>;
}

/**
 * Alert configuration interface
 */
export interface AlertConfig {
  enabled: boolean;
  minSeverity: AlertSeverity;
  channels: NotificationChannel[];
  autoAcknowledge: boolean;
  autoArchiveDays: number;
}

/**
 * Default alert configuration
 */
const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  minSeverity: AlertSeverity.INFO,
  channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD],
  autoAcknowledge: false,
  autoArchiveDays: 30
};

/**
 * Create a new alert
 * 
 * @param db - Database connection
 * @param alertData - Alert data
 * @returns Created alert with ID
 */
export async function createAlert(
  db: Db,
  alertData: Omit<WMDAlert, '_id' | 'createdAt' | 'status' | 'deliveryStatus'>
): Promise<WMDAlert> {
  const config = await getAlertConfig(db);
  
  // Check if alerts are enabled and severity meets threshold
  if (!config.enabled || !meetsMinSeverity(alertData.severity, config.minSeverity)) {
    throw new Error('Alert creation blocked by configuration');
  }
  
  const alert: WMDAlert = {
    ...alertData,
    status: AlertStatus.ACTIVE,
    createdAt: new Date(),
    channels: alertData.channels || config.channels,
    deliveryStatus: {}
  };
  
  // Initialize delivery status for each channel
  alert.channels.forEach(channel => {
    alert.deliveryStatus[channel] = { sent: false };
  });
  
  const result = await db.collection('wmd_alerts').insertOne(alert);
  alert._id = result.insertedId;
  
  // Attempt to deliver notifications
  await deliverAlertNotifications(db, alert);
  
  return alert;
}

/**
 * Check if alert severity meets minimum threshold
 */
function meetsMinSeverity(severity: AlertSeverity, minSeverity: AlertSeverity): boolean {
  const severityRanking = {
    [AlertSeverity.INFO]: 1,
    [AlertSeverity.WARNING]: 2,
    [AlertSeverity.CRITICAL]: 3
  };
  
  return severityRanking[severity] >= severityRanking[minSeverity];
}

/**
 * Deliver alert notifications through configured channels
 */
async function deliverAlertNotifications(db: Db, alert: WMDAlert): Promise<void> {
  for (const channel of alert.channels) {
    try {
      switch (channel) {
        case NotificationChannel.IN_GAME:
          await deliverInGameNotification(db, alert);
          break;
        case NotificationChannel.DASHBOARD:
          await deliverDashboardNotification(db, alert);
          break;
        case NotificationChannel.EMAIL:
          await deliverEmailNotification(db, alert);
          break;
      }
      
      // Update delivery status
      await db.collection('wmd_alerts').updateOne(
        { _id: alert._id },
        {
          $set: {
            [`deliveryStatus.${channel}`]: {
              sent: true,
              sentAt: new Date()
            }
          }
        }
      );
    } catch (error) {
      console.error(`Failed to deliver alert via ${channel}:`, error);
      
      // Record delivery failure
      await db.collection('wmd_alerts').updateOne(
        { _id: alert._id },
        {
          $set: {
            [`deliveryStatus.${channel}`]: {
              sent: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        }
      );
    }
  }
}

/**
 * Deliver in-game notification via WebSocket
 * Note: Actual WebSocket broadcasting would be handled by the WebSocket server
 */
async function deliverInGameNotification(db: Db, alert: WMDAlert): Promise<void> {
  // Store notification in player's notification queue
  const recipients: ObjectId[] = [];
  
  if (alert.playerId) {
    recipients.push(alert.playerId);
  }
  
  if (alert.clanId) {
    // Get all clan members
    const clan = await db.collection('clans').findOne({ _id: alert.clanId });
    if (clan && clan.members) {
      recipients.push(...clan.members.map((m: any) => m.playerId));
    }
  }
  
  if (alert.targetClanId) {
    // Notify target clan members
    const targetClan = await db.collection('clans').findOne({ _id: alert.targetClanId });
    if (targetClan && targetClan.members) {
      recipients.push(...targetClan.members.map((m: any) => m.playerId));
    }
  }
  
  // Remove duplicates
  const uniqueRecipients = [...new Set(recipients.map(r => r.toString()))].map(id => new ObjectId(id));
  
  // Create notification records
  const notifications = uniqueRecipients.map(playerId => ({
    playerId,
    type: 'WMD_ALERT',
    alertId: alert._id,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    read: false,
    createdAt: new Date()
  }));
  
  if (notifications.length > 0) {
    await db.collection('player_notifications').insertMany(notifications);
  }
  
  // TODO: Broadcast via WebSocket to online players
  // This would be handled by the WebSocket server in production
  console.log(`[WMD Alert] In-game notification sent to ${uniqueRecipients.length} players`);
}

/**
 * Deliver dashboard notification
 */
async function deliverDashboardNotification(db: Db, alert: WMDAlert): Promise<void> {
  // Store in admin dashboard notifications collection
  await db.collection('admin_dashboard_notifications').insertOne({
    alertId: alert._id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    data: alert.data,
    read: false,
    createdAt: new Date()
  });
  
  // TODO: Broadcast via WebSocket to connected admin dashboards
  console.log(`[WMD Alert] Dashboard notification created: ${alert.title}`);
}

/**
 * Deliver email notification
 * Note: Email delivery would use an email service in production
 */
async function deliverEmailNotification(db: Db, alert: WMDAlert): Promise<void> {
  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  // For now, just log the email that would be sent
  
  const emailData = {
    to: process.env.ADMIN_EMAIL || 'admin@darkframe.com',
    subject: `[WMD Alert - ${alert.severity}] ${alert.title}`,
    body: `
      WMD System Alert
      ================
      
      Type: ${alert.type}
      Severity: ${alert.severity}
      Time: ${alert.createdAt.toISOString()}
      
      ${alert.message}
      
      ${alert.clanName ? `Clan: ${alert.clanName}` : ''}
      ${alert.playerName ? `Player: ${alert.playerName}` : ''}
      ${alert.targetClanName ? `Target: ${alert.targetClanName}` : ''}
      
      ---
      This is an automated alert from the DarkFrame WMD System.
    `
  };
  
  console.log(`[WMD Alert] Email notification queued:`, emailData);
  
  // Store in email queue for later processing
  await db.collection('email_queue').insertOne({
    ...emailData,
    alertId: alert._id,
    status: 'PENDING',
    createdAt: new Date()
  });
}

/**
 * Alert factory functions for common WMD events
 */

export async function alertMissileLaunch(
  db: Db,
  missileId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  targetClanId: ObjectId,
  targetClanName: string,
  warheadType: string,
  impactTime: Date
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.MISSILE_LAUNCH,
    severity: AlertSeverity.CRITICAL,
    title: `🚀 WMD Missile Launched!`,
    message: `Clan "${clanName}" has launched a ${warheadType} missile targeting "${targetClanName}". Impact expected at ${impactTime.toLocaleString()}.`,
    clanId,
    clanName,
    targetClanId,
    targetClanName,
    missileId,
    data: { warheadType, impactTime },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertMissileImpact(
  db: Db,
  missileId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  targetClanId: ObjectId,
  targetClanName: string,
  damage: number,
  warheadType: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.MISSILE_IMPACT,
    severity: AlertSeverity.CRITICAL,
    title: `💥 WMD Missile Impact!`,
    message: `${warheadType} missile from "${clanName}" has struck "${targetClanName}" causing ${damage.toLocaleString()} damage!`,
    clanId,
    clanName,
    targetClanId,
    targetClanName,
    missileId,
    data: { damage, warheadType },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertMissileIntercepted(
  db: Db,
  missileId: ObjectId,
  attackerClanId: ObjectId,
  attackerClanName: string,
  defenderClanId: ObjectId,
  defenderClanName: string,
  warheadType: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.MISSILE_INTERCEPTED,
    severity: AlertSeverity.WARNING,
    title: `🛡️ Missile Intercepted!`,
    message: `"${defenderClanName}" successfully intercepted a ${warheadType} missile from "${attackerClanName}"!`,
    clanId: attackerClanId,
    clanName: attackerClanName,
    targetClanId: defenderClanId,
    targetClanName: defenderClanName,
    missileId,
    data: { warheadType },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertVotePassed(
  db: Db,
  voteId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  voteType: string,
  approvalRate: number
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.VOTE_PASSED,
    severity: AlertSeverity.WARNING,
    title: `✅ WMD Vote Passed`,
    message: `Clan "${clanName}" has approved a ${voteType} operation with ${(approvalRate * 100).toFixed(1)}% approval.`,
    clanId,
    clanName,
    voteId,
    data: { voteType, approvalRate },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertVoteFailed(
  db: Db,
  voteId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  voteType: string,
  approvalRate: number
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.VOTE_FAILED,
    severity: AlertSeverity.INFO,
    title: `❌ WMD Vote Failed`,
    message: `Clan "${clanName}" failed to approve ${voteType} operation. Only ${(approvalRate * 100).toFixed(1)}% approval achieved.`,
    clanId,
    clanName,
    voteId,
    data: { voteType, approvalRate },
    channels: [NotificationChannel.DASHBOARD]
  });
}

export async function alertVoteVetoed(
  db: Db,
  voteId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  leaderName: string,
  voteType: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.VOTE_VETOED,
    severity: AlertSeverity.WARNING,
    title: `🚫 WMD Vote Vetoed`,
    message: `Clan leader ${leaderName} vetoed the ${voteType} vote in "${clanName}".`,
    clanId,
    clanName,
    voteId,
    data: { voteType, leaderName },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertCooldownExpired(
  db: Db,
  clanId: ObjectId,
  clanName: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.COOLDOWN_EXPIRED,
    severity: AlertSeverity.INFO,
    title: `⏰ WMD Cooldown Expired`,
    message: `Clan "${clanName}" can now launch WMD operations again.`,
    clanId,
    clanName,
    channels: [NotificationChannel.IN_GAME]
  });
}

export async function alertSuspiciousActivity(
  db: Db,
  activityType: string,
  playerId: ObjectId | undefined,
  playerName: string | undefined,
  clanId: ObjectId | undefined,
  clanName: string | undefined,
  details: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.SUSPICIOUS_ACTIVITY,
    severity: AlertSeverity.CRITICAL,
    title: `🚩 Suspicious WMD Activity Detected`,
    message: `${activityType}: ${details}`,
    playerId,
    playerName,
    clanId,
    clanName,
    data: { activityType, details },
    channels: [NotificationChannel.DASHBOARD]
  });
}

export async function alertEmergencyDisarm(
  db: Db,
  missileId: ObjectId,
  clanId: ObjectId,
  clanName: string,
  adminName: string,
  reason: string
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.EMERGENCY_DISARM,
    severity: AlertSeverity.CRITICAL,
    title: `🛑 Emergency Missile Disarm`,
    message: `Admin ${adminName} emergency-disarmed missile from "${clanName}". Reason: ${reason}`,
    clanId,
    clanName,
    missileId,
    data: { adminName, reason },
    channels: [NotificationChannel.IN_GAME, NotificationChannel.DASHBOARD]
  });
}

export async function alertSystemError(
  db: Db,
  errorType: string,
  errorMessage: string,
  context?: Record<string, any>
): Promise<WMDAlert> {
  return createAlert(db, {
    type: AlertType.SYSTEM_ERROR,
    severity: AlertSeverity.CRITICAL,
    title: `⚠️ WMD System Error`,
    message: `${errorType}: ${errorMessage}`,
    data: { errorType, errorMessage, context },
    channels: [NotificationChannel.DASHBOARD]
  });
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  db: Db,
  alertId: ObjectId,
  acknowledgedBy: string
): Promise<boolean> {
  const result = await db.collection('wmd_alerts').updateOne(
    { _id: alertId, status: AlertStatus.ACTIVE },
    {
      $set: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy
      }
    }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
  db: Db,
  alertId: ObjectId,
  resolvedBy: string,
  resolution?: string
): Promise<boolean> {
  const update: any = {
    status: AlertStatus.RESOLVED,
    resolvedAt: new Date(),
    resolvedBy
  };
  
  if (resolution) {
    update['data.resolution'] = resolution;
  }
  
  const result = await db.collection('wmd_alerts').updateOne(
    { _id: alertId, status: { $in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] } },
    { $set: update }
  );
  
  return result.modifiedCount > 0;
}

/**
 * Get active alerts
 */
export async function getActiveAlerts(
  db: Db,
  filters?: {
    severity?: AlertSeverity;
    type?: AlertType;
    clanId?: ObjectId;
    limit?: number;
  }
): Promise<WMDAlert[]> {
  const query: any = { status: AlertStatus.ACTIVE };
  
  if (filters?.severity) query.severity = filters.severity;
  if (filters?.type) query.type = filters.type;
  if (filters?.clanId) query.clanId = filters.clanId;
  
  return db.collection('wmd_alerts')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(filters?.limit || 50)
    .toArray() as Promise<WMDAlert[]>;
}

/**
 * Get alert history
 */
export async function getAlertHistory(
  db: Db,
  filters?: {
    startDate?: Date;
    endDate?: Date;
    severity?: AlertSeverity;
    type?: AlertType;
    clanId?: ObjectId;
    status?: AlertStatus;
    limit?: number;
  }
): Promise<WMDAlert[]> {
  const query: any = {};
  
  if (filters?.startDate || filters?.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = filters.startDate;
    if (filters.endDate) query.createdAt.$lte = filters.endDate;
  }
  
  if (filters?.severity) query.severity = filters.severity;
  if (filters?.type) query.type = filters.type;
  if (filters?.clanId) query.clanId = filters.clanId;
  if (filters?.status) query.status = filters.status;
  
  return db.collection('wmd_alerts')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(filters?.limit || 100)
    .toArray() as Promise<WMDAlert[]>;
}

/**
 * Archive old alerts
 */
export async function archiveOldAlerts(db: Db, daysOld: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await db.collection('wmd_alerts').updateMany(
    {
      status: AlertStatus.RESOLVED,
      resolvedAt: { $lte: cutoffDate }
    },
    {
      $set: { status: AlertStatus.ARCHIVED }
    }
  );
  
  return result.modifiedCount;
}

/**
 * Get alert configuration
 */
export async function getAlertConfig(db: Db): Promise<AlertConfig> {
  const config = await db.collection('wmd_config').findOne({ type: 'alerts' });
  return config?.settings || DEFAULT_CONFIG;
}

/**
 * Update alert configuration
 */
export async function updateAlertConfig(
  db: Db,
  config: Partial<AlertConfig>
): Promise<AlertConfig> {
  const currentConfig = await getAlertConfig(db);
  const newConfig = { ...currentConfig, ...config };
  
  await db.collection('wmd_config').updateOne(
    { type: 'alerts' },
    { $set: { settings: newConfig, updatedAt: new Date() } },
    { upsert: true }
  );
  
  return newConfig;
}

/**
 * Background job to clean up old alerts
 * Should be run periodically (e.g., daily)
 */
export async function cleanupAlerts(db: Db): Promise<void> {
  const config = await getAlertConfig(db);
  
  // Archive old resolved alerts
  const archivedCount = await archiveOldAlerts(db, config.autoArchiveDays);
  console.log(`[WMD Alerts] Archived ${archivedCount} old alerts`);
  
  // Delete very old archived alerts (90 days)
  const deleteDate = new Date();
  deleteDate.setDate(deleteDate.getDate() - 90);
  
  const deleteResult = await db.collection('wmd_alerts').deleteMany({
    status: AlertStatus.ARCHIVED,
    resolvedAt: { $lte: deleteDate }
  });
  
  console.log(`[WMD Alerts] Deleted ${deleteResult.deletedCount} archived alerts older than 90 days`);
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. WebSocket Integration:
 *    - In production, deliverInGameNotification() should broadcast to WebSocket server
 *    - WebSocket server maintains connection map of playerId -> socket
 *    - Real-time delivery to online players
 * 
 * 2. Email Service Integration:
 *    - Integrate with SendGrid, AWS SES, or similar service
 *    - Process email queue in background job
 *    - Handle bounces and delivery failures
 * 
 * 3. Alert Throttling:
 *    - Consider rate limiting for spam prevention
 *    - Batch similar alerts (e.g., multiple missile launches in short time)
 *    - Cooldown period for duplicate alerts
 * 
 * 4. Alert Escalation:
 *    - Auto-escalate unacknowledged critical alerts after X minutes
 *    - Send additional notifications to backup admins
 *    - Integrate with incident management system
 * 
 * 5. Performance Considerations:
 *    - Index wmd_alerts collection on: status, createdAt, clanId, type
 *    - Consider separate collections for active vs archived alerts
 *    - Implement alert aggregation for high-volume scenarios
 */
