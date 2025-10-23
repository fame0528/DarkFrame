/**
 * @file app/api/auth/login/route.ts
 * @created 2025-10-16
 * @overview Login endpoint with JWT authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlayerByEmail } from '@/lib/playerService';
import { getTileAt } from '@/lib/movementService';
import { verifyPassword, generateToken, setAuthCookie, isValidEmail } from '@/lib/authService';
import { logger } from '@/lib/logger';
import { startSession } from '@/lib/sessionTracker';
import { logActivity } from '@/lib/activityLogger';

export async function POST(request: NextRequest) {
  try {
    const { email, password, rememberMe } = await request.json();
    
    // Validate inputs
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }
    
    // Get player by email
    const player = await getPlayerByEmail(email);
    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    // Verify password
    const passwordValid = await verifyPassword(password, player.password);
    if (!passwordValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    
    // Generate JWT token with isAdmin flag
    const token = generateToken(player.username, player.email, rememberMe || false, player.isAdmin || false);
    
    // Set HTTP-only cookie
    await setAuthCookie(token, rememberMe || false);
    
    // Start session tracking
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const sessionId = await startSession(player.username, clientIp);
    
    // Log login activity
    await logActivity({
      userId: player.username,
      action: 'login',
      sessionId,
      metadata: { result: 'success' }
    });
    
    // Get current tile
    const currentTile = await getTileAt(
      player.currentPosition.x,
      player.currentPosition.y
    );
    
    // Remove password from response
    const { password: _, ...playerWithoutPassword } = player;
    
    logger.success('Login successful', { 
      username: player.username, 
      rememberMe: rememberMe || false 
    });
    
    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      data: {
        player: playerWithoutPassword,
        currentTile
      }
    });

    // Update lastActive timestamp on login
    try {
      const { getCollection } = await import('@/lib/mongodb');
      const playersCollection = await getCollection('players');
      await playersCollection.updateOne({ username: player.username }, { $set: { lastActive: new Date() } });
    } catch (err) {
      console.debug('Failed to update lastActive on login:', String(err));
    }
    
    // Set session ID cookie for activity tracking
    response.cookies.set('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // 30 days or 24 hours
    });
    
    // Set playerId cookie for inventory and other endpoints
    response.cookies.set('playerId', player.username, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // 30 days or 24 hours
    });
    
    return response;
    
  } catch (error) {
    logger.error('Login error', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// END OF FILE
// ============================================================
