/**
 * WebSocket Authentication Utilities
 * Created: 2025-10-19
 * 
 * OVERVIEW:
 * JWT-based authentication for Socket.io connections with dual strategy:
 * 1. Cookie-based (automatic, secure) - HTTP-only cookies from existing auth
 * 2. Token handshake (manual fallback) - For clients that can't send cookies
 * 
 * Security Features:
 * - JWT signature verification using jose library
 * - Token expiration validation
 * - User existence verification in database
 * - Rate limiting preparation hooks
 * 
 * Usage:
 * - Called during Socket.io connection handshake
 * - Attaches authenticated user data to socket instance
 * - Denies connection if authentication fails
 */

import { jwtVerify } from 'jose';
import { connectToDatabase } from '@/lib/mongodb';
import type { Socket } from 'socket.io';
import { ObjectId } from 'mongodb';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthenticatedUser {
  userId: string;
  username: string;
  level: number;
  clanId?: string;
  clanName?: string;
  role?: string;
}

export interface AuthenticationResult {
  success: boolean;
  user?: AuthenticatedUser;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
);

const JWT_COOKIE_NAME = 'auth-token';

// ============================================================================
// COOKIE PARSER
// ============================================================================

/**
 * Parses cookies from Socket.io handshake headers
 * 
 * @param cookieHeader - Raw cookie header string
 * @returns Parsed cookie object
 * 
 * @example
 * const cookies = parseCookies(socket.handshake.headers.cookie);
 * const token = cookies['auth-token'];
 */
function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }, {} as Record<string, string>);
}

// ============================================================================
// JWT VERIFICATION
// ============================================================================

/**
 * Verifies JWT token and extracts user claims
 * 
 * @param token - JWT token string
 * @returns Decoded JWT payload or null if invalid
 * 
 * @example
 * const payload = await verifyJWT(token);
 * if (payload) {
 *   console.log('User ID:', payload.userId);
 * }
 */
async function verifyJWT(token: string): Promise<{
  userId: string;
  username: string;
  iat: number;
  exp: number;
} | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    if (!payload.userId || !payload.username) {
      return null;
    }
    
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      iat: payload.iat || 0,
      exp: payload.exp || 0,
    };
  } catch (error) {
    console.error('[WebSocket Auth] JWT verification failed:', error);
    return null;
  }
}

// ============================================================================
// USER DATA FETCHING
// ============================================================================

/**
 * Fetches complete user data from database
 * 
 * @param userId - User's unique identifier
 * @returns Authenticated user object or null if not found
 * 
 * @example
 * const user = await fetchUserData('user123');
 * if (user) {
 *   console.log(`Welcome ${user.username}, Clan: ${user.clanName || 'None'}`);
 * }
 */
async function fetchUserData(userId: string): Promise<AuthenticatedUser | null> {
  try {
    const db = await connectToDatabase();
    
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { 
        projection: { 
          _id: 1, 
          username: 1, 
          level: 1, 
          clanId: 1,
          role: 1 
        } 
      }
    );
    
    if (!user) {
      return null;
    }
    
    // Fetch clan name if user is in a clan
    let clanName: string | undefined;
    if (user.clanId) {
      const clan = await db.collection('clans').findOne(
        { _id: new ObjectId(user.clanId) },
        { projection: { name: 1 } }
      );
      clanName = clan?.name;
    }
    
    return {
      userId: user._id.toString(),
      username: user.username,
      level: user.level || 1,
      clanId: user.clanId ? user.clanId.toString() : undefined,
      clanName,
      role: user.role,
    };
  } catch (error) {
    console.error('[WebSocket Auth] Failed to fetch user data:', error);
    return null;
  }
}

// ============================================================================
// MAIN AUTHENTICATION FUNCTION
// ============================================================================

/**
 * Authenticates Socket.io connection using cookie or token handshake
 * 
 * Strategy:
 * 1. Check for JWT in HTTP-only cookie (primary method)
 * 2. Fall back to manual token in handshake auth (secondary)
 * 3. Verify JWT signature and expiration
 * 4. Fetch complete user data from database
 * 5. Return authenticated user or error
 * 
 * @param socket - Socket.io socket instance
 * @returns Authentication result with user data
 * 
 * @example
 * io.use(async (socket, next) => {
 *   const result = await authenticateSocket(socket);
 *   if (result.success && result.user) {
 *     socket.data.user = result.user;
 *     next();
 *   } else {
 *     next(new Error(result.error || 'Authentication failed'));
 *   }
 * });
 */
