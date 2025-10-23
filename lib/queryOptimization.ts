/**
 * Query Optimization Utilities
 * 
 * Provides helper functions for optimized MongoDB queries with projections,
 * pagination, and performance monitoring.
 * 
 * Created: 2025-10-18
 * Feature: FID-20251018-040 (Database Query Optimization)
 * 
 * OVERVIEW:
 * This module contains utility functions that enforce best practices for
 * MongoDB queries: using projections to reduce data transfer, implementing
 * pagination for large result sets, and monitoring query performance.
 * 
 * All query functions should use these utilities to maintain consistent
 * performance standards across the application.
 */

import type { Collection, Document, Filter, FindOptions, Sort } from 'mongodb';

/**
 * Common projection patterns for frequently queried collections
 * Only select fields that are actually needed
 */
export const projections = {
  // Player projections
  playerBasic: {
    _id: 1,
    username: 1,
    level: 1,
    power: 1,
    clanId: 1,
  },
  playerStats: {
    _id: 1,
    username: 1,
    level: 1,
    power: 1,
    currentHP: 1,
    maxHP: 1,
    x: 1,
    y: 1,
  },
  playerFull: {
    // All fields (or omit projection for full document)
  },

  // Clan projections
  clanBasic: {
    _id: 1,
    name: 1,
    tag: 1,
    level: 1,
    power: 1,
  },
  clanLeaderboard: {
    _id: 1,
    name: 1,
    tag: 1,
    level: 1,
    power: 1,
    territoryCount: 1,
    memberCount: 1,
  },
  clanFull: {
    // All fields
  },

  // Territory projections
  territoryBasic: {
    _id: 1,
    x: 1,
    y: 1,
    clanId: 1,
  },

  // Battle log projections
  battleSummary: {
    _id: 1,
    attackerId: 1,
    defenderId: 1,
    winner: 1,
    timestamp: 1,
    attackerLosses: 1,
    defenderLosses: 1,
  },

  // Auction projections
  auctionListing: {
    _id: 1,
    itemType: 1,
    itemName: 1,
    quantity: 1,
    startingBid: 1,
    currentBid: 1,
    currentBidder: 1,
    endTime: 1,
    status: 1,
  },

  // Factory projections
  factoryBasic: {
    _id: 1,
    x: 1,
    y: 1,
    ownerId: 1,
    clanId: 1,
    level: 1,
    resourceType: 1,
  },
} as const;

/**
 * Pagination options for query results
 */
export interface PaginationOptions {
  page?: number;      // Page number (1-indexed)
  limit?: number;     // Results per page
  skip?: number;      // Alternative to page (0-indexed offset)
}

/**
 * Query performance thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  SLOW_QUERY_MS: 50,      // Log queries taking longer than this
  CRITICAL_QUERY_MS: 100, // Alert on queries taking longer than this
} as const;

/**
 * Calculate skip value from pagination options
 */
export function getSkipValue(options: PaginationOptions): number {
  if (options.skip !== undefined) {
    return options.skip;
  }
  
  const page = options.page || 1;
  const limit = options.limit || 20;
  return (page - 1) * limit;
}

/**
 * Paginated find query with performance monitoring
 * 
 * @example
 * const players = await paginatedFind(
 *   db.collection('players'),
 *   { clanId: 'clan123' },
 *   { page: 1, limit: 20 },
 *   { level: -1 },
 *   projections.playerBasic
 * );
 */
export async function paginatedFind<T extends Document>(
  collection: Collection<T>,
  filter: Filter<T>,
  pagination: PaginationOptions = {},
  sort?: Sort,
  projection?: Document
): Promise<T[]> {
  const startTime = Date.now();
  const limit = pagination.limit || 20;
  const skip = getSkipValue(pagination);

  const options: FindOptions<T> = {
    limit,
    skip,
  };

  if (projection) {
    options.projection = projection;
  }

  if (sort) {
    options.sort = sort;
  }

  try {
    const results = await collection.find(filter, options).toArray();
    const duration = Date.now() - startTime;

    // Log slow queries
    if (duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
      console.warn(`⚠️ Slow query detected (${duration}ms):`, {
        collection: collection.collectionName,
        filter: JSON.stringify(filter),
        limit,
        skip,
        sort: JSON.stringify(sort),
      });
    }

    return results as T[];
  } catch (error) {
    console.error('Query error:', {
      collection: collection.collectionName,
      filter,
      error,
    });
    throw error;
  }
}

/**
 * Count documents with caching hint
 * Use estimatedDocumentCount() for approximate counts (much faster)
 */
