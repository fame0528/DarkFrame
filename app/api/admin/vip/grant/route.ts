/**
 * @file app/api/admin/vip/grant/route.ts
 * @created 2025-10-19
 * @overview Admin API - Grant VIP status to user
 */

import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    const { username, days } = await request.json();

    // Validate input
    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      );
    }

    if (!days || typeof days !== 'number' || days <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid number of days is required' },
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

    // Calculate expiration date
    const now = Date.now();
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const expirationTime = now + (days * millisecondsPerDay);

    // Update user with VIP status
    const result = await playersCollection.updateOne(
      { username },
      {
        $set: {
          isVIP: true,
          vipExpiresAt: new Date(expirationTime)
        }
      }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to grant VIP' },
        { status: 500 }
      );
    }

    // TODO: Log VIP grant in analytics
    // await logVIPGrant({ username, days, grantedBy: adminUsername, grantedAt: new Date() });

    console.log(`✅ VIP granted to ${username} for ${days} days (expires: ${new Date(expirationTime).toISOString()})`);

    return NextResponse.json({
      success: true,
      message: `VIP granted to ${username} for ${days} days`,
      expiresAt: new Date(expirationTime).toISOString()
    });

  } catch (error) {
    console.error('Error granting VIP:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}
