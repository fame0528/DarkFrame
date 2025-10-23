/**
 * @file app/api/auth/session/route.ts
 * @created 2025-10-17
 * @overview Session validation endpoint - Returns username from HttpOnly cookie
 * 
 * OVERVIEW:
 * Validates the JWT session cookie server-side and returns the username.
 * This allows client-side code to check authentication status even with
 * HttpOnly cookies that JavaScript cannot read directly.
 * 
 * Used by GameContext to restore session on page load/server restart.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { logger } from '@/lib/logger';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

/**
 * GET /api/auth/session
 * 
 * Validates session cookie and returns username if valid
 * 
 * @returns {Object} { success: boolean, username?: string }
 * 
 * @example
 * // Client-side usage
 * const response = await fetch('/api/auth/session');
 * const data = await response.json();
 * if (data.success) {
 *   console.log('Logged in as:', data.username);
 * }
 */
export async function GET(request: NextRequest) {
  try {
    // Get session cookie (server-side can read HttpOnly cookies)
    const token = request.cookies.get('darkframe_session')?.value;
    
    if (!token) {
      logger.debug('No session cookie found');
      return NextResponse.json(
        { success: false, error: 'No session found' },
        { status: 401 }
      );
    }
    
    // Verify JWT token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    logger.debug('Session validated', { username: payload.username });
    
    // Return username from token payload
    return NextResponse.json({
      success: true,
      username: payload.username as string,
    });
    
  } catch (error) {
    logger.error('Session validation failed', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { success: false, error: 'Invalid or expired session' },
      { status: 401 }
    );
  }
}

// ============================================================
// IMPLEMENTATION NOTES:
// - Server-side endpoint can read HttpOnly cookies
// - Client-side JavaScript cannot read HttpOnly cookies directly
// - This endpoint bridges the gap for GameContext authentication
// - Middleware also validates the same cookie for route protection
// - Returns 401 if no cookie or invalid token
// ============================================================
