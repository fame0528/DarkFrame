/**
 * Admin Warfare Configuration API
 * 
 * Created: 2025-10-18
 * 
 * OVERVIEW:
 * Admin-only endpoint for viewing and updating warfare system configuration.
 * All parameters can be modified in real-time without server restart.
 * 
 * Features:
 * - GET: View current configuration
 * - POST: Update configuration with validation
 * - Config history tracking
 * - Admin password protection
 * 
 * Authentication:
 * - Requires valid JWT token
 * - Requires admin password for POST
 * 
 * @module app/api/admin/warfare/config
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { MongoClient } from 'mongodb';
import {
  initializeWarfareConfigService,
  loadWarfareConfig,
  saveWarfareConfig,
  validateWarfareConfig,
  getConfigHistory,
  type WarfareConfig,
} from '@/lib/warfareConfigService';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
const MONGODB_URI = process.env.MONGODB_URI || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let client: MongoClient | null = null;

/**
 * Get MongoDB client (singleton)
 */
async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('darkframe');
    initializeWarfareConfigService(client, db);
  }
  return client;
}

/**
 * GET /api/admin/warfare/config
 * View current warfare configuration
 * 
 * Query params:
 * - history (optional): If 'true', returns last 10 config versions
 * 
 * Returns:
 * - config: Current configuration object
 * - history (optional): Array of past configurations
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get auth token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.playerId as string;

    if (!playerId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get MongoDB client
    await getMongoClient();

    // Check if history requested
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';

    // Load current config
    const config = await loadWarfareConfig();

    if (includeHistory) {
      const history = await getConfigHistory(10);
      return NextResponse.json({
        success: true,
        config,
        history,
      });
    }

    return NextResponse.json({
      success: true,
      config,
    });

  } catch (error: any) {
    console.error('Error loading warfare config:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load configuration' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/warfare/config
 * Update warfare configuration (admin only)
 * 
 * Body:
 * - config (required): New configuration object
 * - adminPassword (required): Admin password
 * - username (optional): Admin username for logging
 * 
 * Returns:
 * - success: Whether update succeeded
 * - config: New configuration
 * - version: New version number
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get auth token
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const playerId = payload.playerId as string;
    const username = payload.username as string;

    if (!playerId) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { config, adminPassword } = body;

    if (!config) {
      return NextResponse.json(
        { error: 'config is required' },
        { status: 400 }
      );
    }

    // Verify admin password
    if (adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Admin authorization required' },
        { status: 403 }
      );
    }

    // Get MongoDB client
    await getMongoClient();

    // Validate configuration first
    const validation = validateWarfareConfig(config);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Invalid configuration',
          validationErrors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Save configuration
    const savedConfig = await saveWarfareConfig(config, username || playerId);

    return NextResponse.json({
      success: true,
      config: savedConfig,
      version: savedConfig.version,
      message: 'Configuration updated successfully',
    });

  } catch (error: any) {
    console.error('Error updating warfare config:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update configuration' },
      { status: 500 }
    );
  }
}
