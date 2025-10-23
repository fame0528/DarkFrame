/**
 * 🛡️ Edge-Compatible Authentication Utilities for Middleware
 * 
 * Created: 2025-01-17 20:00:00
 * Updated: 2025-10-17 (FID-20251017-005: Migrated to jose for Edge Runtime)
 * 
 * OVERVIEW:
 * Edge Runtime-compatible authentication functions for Next.js middleware.
 * Uses jose library (pure JS, Edge-compatible) instead of jsonwebtoken.
 * Does NOT import bcrypt (Node.js native module incompatible with Edge).
 * Only handles JWT verification and cookie parsing.
 * 
 * Related: /lib/authService.ts (full auth with bcrypt for API routes)
 */

import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'darkframe-secret-change-in-production';
const COOKIE_NAME = 'darkframe_session';

export interface TokenPayload {
  username: string;
  email: string;
  rank?: number;
  isAdmin?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Get authentication cookie value
 * Edge-compatible cookie retrieval
 * 
 * @returns Cookie value or null if not found
 */
export async function getAuthCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  return cookie?.value || null;
}

/**
 * Verify JWT token and return payload
 * Edge-compatible JWT verification using jose library
 * 
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    // Convert JWT_SECRET to Uint8Array for jose
    const secret = new TextEncoder().encode(JWT_SECRET);
    
    // Verify JWT using jose (Edge Runtime compatible)
    const { payload } = await jwtVerify(token, secret);
    
    // Type assertion: jose returns JWTPayload, we know it's TokenPayload
    return payload as unknown as TokenPayload;
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return null;
  }
}

/**
 * Get authenticated user from cookie
 * Edge-compatible user authentication check
 * 
 * @returns User payload or null if not authenticated
 * 
 * @example
 * const user = await getAuthenticatedUser();
 * if (!user) {
 *   return NextResponse.redirect('/login');
 * }
 */
export async function getAuthenticatedUser(): Promise<TokenPayload | null> {
  try {
    const token = await getAuthCookie();
    
    if (!token) {
      return null;
    }
    
    // verifyToken is now async (jose requirement)
    const payload = await verifyToken(token);
    return payload;
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return null;
  }
}

/**
 * Verify authentication (alias for getAuthenticatedUser)
 * Provided for backward compatibility with existing API routes
 */
export const verifyAuth = getAuthenticatedUser;

/**
 * IMPLEMENTATION NOTES:
 * 
 * Edge Runtime Compatibility:
 * - NO bcrypt imports (native Node.js module)
 * - NO jsonwebtoken imports (has native dependencies via node-gyp-build)
 * - NO fs/path imports (file system not available in Edge)
 * - Uses Next.js cookies() API (Edge-compatible)
 * - Uses jose library (pure JavaScript, fully Edge-compatible)
 * 
 * Why jose Instead of jsonwebtoken?
 * - jsonwebtoken has native module dependencies (node-gyp-build → bcrypt chain)
 * - jose is built specifically for Edge Runtime and Web Crypto API
 * - jose is async-first, more secure, and follows modern standards
 * - jose is the recommended JWT library for Next.js middleware
 * 
 * Why Separate File?
      return payload; // Return the payload after updating lastActive
 * - authService.ts uses jsonwebtoken for token generation (Node.js runtime)
 * - Middleware runs in Edge Runtime (no native modules allowed)
 * - This file provides Edge-compatible subset of auth functions
 * - Both files use same JWT_SECRET for consistency
 * 
 * Security:
 * - JWT signature verification prevents tampering
 * - Same JWT_SECRET as authService.ts ensures token compatibility
 * - Automatic expiration handling via JWT exp claim
 * - HTTP-only cookie not accessible via client JavaScript
 * - jose provides more robust crypto than jsonwebtoken
 * 
 * Migration Notes (FID-20251017-005):
 * - Migrated from jsonwebtoken to jose on 2025-10-17
 * - Reason: Edge Runtime incompatibility with native modules
 * - verifyToken() changed from sync to async (jose requirement)
 * - No breaking changes to middleware.ts (already async)
 * 
 * Related Files:
 * - /lib/authService.ts - Full auth with bcrypt (API routes)
 * - /middleware.ts - Protected route authentication (uses this file)
 * - /app/api/auth/login/route.ts - Login endpoint (uses authService.ts)
 * - /app/api/auth/logout/route.ts - Logout endpoint (uses authService.ts)
 */