export async function authenticateSocket(
  socket: Socket
): Promise<AuthenticationResult> {
  try {
    let token: string | undefined;
    
    // Strategy 1: Cookie-based authentication (automatic)
    const cookies = parseCookies(socket.handshake.headers.cookie);
    token = cookies[JWT_COOKIE_NAME];
    
    // Strategy 2: Token handshake (manual fallback)
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token as string;
    }
    
    // No token found in either location
    if (!token) {
      return {
        success: false,
        error: 'No authentication token provided',
      };
    }
    
    // Verify JWT signature and extract claims
    const jwtPayload = await verifyJWT(token);
    if (!jwtPayload) {
      return {
        success: false,
        error: 'Invalid or expired authentication token',
      };
    }
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (jwtPayload.exp && jwtPayload.exp < now) {
      return {
        success: false,
        error: 'Authentication token has expired',
      };
    }
    
    // Fetch complete user data from database
    const user = await fetchUserData(jwtPayload.userId);
    if (!user) {
      return {
        success: false,
        error: 'User not found or account disabled',
      };
    }
    
    // Success - return authenticated user
    return {
      success: true,
      user,
    };
    
  } catch (error) {
    console.error('[WebSocket Auth] Authentication error:', error);
    return {
      success: false,
      error: 'Internal authentication error',
    };
  }
}

// ============================================================================
// AUTHORIZATION HELPERS
// ============================================================================

/**
 * Checks if user is a member of a specific clan
 * 
 * @param user - Authenticated user
 * @param clanId - Clan ID to check membership
 * @returns True if user is member of the clan
 */
export function isClanMember(user: AuthenticatedUser, clanId: string): boolean {
  return user.clanId === clanId;
}

/**
 * Checks if user has admin role in their clan
 * 
 * @param user - Authenticated user
 * @returns True if user is clan admin or officer
 */
export function isClanAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'admin' || user.role === 'officer';
}

/**
 * Checks if user has global admin privileges
 * 
 * @param user - Authenticated user
 * @returns True if user is system admin
 */
export function isSystemAdmin(user: AuthenticatedUser): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}

/**
 * Validates user can perform action on clan
 * 
 * @param user - Authenticated user
 * @param clanId - Target clan ID
 * @param requireAdmin - Whether admin role is required
 * @returns Validation result with error message
 */
export function validateClanAction(
  user: AuthenticatedUser,
  clanId: string,
  requireAdmin: boolean = false
): { valid: boolean; error?: string } {
  // Check clan membership
  if (!isClanMember(user, clanId)) {
    return {
      valid: false,
      error: 'User is not a member of this clan',
    };
  }
  
  // Check admin requirement
  if (requireAdmin && !isClanAdmin(user)) {
    return {
      valid: false,
      error: 'User does not have admin privileges in this clan',
    };
  }
  
  return { valid: true };
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Dual Authentication Strategy:
 *    - Cookie-based is preferred for web clients (automatic, secure)
 *    - Token handshake provides fallback for mobile/desktop clients
 *    - Both methods use same JWT verification logic
 * 
 * 2. Security Considerations:
 *    - JWT_SECRET must be set in environment variables
 *    - Tokens verified using `jose` library (secure, modern)
 *    - Expired tokens rejected immediately
 *    - User existence validated against database
 *    - No sensitive data in JWT payload (only userId, username)
 * 
 * 3. Performance Optimization:
 *    - Authentication happens once per connection (not per event)
 *    - User data cached in socket.data.user for duration of connection
 *    - Database queries use projection to minimize data transfer
 *    - Clan name fetched only if user is in a clan
 * 
 * 4. Error Handling:
 *    - All errors logged for debugging
 *    - Generic error messages returned to client (security)
 *    - Specific errors logged server-side for troubleshooting
 * 
 * 5. Authorization Helpers:
 *    - Reusable functions for common permission checks
 *    - Used throughout event handlers to validate actions
 *    - Prevents unauthorized access to clan/admin features
 * 
 * FUTURE ENHANCEMENTS:
 * - Add rate limiting per user/IP
 * - Implement session management (kick users on logout)
 * - Add support for refresh tokens
 * - Track failed authentication attempts
 * - Add IP-based geolocation for security alerts
 */
