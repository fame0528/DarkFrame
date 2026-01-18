/**
 * Factory Slots Migration
 * Created: 2025-11-04
 * 
 * OVERVIEW:
 * Idempotent migration to update ALL existing factories to the new
 * slot capacity formula and ensure data consistency:
 *   slots = 5000 + ((level - 1) * 500)
 *   usedSlots <= slots
 *   lastSlotRegen defaults to now if missing
 *
 * The migration records a marker document in the `migrations` collection
 * with id `2025-11-04-factory-slots-v1`. It is safe to run multiple times:
 * - It always recomputes slots using an aggregation pipeline update
 * - It clamps usedSlots to slots
 * - It sets a default for lastSlotRegen when absent
 */

import type { Db } from 'mongodb';

const MIGRATION_ID = '2025-11-04-factory-slots-v1';

const FACTORY_UPGRADE = {
  BASE_SLOTS: 5000,
  SLOTS_PER_LEVEL: 500,
} as const;

function getMaxSlots(level: number): number {
  return FACTORY_UPGRADE.BASE_SLOTS + ((level - 1) * FACTORY_UPGRADE.SLOTS_PER_LEVEL);
}

export async function runFactorySlotsMigration(db: Db): Promise<{
  success: boolean;
  message: string;
  modified?: number;
  matched?: number;
  alreadyApplied?: boolean;
}> {
  const migrations = db.collection('migrations');
  const factories = db.collection('factories');

  // Check if migration marker exists
  const marker = await migrations.findOne({ _id: MIGRATION_ID as any });

  // Count how many factories need updating (defensive/idempotent)
  // Criteria: slots not equal to computed; or usedSlots > slots; or missing lastSlotRegen
  const needingUpdate = await factories.countDocuments({
    $or: [
      {
        $expr: {
          $ne: [
            '$slots',
            {
              $add: [
                FACTORY_UPGRADE.BASE_SLOTS,
                {
                  $multiply: [
                    { $subtract: [{ $ifNull: ['$level', 1] }, 1] },
                    FACTORY_UPGRADE.SLOTS_PER_LEVEL,
                  ],
                },
              ],
            },
          ],
        },
      },
      { $expr: { $gt: [{ $ifNull: ['$usedSlots', 0] }, { $ifNull: ['$slots', 0] }] } },
      { lastSlotRegen: { $exists: false } },
    ],
  });

  if (needingUpdate === 0 && marker) {
    return {
      success: true,
      message: 'Factory slots migration already applied (no changes needed)',
      modified: 0,
      matched: 0,
      alreadyApplied: true,
    };
  }

  // Apply aggregation pipeline update for all factories
  // Stage 1: compute new slots based on level
  // Stage 2: clamp usedSlots to new slots
  // Stage 3: set default lastSlotRegen if missing
  const updateResult = await factories.updateMany(
    {},
    [
      {
        $set: {
          slots: {
            $add: [
              FACTORY_UPGRADE.BASE_SLOTS,
              {
                $multiply: [
                  { $subtract: [{ $ifNull: ['$level', 1] }, 1] },
                  FACTORY_UPGRADE.SLOTS_PER_LEVEL,
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          usedSlots: {
            $cond: [
              { $gt: [{ $ifNull: ['$usedSlots', 0] }, { $ifNull: ['$slots', 0] }] },
              { $ifNull: ['$slots', 0] },
              { $ifNull: ['$usedSlots', 0] },
            ],
          },
        },
      },
      {
        $set: {
          lastSlotRegen: {
            $ifNull: ['$lastSlotRegen', new Date()],
          },
        },
      },
    ] as any,
  );

  // Upsert migration marker
  await migrations.updateOne(
    { _id: MIGRATION_ID as any },
    {
      $set: {
        _id: MIGRATION_ID,
        appliedAt: new Date(),
        details: {
          baseSlots: FACTORY_UPGRADE.BASE_SLOTS,
          slotsPerLevel: FACTORY_UPGRADE.SLOTS_PER_LEVEL,
        },
      },
    },
    { upsert: true },
  );

  return {
    success: true,
    message: `Updated factory slots to new formula (base ${FACTORY_UPGRADE.BASE_SLOTS}, +${FACTORY_UPGRADE.SLOTS_PER_LEVEL}/lvl)`,
    modified: updateResult.modifiedCount,
    matched: updateResult.matchedCount,
    alreadyApplied: false,
  };
}

// Utility for tests or scripts
export { getMaxSlots };
