/**
 * @file app/api/admin/rp-economy/bulk-adjust/route.ts
 * @created 2025-10-20
 * @overview API endpoint for bulk RP adjustments
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import { awardRP, spendRP } from '@/lib/researchPointService';

/**
 * POST /api/admin/rp-economy/bulk-adjust
 * Bulk adjust player RP balance (add or remove)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { username, amount, reason, adminUsername } = body;

    if (!username || amount === 0 || !reason) {
      return NextResponse.json({ error: 'Username, amount, and reason required' }, { status: 400 });
    }

    let result;
    
    if (amount > 0) {
      // Add RP
      result = await awardRP(
        username,
        amount,
        'admin',
        `${reason} (by ${adminUsername || adminUser.username})`,
        { adminUser: adminUsername || adminUser.username }
      );
    } else {
      // Remove RP
      result = await spendRP(
        username,
        Math.abs(amount),
        `${reason} (by ${adminUsername || adminUser.username})`
      );
    }

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
      message: `Successfully adjusted ${username}'s RP by ${amount}`
    });

  } catch (error) {
    console.error('Error adjusting RP:', error);
    return NextResponse.json({ error: 'Failed to adjust RP' }, { status: 500 });
  }
}
