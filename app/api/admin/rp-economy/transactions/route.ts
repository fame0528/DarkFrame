/**
 * @file app/api/admin/rp-economy/transactions/route.ts
 * @created 2025-10-20
 * @overview API endpoint for RP transaction history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/authService';

/**
 * GET /api/admin/rp-economy/transactions
 * Returns filtered RP transaction history
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const adminUser = await getAuthenticatedUser();
    if (!adminUser?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || '7d';
    const source = searchParams.get('source') || 'all';
    const username = searchParams.get('username') || '';

    // Calculate date filter
    const now = new Date();
    let dateFilter: Date | null = null;
    
    if (period === '24h') {
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build query filter
    const filter: any = {};
    if (dateFilter) {
      filter.timestamp = { $gte: dateFilter };
    }
    if (source !== 'all') {
      filter.source = source;
    }
    if (username) {
      filter.username = { $regex: username, $options: 'i' };
    }

    // Query RPTransaction collection
    const rpTransactionsCollection = await getCollection('rpTransactions');
    const transactions = await rpTransactionsCollection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({ transactions });

  } catch (error) {
    console.error('Error fetching RP transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
