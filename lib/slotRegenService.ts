/**
 * @file lib/slotRegenService.ts
 * @created 2025-10-17
 * @overview Factory slot regeneration service
 * 
 * OVERVIEW:
 * Handles automatic slot regeneration for factories. Slots regenerate at a rate of
 * 1 slot per hour up to a maximum of 10 slots. This service calculates how many
 * slots should be added based on time elapsed since last regeneration.
 * 
 * REGENERATION MECHANICS:
 * - Base rate: 1 slot per hour
 * - Maximum slots: 10
 * - Regeneration is calculated when:
 *   1. Factory status is queried
 *   2. Player attempts to build units
 *   3. Background job runs (optional)
 */

import { Factory } from '@/types';

/**
 * Slot regeneration configuration
 */
const SLOT_REGEN_CONFIG = {
  /** Slots regenerated per hour */
  REGEN_RATE: 1,
  
  /** Maximum slots a factory can have */
  MAX_SLOTS: 10,
  
  /** Milliseconds in one hour */
  HOUR_IN_MS: 60 * 60 * 1000
};

/**
 * Calculate how many slots should be regenerated based on time elapsed
 * 
 * @param lastRegenTime - Timestamp of last regeneration
 * @returns Number of slots to regenerate
 * 
 * @example
 * // 3 hours elapsed = 3 slots
 * const slots = calculateSlotsToRegen(new Date(Date.now() - 3 * 60 * 60 * 1000));
 * // Returns: 3
 */
export function calculateSlotsToRegen(lastRegenTime: Date): number {
  const now = new Date();
  const timeDiff = now.getTime() - new Date(lastRegenTime).getTime();
  const hoursElapsed = timeDiff / SLOT_REGEN_CONFIG.HOUR_IN_MS;
  
  // Only count full hours
  const fullHoursElapsed = Math.floor(hoursElapsed);
  
  return fullHoursElapsed * SLOT_REGEN_CONFIG.REGEN_RATE;
}

/**
 * Apply slot regeneration to a factory
 * 
 * @param factory - Factory data to update
 * @param balanceMultiplier - Optional balance multiplier (0.85-1.0 from player balance)
 * @returns Updated factory with regenerated slots
 * 
 * @example
 * const updatedFactory = applySlotRegeneration(currentFactory);
 * console.log(`Slots: ${updatedFactory.slots}/${SLOT_REGEN_CONFIG.MAX_SLOTS}`);
 * 
 * // With balance penalty
 * const updatedFactory = applySlotRegeneration(currentFactory, 0.85); // -15% regen
 */
export function applySlotRegeneration(factory: Factory, balanceMultiplier: number = 1.0): Factory {
  let slotsToAdd = calculateSlotsToRegen(factory.lastSlotRegen);
  
  if (slotsToAdd === 0) {
    // No regeneration needed
    return factory;
  }
  
  // Apply balance multiplier if provided (only affects Critical imbalance: 0.85)
  if (balanceMultiplier < 1.0) {
    slotsToAdd = Math.floor(slotsToAdd * balanceMultiplier);
  }
  
  // Calculate new slot count (capped at maximum)
  const newSlots = Math.min(
    factory.slots + slotsToAdd,
    SLOT_REGEN_CONFIG.MAX_SLOTS
  );
  
  // Update last regen time to now (or to the time of the last full hour)
  const now = new Date();
  const lastRegenTime = new Date(factory.lastSlotRegen);
  const hoursToAdvance = Math.floor(calculateSlotsToRegen(factory.lastSlotRegen));
  const newLastRegen = new Date(lastRegenTime.getTime() + (hoursToAdvance * SLOT_REGEN_CONFIG.HOUR_IN_MS));
  
  return {
    ...factory,
    slots: newSlots,
    lastSlotRegen: newLastRegen
  };
}

/**
 * Calculate available slots for building (current slots minus used slots)
 * 
 * @param factory - Factory data
 * @returns Number of slots available for new units
 * 
 * @example
 * const available = getAvailableSlots(factory);
 * if (available >= unitCost) {
 *   // Can build unit
 * }
 */
