/**
 * Vitest Setup File
 * Created: 2025-10-23
 * 
 * OVERVIEW:
 * Configures test environment with @testing-library/jest-dom matchers.
 * MongoDB memory server setup is optional and only used for integration tests.
 */

import '@testing-library/jest-dom';
import { vi, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';

// Set test environment
(process.env as any).NODE_ENV = 'test';

// Polyfill TextEncoder/TextDecoder for jsdom environment
if (!(globalThis as any).TextEncoder) {
  (globalThis as any).TextEncoder = NodeTextEncoder as any;
}
if (!(globalThis as any).TextDecoder) {
  (globalThis as any).TextDecoder = NodeTextDecoder as any;
}

// Start an in-memory MongoDB for tests and set MONGODB_URI before any imports that use it.
// Use top-level await so the URI is available when API route modules import the DB client.
let __memoryMongo: MongoMemoryServer | null = null;
try {
  __memoryMongo = await MongoMemoryServer.create();
  const uri = __memoryMongo.getUri('darkframe-test');
  process.env.MONGODB_URI = uri;
  // Optionally set DB name for helpers that read it
  if (!process.env.MONGODB_DB) process.env.MONGODB_DB = 'darkframe-test';
  // Ensure JWT secret is set for tests that generate real tokens
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret';
  // eslint-disable-next-line no-console
  console.log(`✅ In-memory MongoDB started for tests: ${uri}`);
} catch (err) {
  // Fallback to localhost only if memory server fails to start
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/darkframe-test';
  }
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret';
  // eslint-disable-next-line no-console
  console.warn('⚠️ mongodb-memory-server failed to start, falling back to localhost:', err);
}

// Mock window.matchMedia for components using useMediaQuery hook
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated but might be used
      removeListener: vi.fn(), // deprecated but might be used
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
  // Ensure the in-memory server is stopped when tests finish
  afterAll(async () => {
    if (__memoryMongo) {
      try {
        await __memoryMongo.stop();
        // eslint-disable-next-line no-console
        console.log('🧹 In-memory MongoDB stopped');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ Failed to stop in-memory MongoDB:', e);
      }
    }
  });

  console.log('✅ Test environment configured');
console.log('✅ Test environment configured');

