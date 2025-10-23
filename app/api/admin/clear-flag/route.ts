/**
 * 📅 Created: 2025-01-18
 * 🎯 OVERVIEW:
 * Clear Flag Admin Endpoint
 * 
 * POST /api/admin/clear-flag
 * - Marks a specific anti-cheat flag as resolved
 * - Requires admin notes explaining resolution
 * - Records which admin cleared the flag and when
 * - Admin-only access (rank >= 5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authService';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
  try {
    // Admin authentication check
    const user = await getAuthenticatedUser();
    if (!user || !user.rank || user.rank < 5) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { flagId, adminNotes } = body;

    // Validation
    if (!flagId) {
      return NextResponse.json(
        { success: false, error: 'Flag ID is required' },
        { status: 400 }
      );
    }

    if (!adminNotes || adminNotes.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Admin notes required (min 10 characters)' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('game');
    const flags = db.collection('playerFlags');

    // Find and update flag
    const result = await flags.findOneAndUpdate(
      { _id: new ObjectId(flagId) },
      {
        $set: {
          resolved: true,
          resolvedBy: user.username,
          resolvedAt: new Date(),
          adminNotes: adminNotes.trim()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Flag not found' },
        { status: 404 }
      );
    }

    // Log admin action
    const adminLogs = db.collection('adminLogs');
    await adminLogs.insertOne({
      adminUsername: user.username,
      action: 'CLEAR_FLAG',
      targetUsername: result.username,
      flagType: result.flagType,
      flagSeverity: result.severity,
      flagId: flagId,
      notes: adminNotes.trim(),
      timestamp: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Flag cleared successfully',
      data: {
        flagId: result._id,
        username: result.username,
        flagType: result.flagType,
        severity: result.severity,
        resolvedBy: user.username,
        resolvedAt: result.resolvedAt,
        adminNotes: result.adminNotes
      }
    });

  } catch (error) {
    console.error('Clear flag error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clear flag'
      },
      { status: 500 }
    );
  }
}

/**
 * 📝 IMPLEMENTATION NOTES:
 * - Marks flag as resolved, not deleted (maintains history)
 * - Requires meaningful admin notes for accountability
 * - Logs all admin actions in adminLogs collection
 * - Returns updated flag data for UI refresh
 * 
 * 🔐 SECURITY:
 * - Admin-only access (rank >= 5)
 * - Validates flag ID and notes
 * - Audit trail via admin logs
 * 
 * 📊 REQUEST BODY:
 * {
 *   flagId: string,
 *   adminNotes: string (min 10 characters)
 * }
 * 
 * 🚀 FUTURE ENHANCEMENTS:
 * - Bulk flag clearing for same issue
 * - Flag reinstatement if player reoffends
 * - Automatic notifications to player
 * - Admin action history view
 */
