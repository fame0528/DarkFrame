/**
 * @file lib/mongodb.ts
 * @created 2025-10-16
 * @overview MongoDB connection singleton with connection pooling
 * 
 * OVERVIEW:
 * Provides a singleton MongoDB client instance to prevent connection pool exhaustion
 * in serverless Next.js API routes. Handles connection management, error handling,
 * and provides helper methods for accessing collections.
 */

import { MongoClient, Db, Collection, Document } from 'mongodb';

/**
 * Global type augmentation for MongoDB client caching in development
 * Prevents hot-reloading from creating multiple connections
 */
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * MongoDB connection URI from environment variables
 * Must be defined in .env.local file
 */
const MONGODB_URI = process.env.MONGODB_URI;

/**
 * Database name from environment variables
 * Defaults to 'darkframe' if not specified
 */
const MONGODB_DB = process.env.MONGODB_DB || 'darkframe';

/**
 * Validates that MongoDB URI is configured
 * @throws Error if MONGODB_URI is not defined
 */
if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

/**
 * Slow query threshold in milliseconds
 * Queries taking longer than this will be logged
 */
const SLOW_QUERY_THRESHOLD_MS = 50;

/**
 * MongoDB client options for connection
 */
const options = {
  // Connection pool settings
  maxPoolSize: 10,
  minPoolSize: 2,
  
  // Timeout settings
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  
  // Enable command monitoring for slow query logging
  monitorCommands: true,
};

/**
 * MongoDB client instance (singleton)
 */
let client: MongoClient;

/**
 * Promise that resolves to MongoDB client
 * Cached globally in development to prevent hot-reload connection issues
 */
let clientPromise: Promise<MongoClient>;

/**
 * Initialize MongoDB client connection
 * Uses singleton pattern to reuse connection across serverless function calls
 */
if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable to preserve connection across hot reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(MONGODB_URI, options);
    
    // Setup slow query logging
    client.on('commandStarted', (event) => {
      // Store start time for this command
      (event as any)._startTime = Date.now();
    });
    
    client.on('commandSucceeded', (event) => {
      const duration = Date.now() - ((event as any)._startTime || Date.now());
      
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        console.warn(`⚠️ Slow query detected (${duration}ms):`, {
          command: event.commandName,
          duration: `${duration}ms`,
        });
      }
    });
    
    client.on('commandFailed', (event) => {
      const duration = Date.now() - ((event as any)._startTime || Date.now());
      console.error(`❌ Query failed (${duration}ms):`, {
        command: event.commandName,
        error: event.failure,
      });
    });
    
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, create a new client for each deployment
  client = new MongoClient(MONGODB_URI, options);
  
  // Setup slow query logging in production too
  client.on('commandStarted', (event) => {
    (event as any)._startTime = Date.now();
  });
  
  client.on('commandSucceeded', (event) => {
    const duration = Date.now() - ((event as any)._startTime || Date.now());
    
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`⚠️ Slow query detected (${duration}ms):`, {
        command: event.commandName,
        duration: `${duration}ms`,
      });
    }
  });
  
  clientPromise = client.connect();
}

/**
 * Get MongoDB database instance
 * 
 * @returns Promise that resolves to MongoDB database
 * 
 * @example
 * ```typescript
 * const db = await getDatabase();
 * const tiles = db.collection('tiles');
 * ```
 */
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db(MONGODB_DB);
}

/**
 * Get MongoDB client instance
 * 
 * @returns Promise that resolves to MongoDB client
 * 
 * @example
 * ```typescript
 * const client = await getClient();
 * const db = client.db('darkframe');
 * ```
 */
export async function getClient(): Promise<MongoClient> {
  return await clientPromise;
}

/**
 * Get both client and database (for services that need both)
 * 
 * @returns Promise that resolves to { client, db }
 * 
 * @example
 * ```typescript
 * const { client, db } = await getClientAndDatabase();
 * initializeClanService(client, db);
 * ```
 */
export async function getClientAndDatabase(): Promise<{ client: MongoClient; db: Db }> {
  const client = await clientPromise;
  const db = client.db(MONGODB_DB);
  return { client, db };
}

/**
 * Connect to database (alias for getDatabase)
 * Provided for backward compatibility with existing code
 */
export const connectToDatabase = getDatabase;

/**
 * Get a specific MongoDB collection with type safety
 * 
 * @param collectionName - Name of the collection to access
 * @returns Promise that resolves to typed MongoDB collection
 * 
 * @example
 * ```typescript
 * const tilesCollection = await getCollection<Tile>('tiles');
 * const tile = await tilesCollection.findOne({ x: 1, y: 1 });
 * ```
 */
export async function getCollection<T extends Document = Document>(
  collectionName: string
): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(collectionName);
}

/**
 * Test MongoDB connection
 * Useful for health checks and initialization validation
 * 
 * @returns Promise that resolves to true if connection successful
 * @throws Error if connection fails
 * 
 * @example
 * ```typescript
 * const isConnected = await testConnection();
 * console.log('MongoDB connected:', isConnected);
 * ```
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = await clientPromise;
    // Ping the database to verify connection
    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connection successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    throw new Error('Failed to connect to MongoDB');
  }
}

/**
 * Close MongoDB connection
 * Should be called on application shutdown
 * 
 * @example
 * ```typescript
 * await closeConnection();
 * ```
 */
export async function closeConnection(): Promise<void> {
  try {
    const client = await clientPromise;
    await client.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
}

// Export the client promise as default for direct access if needed
export default clientPromise;

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Singleton pattern prevents connection pool exhaustion
// - Global caching in development prevents hot-reload issues
// - Connection options optimized for serverless functions
// - Type-safe collection access with generics
// - Helper functions for common database operations
// - Error handling with detailed logging
// ============================================================
// END OF FILE
// ============================================================
