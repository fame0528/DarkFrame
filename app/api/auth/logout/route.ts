/**
 * @file app/api/auth/logout/route.ts
 * @created 2025-10-16
 * @updated 2025-01-17 - Consolidated to use authService.ts
 * @overview Logout endpoint to clear authentication cookie
 * 
 * Part of FID-20251017-004: Cookie-Based Authentication System.
 * Uses consolidated authService.ts for cookie management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/authService';
import { logger } from '@/lib/logger';
import { endSession } from '@/lib/sessionTracker';
import { logActivity } from '@/lib/activityLogger';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    // Get user before clearing cookie
    const user = await getAuthenticatedUser();
    const sessionId = request.cookies.get('sessionId')?.value;
    
    // Log logout activity
    if (user && sessionId) {
      await logActivity({
        userId: user.username,
        action: 'logout',
        sessionId,
        metadata: { result: 'success' }
      });
      
      // End session tracking
      await endSession(sessionId);
    }
    
    // Clear the authentication cookie using consolidated authService
    await clearAuthCookie();
    
    // Create response
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
    
    // Clear session cookie
    response.cookies.delete('sessionId');
    
    // Clear playerId cookie
    response.cookies.delete('playerId');
    
    logger.info('User logged out successfully', { username: user?.username });
    
    return response;
    
  } catch (error) {
    logger.error('Logout error', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { success: false, error: 'Logout failed' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