export async function countDocuments<T extends Document>(
  collection: Collection<T>,
  filter: Filter<T>,
  useEstimate = false
): Promise<number> {
  const startTime = Date.now();

  try {
    let count: number;
    
    // If no filter and estimate allowed, use fast estimation
    if (useEstimate && Object.keys(filter).length === 0) {
      count = await collection.estimatedDocumentCount();
    } else {
      count = await collection.countDocuments(filter);
    }

    const duration = Date.now() - startTime;

    if (duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
      console.warn(`⚠️ Slow count query (${duration}ms):`, {
        collection: collection.collectionName,
        filter: JSON.stringify(filter),
      });
    }

    return count;
  } catch (error) {
    console.error('Count error:', {
      collection: collection.collectionName,
      filter,
      error,
    });
    throw error;
  }
}

/**
 * Find one document with performance monitoring
 */
export async function findOne<T extends Document>(
  collection: Collection<T>,
  filter: Filter<T>,
  projection?: Document
): Promise<T | null> {
  const startTime = Date.now();

  const options: FindOptions<T> = {};
  if (projection) {
    options.projection = projection;
  }

  try {
    const result = await collection.findOne(filter, options);
    const duration = Date.now() - startTime;

    if (duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
      console.warn(`⚠️ Slow findOne query (${duration}ms):`, {
        collection: collection.collectionName,
        filter: JSON.stringify(filter),
      });
    }

    return result as T | null;
  } catch (error) {
    console.error('FindOne error:', {
      collection: collection.collectionName,
      filter,
      error,
    });
    throw error;
  }
}

/**
 * Leaderboard query helper
 * Optimized for sorted, limited queries
 */
export async function getLeaderboard<T extends Document>(
  collection: Collection<T>,
  filter: Filter<T>,
  sort: Sort,
  limit = 100,
  projection?: Document
): Promise<T[]> {
  return paginatedFind(
    collection,
    filter,
    { limit, skip: 0 },
    sort,
    projection
  );
}

/**
 * Batch find by IDs with projection
 * Optimized for fetching multiple documents by ID
 */
export async function findByIds<T extends Document>(
  collection: Collection<T>,
  ids: string[],
  projection?: Document
): Promise<T[]> {
  if (ids.length === 0) return [];

  const startTime = Date.now();

  const options: FindOptions<T> = {};
  if (projection) {
    options.projection = projection;
  }

  try {
    const results = await collection
      .find({ _id: { $in: ids } } as Filter<T>, options)
      .toArray();

    const duration = Date.now() - startTime;

    if (duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
      console.warn(`⚠️ Slow batch find (${duration}ms):`, {
        collection: collection.collectionName,
        idCount: ids.length,
      });
    }

    return results as T[];
  } catch (error) {
    console.error('Batch find error:', {
      collection: collection.collectionName,
      idCount: ids.length,
      error,
    });
    throw error;
  }
}

/**
 * Query performance logger
 * Call this to manually log query performance metrics
 */
export function logQueryPerformance(
  collectionName: string,
  queryType: string,
  duration: number,
  details?: Record<string, unknown>
): void {
  const level = duration > PERFORMANCE_THRESHOLDS.CRITICAL_QUERY_MS
    ? 'CRITICAL'
    : duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS
    ? 'SLOW'
    : 'NORMAL';

  if (level !== 'NORMAL') {
    const emoji = level === 'CRITICAL' ? '🚨' : '⚠️';
    console.warn(`${emoji} ${level} Query (${duration}ms):`, {
      collection: collectionName,
      queryType,
      ...details,
    });
  }
}

/**
 * Build pagination metadata for API responses
 */
export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);
  
  return {
    currentPage: page,
    pageSize: limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Aggregate query helper with performance monitoring
 */
export async function aggregate<T extends Document>(
  collection: Collection<T>,
  pipeline: Document[],
  collectionName?: string
): Promise<Document[]> {
  const startTime = Date.now();

  try {
    const results = await collection.aggregate(pipeline).toArray();
    const duration = Date.now() - startTime;

    if (duration > PERFORMANCE_THRESHOLDS.SLOW_QUERY_MS) {
      console.warn(`⚠️ Slow aggregation (${duration}ms):`, {
        collection: collectionName || collection.collectionName,
        pipelineStages: pipeline.length,
      });
    }

    return results;
  } catch (error) {
    console.error('Aggregation error:', {
      collection: collectionName || collection.collectionName,
      pipeline,
      error,
    });
    throw error;
  }
}
