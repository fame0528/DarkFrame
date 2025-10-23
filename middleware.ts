/**
 * 🛡️ Next.js Middleware - Protected Route Authentication
 * 
 * Created: 2025-01-17 19:35:00
 * 
 * OVERVIEW:
 * Middleware that runs before route handlers to authenticate users.
 * Protects the /game route and any sub-routes from unauthorized access.
 * Part of FID-20251017-004: Cookie-Based Authentication System.
 * 
 * Uses consolidated authMiddleware.ts for Edge-compatible cookie authentication.
 * (Edge Runtime cannot use bcrypt, so we use authMiddleware.ts instead of authService.ts)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { logger } from '@/lib/logger';

/**
 * Middleware function - runs on every request matching the config.matcher
 * 
 * Flow:
 * 1. Check if user has valid authentication cookie
 * 2. If authenticated → allow request to proceed
 * 3. If not authenticated → redirect to /login
 * 
 * @param request - Next.js request object
 * @returns NextResponse - either continue or redirect
 * 
 * @example
 * // Automatically runs for /game and /game/*
 * // No manual invocation needed
 */
export async function middleware(request: NextRequest) {
  try {
    // Attempt to get authenticated user from cookie
    const user = await getAuthenticatedUser();
    
    if (!user) {
      // No valid authentication - redirect to login
      logger.info('Unauthenticated access attempt', { path: request.nextUrl.pathname });
      
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    
    // User is authenticated - allow request to proceed
    logger.debug('Authenticated user accessing route', { 
      path: request.nextUrl.pathname, 
      username: user.username 
    });
    return NextResponse.next();
    
  } catch (error) {
    // Error during authentication check - redirect to login for safety
    logger.error('Middleware authentication error', error instanceof Error ? error : new Error(String(error)));
    
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

/**
 * Middleware Configuration
 * 
 * Specifies which routes this middleware should run on.
 * Uses matcher patterns to define protected routes.
 */
export const config = {
  matcher: [
    '/game/:path*', // Protect /game and all sub-routes
  ]
};

/**
 * IMPLEMENTATION NOTES:
 * 
 * Protected Routes:
 * - /game - Main game page
 * - /game/* - Any sub-routes under /game (if added in future)
 * 
 * Public Routes (NOT protected):
 * - / - Home page
 * - /login - Login page
 * - /register - Registration page
 * - /api/* - API routes (handle their own auth)
 * 
 * Authentication Flow:
 * 1. Middleware checks for 'darkframe_session' cookie
 * 2. Verifies JWT token signature and expiration
 * 3. If valid → user object returned, request proceeds
 * 4. If invalid/missing → redirect to /login
 * 
 * Security Features:
 * - Runs on server-side only (Next.js middleware)
 * - Uses HTTP-only cookie (not accessible via JavaScript)
 * - JWT signature verification prevents tampering
 * - Automatic expiration handling (1h or 30d)
 * - Graceful error handling with safe fallback (redirect)
 * 
 * Performance:
 * - Middleware runs BEFORE route handlers (efficient)
 * - Cookie parsing is fast (no database queries on every request)
 * - JWT verification is cryptographically fast
 * 
 * Future Enhancements:
 * - Add role-based access control (admin routes)
 * - Rate limiting for authenticated routes
 * - Session refresh logic for "Remember Me"
 * - Audit logging for access attempts
 * 
 * Related Files:
 * - /lib/authMiddleware.ts - Edge-compatible authentication functions
 * - /lib/authService.ts - Full authentication with bcrypt (API routes only)
 * - /app/api/auth/login/route.ts - Login endpoint
 * - /app/api/auth/logout/route.ts - Logout endpoint
 * - /app/game/page.tsx - Protected game page
 */
