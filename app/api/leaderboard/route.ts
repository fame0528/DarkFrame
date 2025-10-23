/**
 * Leaderboard API Endpoint
 * Created: 2025-10-17
 * 
 * OVERVIEW:
 * RESTful API endpoint for player rankings and leaderboard data.
 * Returns top 100 players ranked by effective power with current
 * player's rank regardless of their position in the leaderboard.
 * 
 * ENDPOINTS:
 * GET /api/leaderboard
 *   - Query params: username (required for player rank)
 *   - Returns: top 100 players + current player rank
 *   - Sorted by effective power descending
 * 
 * RESPONSE FORMAT:
 * {
 *   leaderboard: RankedPlayer[],
 *   currentPlayerRank: number | null,
 *   currentPlayerData: RankedPlayer | null,
 *   totalPlayers: number,
 *   lastUpdated: ISO date string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getTopPlayers,
  getPlayerRank,
  getTotalPlayerCount,
  getPlayerRankData,
  RankedPlayer
} from '@/lib/rankingService';
import { connectToDatabase } from '@/lib/mongodb';
import { getCacheOrFetch, getCache, setCache } from '@/lib/cacheService';
import { LeaderboardKeys, PlayerKeys, CacheTTL } from '@/lib/cacheKeys';

/**
 * GET /api/leaderboard
 * 
 * Retrieves top 100 players ranked by effective power
 * Includes current player's rank and data regardless of position
 * No Redis dependency - uses in-memory caching only
 */
export async function GET(request: NextRequest) {
  try {
    // Verify database connection
    await connectToDatabase();
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');
    const limitParam = searchParams.get('limit');
    
    // Validate and parse limit
    let limit = 100;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json(
          { error: 'Invalid limit parameter. Must be a positive integer.' },
          { status: 400 }
        );
      }
      // Cap at 500 to prevent excessive queries
      limit = Math.min(parsedLimit, 500);
    }
    
    // Fetch top players with caching (5 min TTL)
    const topPlayers = await getCacheOrFetch(
      LeaderboardKeys.playerLevel(),
      () => getTopPlayers(limit),
      CacheTTL.LEADERBOARD
    );
    
    // Get total player count with caching
    const totalPlayers = await getCacheOrFetch(
      'leaderboard:totalPlayers',
      () => getTotalPlayerCount(),
      CacheTTL.LEADERBOARD
    );
    
    // Initialize response data
    let currentPlayerRank: number | null = null;
    let currentPlayerData: RankedPlayer | null = null;
    
    // If username provided, get current player's rank and data
    if (username) {
      // Check if player is in top N
      const playerInTop = topPlayers.find(p => p.username === username);
      
      if (playerInTop) {
        // Player is in leaderboard
        currentPlayerRank = playerInTop.rank;
        currentPlayerData = playerInTop;
      } else {
        // Try cache first for player rank data
        const cacheKey = `leaderboard:playerRank:${username}`;
        let rankData = await getCache<{ rank: number | null }>(cacheKey);
        
        if (!rankData) {
          // Player not in cache, fetch their rank
          rankData = await getPlayerRankData(username);
          
          if (rankData) {
            // Cache rank data for 5 minutes
            await setCache(cacheKey, rankData, CacheTTL.LEADERBOARD);
          }
        }
        
        if (rankData && rankData.rank !== null) {
          currentPlayerRank = rankData.rank;
          
          // Fetch full player data for display with caching
          const currentPlayerData = await getCacheOrFetch(
            PlayerKeys.profile(username),
            async () => {
              const db = await connectToDatabase();
              const playersCollection = db.collection('players');
              const factoriesCollection = db.collection('factories');
              
              const player = await playersCollection.findOne({ username });
              if (!player) return null;
              
              const factoryCount = await factoriesCollection.countDocuments({ owner: username });
              
              const totalStrength = player.totalStrength || 0;
              const totalDefense = player.totalDefense || 0;
              
              // Import balance service for consistency
              const { calculateBalanceEffects } = await import('@/lib/balanceService');
              const balanceEffects = calculateBalanceEffects(totalStrength, totalDefense);
              const totalPower = totalStrength + totalDefense;
              const effectivePower = Math.floor(totalPower * balanceEffects.powerMultiplier);
              
              return {
                rank: rankData?.rank || 0,
                username: player.username,
                effectivePower,
                totalPower,
                balanceMultiplier: balanceEffects.powerMultiplier,
                balanceStatus: balanceEffects.status,
                totalStrength,
                totalDefense,
                factoriesOwned: factoryCount,
                level: player.level || 1
              } as RankedPlayer;
            },
            CacheTTL.PLAYER_PROFILE
          );
        }
      }
    }
    
    // Build response
    const response = {
      leaderboard: topPlayers,
      currentPlayerRank,
      currentPlayerData,
      totalPlayers,
      lastUpdated: new Date().toISOString()
    };
    
    return NextResponse.json(response, { status: 200 });
    
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    
    // Determine error type for appropriate response
    if (error instanceof Error) {
      // Database connection errors
      if (error.message.includes('connect') || error.message.includes('database')) {
        return NextResponse.json(
          { error: 'Database connection failed. Please try again later.' },
          { status: 503 }
        );
      }
      
      // Generic error with message
      return NextResponse.json(
        { error: `Failed to fetch leaderboard: ${error.message}` },
        { status: 500 }
      );
    }
    
    // Unknown error
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching leaderboard data.' },
      { status: 500 }
    );
  }
}

/**
 * IMPLEMENTATION NOTES:
 * 
 * 1. Performance Optimization:
 *    - Top 100 fetched with single aggregation query
 *    - Current player rank calculated separately only if not in top 100
 *    - Total player count cached (consider Redis for scale)
 *    - Response time target: <500ms for top 100
 * 
 * 2. Data Consistency:
 *    - Rankings recalculated on each request (real-time)
 *    - Future: Add caching layer with 5-minute TTL
 *    - Balance multipliers applied consistently
 * 
 * 3. Error Handling:
 *    - Database connection failures return 503
 *    - Invalid parameters return 400
 *    - Unknown errors return 500
 *    - All errors logged for monitoring
 * 
 * 4. Future Enhancements:
 *    - POST endpoint for rank updates (webhook pattern)
 *    - WebSocket support for real-time rank changes
 *    - Pagination for full leaderboard browsing
 *    - Multiple leaderboard categories (factories, XP, etc.)
 *    - Time-based rankings (daily, weekly, monthly)
 *    - Clan/alliance leaderboards
 * 
 * 5. Security Considerations:
 *    - No authentication required (public leaderboard)
 *    - Rate limiting recommended (10 req/min per IP)
 *    - Input validation on limit parameter
 *    - No sensitive player data exposed
 */
