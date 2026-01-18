/**
 * Test Utilities
 * Created: 2025-10-23
 * 
 * OVERVIEW:
 * Provides helper functions for testing including database access,
 * mock data generation, and common test setup/teardown utilities.
 */

import { MongoClient, Db } from 'mongodb';

/**
 * Get test database connection
 * Uses MONGODB_URI from environment (set by vitest.setup.ts)
 */
export async function getTestDb(): Promise<Db> {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not set in test environment');
  }
  
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return client.db();
}

/**
 * Create mock user for testing
 */
export function createMockUser(overrides?: Partial<any>) {
  return {
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword123',
    position: { x: 0, y: 0 },
    resources: {
      metal: 1000,
      energy: 1000,
      rp: 100,
    },
    stats: {
      level: 1,
      experience: 0,
      health: 100,
      maxHealth: 100,
    },
    createdAt: new Date(),
    lastActive: new Date(),
    ...overrides,
  };
}

/**
 * Create mock battle result for testing
 */
export function createMockBattleResult(overrides?: Partial<any>) {
  return {
    attackerId: 'attacker123',
    defenderId: 'defender456',
    winner: 'attacker123',
    attackerDamage: 50,
    defenderDamage: 30,
    resourcesStolen: {
      metal: 100,
      energy: 80,
      rp: 20,
    },
    timestamp: new Date(),
    ...overrides,
  };
}

/**
 * Wait for async operations (useful for testing timers)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clear all test data from database
 */
export async function clearTestData(db: Db): Promise<void> {
  const collections = await db.collections();
  
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}
