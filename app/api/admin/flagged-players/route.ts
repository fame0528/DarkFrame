/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Flagged Players Admin Endpoint
 * 
 * GET /api/admin/flagged-players
 * - Returns all players with active anti-cheat flags
 * - Supports filtering by flag type and severity
 * - Admin-only access (rank >= 5)
 * - Includes flag details, evidence, and occurrence counts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const flagType = searchParams.get('flagType');
    const severity = searchParams.get('severity');
    const resolved = searchParams.get('resolved') === 'true';

    const client = await clientPromise;
    const db = client.db('game');
    const flags = db.collection('playerFlags');

    // Build query
    const query: any = {};
    if (flagType) query.flagType = flagType;
    if (severity) query.severity = severity;
    query.resolved = resolved;

    // Get all flagged players with aggregated stats
    const flaggedPlayers = await flags.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$username',
          username: { $first: '$username' },
          totalFlags: { $sum: 1 },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] }
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] }
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] }
          },
          flags: { $push: '$$ROOT' },
          latestFlagDate: { $max: '$createdAt' },
          oldestFlagDate: { $min: '$createdAt' }
        }
      },
      {
        $sort: {
          criticalCount: -1,
          highCount: -1,
          mediumCount: -1,
          totalFlags: -1
        }
      }
    ]).toArray();

    // Get player details for each flagged player
    const players = db.collection('players');
    const enrichedData = await Promise.all(
      flaggedPlayers.map(async (fp: any) => {
        const player = await players.findOne({ username: fp.username });
        return {
          username: fp.username,
          totalFlags: fp.totalFlags,
          severityCounts: {
            critical: fp.criticalCount,
            high: fp.highCount,
            medium: fp.mediumCount,
            low: fp.lowCount
          },
          flags: fp.flags.map((flag: any) => ({
            id: flag._id,
            flagType: flag.flagType,
            severity: flag.severity,
            description: flag.description,
            evidence: flag.evidence,
            metadata: flag.metadata,
            occurrenceCount: flag.occurrenceCount || 1,
            createdAt: flag.createdAt,
            resolved: flag.resolved,
            resolvedBy: flag.resolvedBy,
            resolvedAt: flag.resolvedAt
          })),
          latestFlagDate: fp.latestFlagDate,
          oldestFlagDate: fp.oldestFlagDate,
          playerInfo: player ? {
            tier: player.tier,
            rank: player.rank,
            resources: player.resources,
            createdAt: player.createdAt,
            lastActive: player.lastActive
          } : null
        };
      })
    );

    // Calculate summary statistics
    const stats = {
      totalFlaggedPlayers: flaggedPlayers.length,
      totalFlags: flaggedPlayers.reduce((sum: number, p: any) => sum + p.totalFlags, 0),
      criticalPlayers: flaggedPlayers.filter((p: any) => p.criticalCount > 0).length,
      highPlayers: flaggedPlayers.filter((p: any) => p.highCount > 0).length,
      mediumPlayers: flaggedPlayers.filter((p: any) => p.mediumCount > 0).length,
      lowPlayers: flaggedPlayers.filter((p: any) => p.lowCount > 0).length
    };

    return NextResponse.json({
      success: true,
      data: enrichedData,
      stats,
      filters: {
        flagType: flagType || 'all',
        severity: severity || 'all',
        resolved
      }
    });

  } catch (error) {
    console.error('Flagged players fetch error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch flagged players'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Aggregates all flags per player for comprehensive view
 * - Enriches data with current player stats
 * - Supports filtering by flag type, severity, and resolution status
 * - Returns summary statistics for admin dashboard
 * - Sorted by severity (CRITICAL first) then flag count
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - No sensitive data exposure
 * - Read-only operation
 * 
 * 📊 RESPONSE STRUCTURE:
 * {
 *   success: true,
 *   data: [{ username, flags, severityCounts, playerInfo }],
 *   stats: { totalFlaggedPlayers, totalFlags, criticalPlayers, ... }
 * }
 */
