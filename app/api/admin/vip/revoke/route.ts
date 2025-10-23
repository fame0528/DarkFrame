/**
 * @file app/api/admin/vip/revoke/route.ts
 * @created 2025-10-19
 * @overview Admin API - Revoke VIP status from user
 */

import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    // Validate input
    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    // TODO: Add admin authentication check
    // const adminUsername = request.headers.get('x-admin-username');
    // if (!await isAdmin(adminUsername)) {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    // }

    const playersCollection = await getCollection('players');
    
    // Find the user
    const user = await playersCollection.findOne({ username });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Remove VIP status
    const result = await playersCollection.updateOne(
      { username },
      {
        $set: {
          isVIP: false
        },
        $unset: {
          vipExpiresAt: ''
        }
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to revoke VIP' },
        { status: 500 }
      );
    }

    // TODO: Log VIP revoke in analytics
    // await logVIPRevoke({ username, revokedBy: adminUsername, revokedAt: new Date() });

    console.log(`❌ VIP revoked from ${username}`);

    return NextResponse.json({
      success: true,
      message: `VIP revoked from ${username}`
    });

  } catch (error) {
    console.error('Error revoking VIP:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}