export function getAvailableSlots(factory: Factory): number {
  return Math.max(0, factory.slots - factory.usedSlots);
}

/**
 * Check if factory has enough slots to build a unit
 * 
 * @param factory - Factory data
 * @param requiredSlots - Number of slots needed
 * @returns True if factory has enough available slots
 * 
 * @example
 * if (hasEnoughSlots(factory, 1)) {
 *   await buildUnit(factory, unitType);
 * }
 */
export function hasEnoughSlots(factory: Factory, requiredSlots: number): boolean {
  const available = getAvailableSlots(factory);
  return available >= requiredSlots;
}

/**
 * Consume slots when building a unit
 * 
 * @param factory - Factory data
 * @param slotsToConsume - Number of slots to consume
 * @returns Updated factory with consumed slots
 * @throws Error if not enough slots available
 * 
 * @example
 * const updatedFactory = consumeSlots(factory, 1);
 * // factory.usedSlots increased by 1
 */
export function consumeSlots(factory: Factory, slotsToConsume: number): Factory {
  if (!hasEnoughSlots(factory, slotsToConsume)) {
    throw new Error(`Not enough slots available. Need ${slotsToConsume}, have ${getAvailableSlots(factory)}`);
  }
  
  return {
    ...factory,
    usedSlots: factory.usedSlots + slotsToConsume
  };
}

/**
 * Calculate time until next slot regeneration
 * 
 * @param factory - Factory data
 * @returns Object with hours, minutes, seconds until next slot
 * 
 * @example
 * const timeLeft = getTimeUntilNextSlot(factory);
 * console.log(`Next slot in ${timeLeft.minutes}m ${timeLeft.seconds}s`);
 */
export function getTimeUntilNextSlot(factory: Factory): {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const now = new Date();
  const lastRegen = new Date(factory.lastSlotRegen);
  const nextRegen = new Date(lastRegen.getTime() + SLOT_REGEN_CONFIG.HOUR_IN_MS);
  
  const timeLeft = nextRegen.getTime() - now.getTime();
  
  if (timeLeft <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  }
  
  const hours = Math.floor(timeLeft / SLOT_REGEN_CONFIG.HOUR_IN_MS);
  const minutes = Math.floor((timeLeft % SLOT_REGEN_CONFIG.HOUR_IN_MS) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
  
  return { hours, minutes, seconds, totalMs: timeLeft };
}

/**
 * Get slot regeneration configuration (for display purposes)
 */
export function getSlotRegenConfig() {
  return {
    regenRate: SLOT_REGEN_CONFIG.REGEN_RATE,
    maxSlots: SLOT_REGEN_CONFIG.MAX_SLOTS,
    hourInMs: SLOT_REGEN_CONFIG.HOUR_IN_MS
  };
}

// ============================================================
// IMPLEMENTATION NOTES
// ============================================================
/**
 * SLOT REGENERATION LOGIC:
 * 
 * 1. Factories start with 10 slots, max 10 slots
 * 2. Slots regenerate at 1 slot per hour
 * 3. Regeneration is applied "lazily" when factory is accessed
 * 4. Only full hours count (3.7 hours = 3 slots)
 * 5. lastSlotRegen tracks the timestamp for calculation
 * 
 * EXAMPLE TIMELINE:
 * - 00:00 - Factory has 5 slots, lastRegen = 00:00
 * - 00:30 - Still 5 slots (0.5 hours elapsed)
 * - 01:00 - 6 slots regenerated (1 full hour elapsed)
 * - 04:00 - 9 slots regenerated (4 full hours elapsed)
 * - 06:00 - 10 slots (capped at max, 5 full hours would give 10)
 * 
 * INTEGRATION POINTS:
 * - /api/factory/status - Apply regen before returning factory data
 * - /api/factory/build-unit - Apply regen before validating slots
 * - Background job (optional) - Periodically update all factories
 */

// ============================================================
// END OF FILE
// ============================================================
