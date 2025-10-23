/**
 * @file app/api/wmd/status/route.ts
 * @created 2025-10-22
 * @overview WMD Status Summary API
 * 
 * OVERVIEW:
 * Provides summary status for WMDMiniStatus widget.
 * Returns key metrics: RP, missiles ready, batteries active, spies available, pending votes.
 * 
 * Endpoint: GET /api/wmd/status
 * 
 * Response:
 * {
 *   success: true,
 *   status: {
 *     rp: number,
 *     missilesReady: number,
 *     batteriesActive: number,
 *     spiesAvailable: number,
 *     pendingVotes: number,
 *     hasAlerts: boolean
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase, getAuthenticatedPlayer } from '@/lib/wmd/apiHelpers';

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const auth = await getAuthenticatedPlayer(req, db);

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const playerId = auth.playerId;

    // Query all collections in parallel for performance
    const [research, missiles, batteries, spies, votes, notifications] = await Promise.all([
      db.collection('wmd_research').findOne({ playerId }),
      db.collection('wmd_missiles').find({ ownerId: playerId }).toArray(),
      db.collection('wmd_batteries').find({ playerId }).toArray(),
      db.collection('wmd_spies').find({ playerId }).toArray(),
      auth.player?.clanId 
        ? db.collection('wmd_votes').find({ clanId: auth.player.clanId, status: 'ACTIVE' }).toArray()
        : Promise.resolve([]),
      db.collection('wmd_notifications').find({ playerId, status: 'UNREAD' }).limit(10).toArray(),
    ]);

    // Calculate stats
    const rp = research?.currentRP || 0;
    const missilesReady = missiles.filter((m: any) => m.status === 'READY').length;
    const batteriesActive = batteries.filter((b: any) => 
      b.status === 'IDLE' || b.status === 'ACTIVE'
    ).length;
    const spiesAvailable = spies.filter((s: any) => s.status === 'AVAILABLE').length;
    const pendingVotes = votes.length;
    const hasAlerts = notifications.some((n: any) => 
      n.priority === 'ALERT' || n.priority === 'CRITICAL'
    );

    return NextResponse.json({
      success: true,
      status: {
        rp,
        missilesReady,
        batteriesActive,
        spiesAvailable,
        pendingVotes,
        hasAlerts,
      },
    });
  } catch (error) {
    console.error('Error fetching WMD status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch WMD status' },
      { status: 500 }
    );
  }
}

