/**
 * @file app/api/admin/vip/list/route.ts
 * @created 2025-10-19
 * @overview Admin API - List all users with VIP status
 */

import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    // TODO: Add admin authentication check
    // const { searchParams } = new URL(request.url);
    // const adminUsername = searchParams.get('admin');
    // if (!await isAdmin(adminUsername)) {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    // }

    const playersCollection = await getCollection('players');
    
    // Fetch all users with relevant fields
    const users = await playersCollection
      .find({})
      .project({
        username: 1,
        email: 1,
        isVIP: 1,
        vipExpiresAt: 1,
        createdAt: 1
      })
      .sort({ username: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      users: users.map(user => ({
        username: user.username,
        email: user.email,
        isVIP: user.isVIP || false,
        vipExpiresAt: user.vipExpiresAt || null,
        createdAt: user.createdAt || null
      }))
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}
