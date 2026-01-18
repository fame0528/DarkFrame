/**
 * @file app/api/admin/migrate-factory-slots/route.ts
 * @created 2025-11-04
 * @overview ONE-TIME admin migration endpoint to update factory slot capacity
 * 
 * OVERVIEW:
 * Updates all existing factories in the database to use the new exponential
 * slot cost system capacity values (5000 base + 500 per level).
 * 
 * This endpoint should be called ONCE after deploying the slot cost changes.
 * Factories are static map tiles, so existing data needs updating.
 */

import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

const FACTORY_UPGRADE = {
  BASE_SLOTS: 5000,
  SLOTS_PER_LEVEL: 500
};

function getMaxSlots(level: number): number {
  return FACTORY_UPGRADE.BASE_SLOTS + ((level - 1) * FACTORY_UPGRADE.SLOTS_PER_LEVEL);
}

/**
 * POST /api/admin/migrate-factory-slots
 * One-time migration to update all factory slot capacities
 */
export async function POST(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('darkframe');
    const factoriesCollection = db.collection('factories');

    // Get all factories
    const factories = await factoriesCollection.find({}).toArray();
    
    if (factories.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No factories found in database'
      });
    }

    // Prepare bulk update operations
    const bulkOps = factories.map((factory: any) => {
      const level = factory.level || 1;
      const newSlots = getMaxSlots(level);
      
      return {
        updateOne: {
          filter: { _id: factory._id },
          update: {
            $set: {
              slots: newSlots
            }
          }
        }
      };
    });

    // Execute bulk update
    const result = await factoriesCollection.bulkWrite(bulkOps);

    // Get summary by level
    const levelSummary = await factoriesCollection.aggregate([
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          avgSlots: { $avg: '$slots' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    return NextResponse.json({
      success: true,
      message: 'Factory slot migration complete',
      statistics: {
        totalFactories: factories.length,
        modified: result.modifiedCount,
        matched: result.matchedCount,
        byLevel: levelSummary.map((item: any) => ({
          level: item._id,
          count: item.count,
          slots: Math.round(item.avgSlots)
        }))
      },
      formula: {
        old: '10 + ((level - 1) × 2)',
        new: '5000 + ((level - 1) × 500)'
      }
    });

  } catch (error) {
    console.error('Factory slot migration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/admin/migrate-factory-slots
 * Preview what the migration will do (doesn't update anything)
 */
export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('darkframe');
    const factoriesCollection = db.collection('factories');

    // Get sample factories
    const factories = await factoriesCollection.find({}).limit(10).toArray();
    
    const preview = factories.map((factory: any) => {
      const level = factory.level || 1;
      const oldSlots = factory.slots || 10;
      const newSlots = getMaxSlots(level);
      
      return {
        location: `(${factory.x}, ${factory.y})`,
        owner: factory.owner || 'unclaimed',
        level,
        oldSlots,
        newSlots,
        change: newSlots - oldSlots
      };
    });

    const totalCount = await factoriesCollection.countDocuments();

    return NextResponse.json({
      success: true,
      preview,
      totalFactories: totalCount,
      formula: {
        old: '10 + ((level - 1) × 2)',
        new: '5000 + ((level - 1) × 500)'
      },
      note: 'Use POST request to execute migration'
    });

  } catch (error) {
    console.error('Factory slot migration preview error:', error);
    return NextResponse.json({
      success: false,
      error: 'Preview failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
