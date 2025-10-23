/**
 * @file lib/botService.ts
 * @created 2025-10-18
 * @overview Bot ecosystem service with Full Permanence model
 * 
 * OVERVIEW:
 * Manages AI-controlled bot players that mimic real player behavior.
 * Full Permanence Model: Bots stay on map permanently, regenerate resources hourly (5-20% by type).
 * Beer Bases despawn when defeated and respawn weekly at random locations.
 * 
 * Bot Specializations:
 * - Hoarder (25%): 50k-150k resources, 0.5x defense, stationary, 5% regen/hour
 * - Fortress (20%): 3x defense, 5k-15k resources, stationary, 10% regen/hour
 * - Raider (25%): 3x attack frequency, mobile (3-5 tiles/day), 15% regen/hour
 * - Ghost (15%): 2x resources, teleports every 12 hours, 20% regen/hour
 * - Balanced (15%): Standard stats, moderate movement, 10% regen/hour
 * 
 * Features:
 * - 1000+ unique bot names (military/fantasy/sci-fi mix)
 * - Zone-based spawn distribution (9 zones, 50×50 each)
 * - Bot nests (8 permanent locations with 15-20 bots each)
 * - Resource regeneration system (hourly, type-dependent rates)
 * - Reputation system (Unknown → Notorious → Infamous → Legendary)
 * - Beer Bases (5-10% special bots with 3x resources, weekly respawn)
 */

import { BotSpecialization, BotReputation, type Player, type BotConfig, type Position } from '@/types/game.types';
import { getDatabase } from '@/lib/mongodb';

// ============================================================
// BOT NAME GENERATION (1000+ UNIQUE NAMES)
// ============================================================

const BOT_NAME_PREFIXES = [
  // Military (200)
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet',
  'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango',
  'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu', 'Apex', 'Striker', 'Recon', 'Viper',
  'Phantom', 'Shadow', 'Ghost', 'Raven', 'Hawk', 'Eagle', 'Falcon', 'Cobra', 'Wolf', 'Bear',
  'Tiger', 'Dragon', 'Lion', 'Panther', 'Jaguar', 'Scorpion', 'Hornet', 'Wasp', 'Venom', 'Blade',
  'Steel', 'Iron', 'Titan', 'Goliath', 'Atlas', 'Hercules', 'Thor', 'Odin', 'Zeus', 'Ares',
  'Mars', 'Apollo', 'Hades', 'Poseidon', 'Artemis', 'Athena', 'Hera', 'Aphrodite', 'Hermes', 'Hephaestus',
  'Sentinel', 'Guardian', 'Warden', 'Keeper', 'Protector', 'Defender', 'Champion', 'Warrior', 'Soldier', 'Knight',
  'Paladin', 'Crusader', 'Templar', 'Spartan', 'Trojan', 'Viking', 'Samurai', 'Ninja', 'Ronin', 'Shogun',
  'Centurion', 'Legionnaire', 'Gladiator', 'Praetorian', 'Phalanx', 'Hoplite', 'Berserker', 'Marauder', 'Raider', 'Pillager',
  // Fantasy (200)
  'Mystic', 'Arcane', 'Enigma', 'Oracle', 'Sage', 'Seer', 'Prophet', 'Diviner', 'Warlock', 'Sorcerer',
  'Wizard', 'Mage', 'Enchanter', 'Conjurer', 'Summoner', 'Necromancer', 'Pyromancer', 'Cryomancer', 'Geomancer', 'Aeromancer',
  'Druid', 'Shaman', 'Priest', 'Cleric', 'Monk', 'Hermit', 'Ascetic', 'Zealot', 'Fanatic', 'Inquisitor',
  'Wraith', 'Specter', 'Phantom', 'Banshee', 'Ghoul', 'Vampire', 'Lich', 'Demon', 'Devil', 'Imp',
  'Goblin', 'Orc', 'Troll', 'Ogre', 'Giant', 'Cyclops', 'Minotaur', 'Centaur', 'Satyr', 'Faun',
  'Elf', 'Dwarf', 'Gnome', 'Halfling', 'Fairy', 'Pixie', 'Sprite', 'Nymph', 'Dryad', 'Naiad',
  'Frost', 'Flame', 'Storm', 'Thunder', 'Lightning', 'Inferno', 'Blizzard', 'Tempest', 'Cyclone', 'Tornado',
  'Quake', 'Avalanche', 'Volcano', 'Tsunami', 'Hurricane', 'Typhoon', 'Monsoon', 'Eclipse', 'Nova', 'Comet',
  'Meteor', 'Asteroid', 'Nebula', 'Galaxy', 'Cosmos', 'Universe', 'Void', 'Abyss', 'Chaos', 'Entropy',
  'Rune', 'Glyph', 'Sigil', 'Seal', 'Ward', 'Hex', 'Curse', 'Charm', 'Spell', 'Ritual',
  // Sci-Fi (200)
  'Quantum', 'Photon', 'Neutron', 'Proton', 'Electron', 'Quark', 'Boson', 'Hadron', 'Lepton', 'Neutrino',
  'Plasma', 'Fusion', 'Fission', 'Reactor', 'Generator', 'Amplifier', 'Modulator', 'Oscillator', 'Resonator', 'Emitter',
  'Nexus', 'Apex', 'Vertex', 'Matrix', 'Vector', 'Scalar', 'Tensor', 'Algorithm', 'Protocol', 'Cipher',
  'Binary', 'Digital', 'Analog', 'Virtual', 'Cyber', 'Nano', 'Micro', 'Macro', 'Mega', 'Giga',
  'Tera', 'Peta', 'Exa', 'Zetta', 'Yotta', 'Kilo', 'Milli', 'Centi', 'Deci', 'Hecto',
  'Orbit', 'Satellite', 'Station', 'Outpost', 'Colony', 'Habitat', 'Dome', 'Pod', 'Module', 'Sector',
  'Warp', 'Jump', 'Hyper', 'Sub', 'Trans', 'Inter', 'Ultra', 'Super', 'Meta', 'Para',
  'Exo', 'Endo', 'Bio', 'Geo', 'Hydro', 'Aero', 'Pyro', 'Cryo', 'Thermo', 'Electro',
  'Synth', 'Clone', 'Android', 'Cyborg', 'Robot', 'Drone', 'Automaton', 'Mech', 'Golem', 'Construct',
  'Beacon', 'Signal', 'Pulse', 'Wave', 'Frequency', 'Amplitude', 'Wavelength', 'Spectrum', 'Radiation', 'Emission',
  // Additional (200)
  'Crimson', 'Scarlet', 'Ruby', 'Garnet', 'Azure', 'Sapphire', 'Cobalt', 'Navy', 'Emerald', 'Jade',
  'Amber', 'Topaz', 'Citrine', 'Onyx', 'Obsidian', 'Ebony', 'Ivory', 'Pearl', 'Diamond', 'Crystal',
  'Prism', 'Radiant', 'Brilliant', 'Lustrous', 'Shimmer', 'Glimmer', 'Sparkle', 'Glitter', 'Shine', 'Gleam',
  'Dawn', 'Dusk', 'Twilight', 'Midnight', 'Noon', 'Sunrise', 'Sunset', 'Moonrise', 'Moonset', 'Eclipse',
  'Spring', 'Summer', 'Autumn', 'Winter', 'Solstice', 'Equinox', 'Season', 'Harvest', 'Bloom', 'Frost',
  'North', 'South', 'East', 'West', 'Central', 'Prime', 'Core', 'Edge', 'Border', 'Frontier',
  'Vanguard', 'Vortex', 'Vertex', 'Zenith', 'Nadir', 'Apex', 'Peak', 'Summit', 'Crest', 'Ridge',
  'Valley', 'Canyon', 'Gorge', 'Ravine', 'Chasm', 'Abyss', 'Depths', 'Heights', 'Plains', 'Plateau',
  'Bastion', 'Citadel', 'Fortress', 'Stronghold', 'Rampart', 'Bulwark', 'Redoubt', 'Keep', 'Tower', 'Spire',
  'Nexus', 'Hub', 'Node', 'Link', 'Bridge', 'Gate', 'Portal', 'Passage', 'Conduit', 'Channel',
];

const BOT_NAME_SUFFIXES = [
  // Numbers and codes (100)
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
  'Phi', 'Chi', 'Psi', 'Omega', 'Prime', 'Zero', 'One', 'Two', 'Three', 'Four',
  'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Hundred', 'Thousand', 'Unit', 'Corps',
  // Descriptors (100)
  'Command', 'Control', 'Core', 'Prime', 'Supreme', 'Ultimate', 'Eternal', 'Immortal', 'Infinite', 'Divine',
  'Sacred', 'Holy', 'Blessed', 'Cursed', 'Damned', 'Fallen', 'Rising', 'Ascendant', 'Dominant', 'Superior',
  'Elite', 'Master', 'Lord', 'King', 'Emperor', 'Kaiser', 'Czar', 'Sultan', 'Pharaoh', 'Khan',
  'Chief', 'Captain', 'Major', 'Colonel', 'General', 'Marshal', 'Admiral', 'Commander', 'Leader', 'Ruler',
  'Guardian', 'Sentinel', 'Watcher', 'Observer', 'Monitor', 'Scout', 'Recon', 'Spy', 'Agent', 'Operative',
  'Hunter', 'Seeker', 'Finder', 'Tracker', 'Stalker', 'Predator', 'Prey', 'Target', 'Mark', 'Victim',
  // Elements (50)
  'Fire', 'Ice', 'Wind', 'Earth', 'Lightning', 'Water', 'Light', 'Dark', 'Shadow', 'Void',
  'Chaos', 'Order', 'Life', 'Death', 'Time', 'Space', 'Matter', 'Energy', 'Force', 'Power',
  'Strength', 'Speed', 'Rage', 'Fury', 'Wrath', 'Vengeance', 'Justice', 'Honor', 'Glory', 'Fame',
  'Pride', 'Greed', 'Envy', 'Sloth', 'Lust', 'Gluttony', 'Hope', 'Faith', 'Love', 'Hate',
  'Fear', 'Courage', 'Wisdom', 'Knowledge', 'Truth', 'Lies', 'Dreams', 'Nightmares', 'Destiny', 'Fate',
];

/**
 * Generate unique bot name from prefixes and suffixes
 * 1000+ combinations possible
 * 
 * @returns Unique bot username (e.g., "Alpha-Command", "Quantum-Prime", "Shadow-Hunter")
 */
export function generateBotName(): string {
  const prefix = BOT_NAME_PREFIXES[Math.floor(Math.random() * BOT_NAME_PREFIXES.length)];
  const suffix = BOT_NAME_SUFFIXES[Math.floor(Math.random() * BOT_NAME_SUFFIXES.length)];
  const variant = Math.random() < 0.3 ? `-${Math.floor(Math.random() * 999) + 1}` : '';
  return `${prefix}-${suffix}${variant}`;
}

// ============================================================
// BOT SPECIALIZATION LOGIC
// ============================================================

/**
 * Get bot specialization with weighted distribution
 * 
 * Distribution:
 * - Hoarder: 25%
 * - Raider: 25%
 * - Fortress: 20%
 * - Ghost: 15%
 * - Balanced: 15%
 * 
 * @returns Random bot specialization based on weights
 */
export function getRandomSpecialization(): BotSpecialization {
  const roll = Math.random();
  if (roll < 0.25) return BotSpecialization.Hoarder;
  if (roll < 0.50) return BotSpecialization.Raider;
  if (roll < 0.70) return BotSpecialization.Fortress;
  if (roll < 0.85) return BotSpecialization.Ghost;
  return BotSpecialization.Balanced;
}

/**
 * Get resource range based on specialization and tier
 * 
 * @param specialization Bot type
 * @param tier Resource tier (1-3)
 * @returns Min and max resources for this bot
 */
export function getResourceRange(specialization: BotSpecialization, tier: number): { min: number; max: number } {
  const baseRanges = {
    [BotSpecialization.Hoarder]: { min: 50000, max: 150000 },
    [BotSpecialization.Fortress]: { min: 5000, max: 15000 },
    [BotSpecialization.Raider]: { min: 10000, max: 40000 },
    [BotSpecialization.Ghost]: { min: 20000, max: 80000 },
    [BotSpecialization.Balanced]: { min: 15000, max: 50000 }
  };

  const range = baseRanges[specialization];
  const tierMultiplier = 0.5 + (tier * 0.25); // Tier 1: 0.75x, Tier 2: 1.0x, Tier 3: 1.25x

  return {
    min: Math.floor(range.min * tierMultiplier),
    max: Math.floor(range.max * tierMultiplier)
  };
}

/**
 * Get resource regeneration rate per hour based on specialization
 * Full Permanence: Bots regenerate resources after defeat instead of despawning
 * 
 * @param specialization Bot type
 * @returns Percentage of max resources to regenerate per hour (0.05-0.20)
 */
export function getRegenerationRate(specialization: BotSpecialization): number {
  const rates = {
    [BotSpecialization.Hoarder]: 0.05,    // 5% per hour (20 hours to full)
    [BotSpecialization.Fortress]: 0.10,   // 10% per hour (10 hours to full)
    [BotSpecialization.Raider]: 0.15,     // 15% per hour (6.7 hours to full)
    [BotSpecialization.Ghost]: 0.20,      // 20% per hour (5 hours to full)
    [BotSpecialization.Balanced]: 0.10    // 10% per hour (10 hours to full)
  };
  return rates[specialization];
}

/**
 * Calculate defense multiplier based on specialization
 * 
 * @param specialization Bot type
 * @returns Defense multiplier (0.5x - 3.0x)
 */
export function getDefenseMultiplier(specialization: BotSpecialization): number {
  const multipliers = {
    [BotSpecialization.Hoarder]: 0.5,
    [BotSpecialization.Fortress]: 3.0,
    [BotSpecialization.Raider]: 1.0,
    [BotSpecialization.Ghost]: 0.8,
    [BotSpecialization.Balanced]: 1.0
  };
  return multipliers[specialization];
}

/**
 * Get movement pattern for bot type
 * 
 * @param specialization Bot type
 * @returns Movement pattern (stationary/roam/teleport)
 */
export function getMovementPattern(specialization: BotSpecialization): 'stationary' | 'roam' | 'teleport' {
  const patterns: Record<BotSpecialization, 'stationary' | 'roam' | 'teleport'> = {
    [BotSpecialization.Hoarder]: 'stationary',
    [BotSpecialization.Fortress]: 'stationary',
    [BotSpecialization.Raider]: 'roam',
    [BotSpecialization.Ghost]: 'teleport',
    [BotSpecialization.Balanced]: 'roam'
  };
  return patterns[specialization];
}

// ============================================================
// BOT REPUTATION SYSTEM
// ============================================================

/**
 * Calculate bot reputation based on times defeated
 * 
 * Tiers:
 * - Unknown: 0-5 defeats
 * - Notorious: 6-15 defeats (+25% loot)
 * - Infamous: 16-30 defeats (+50% loot)
 * - Legendary: 31+ defeats (+100% loot)
 * 
 * @param defeatedCount Number of times bot has been defeated
 * @returns Current reputation tier
 */
export function calculateReputation(defeatedCount: number): BotReputation {
  if (defeatedCount >= 31) return BotReputation.Legendary;
  if (defeatedCount >= 16) return BotReputation.Infamous;
  if (defeatedCount >= 6) return BotReputation.Notorious;
  return BotReputation.Unknown;
}

/**
 * Get loot bonus multiplier based on reputation
 * 
 * @param reputation Bot reputation tier
 * @returns Loot multiplier (1.0 - 2.0)
 */
export function getReputationLootBonus(reputation: BotReputation): number {
  const bonuses = {
    [BotReputation.Unknown]: 1.0,
    [BotReputation.Notorious]: 1.25,
    [BotReputation.Infamous]: 1.5,
    [BotReputation.Legendary]: 2.0
  };
  return bonuses[reputation];
}

// ============================================================
// MAP ZONE SYSTEM (9 zones, 50×50 each)
// ============================================================

/**
 * Calculate which zone a position belongs to
 * Map: 150×150 divided into 9 zones (50×50 each)
 * 
 * Zone Layout:
 * [0] [1] [2]
 * [3] [4] [5]
 * [6] [7] [8]
 * 
 * @param position Map coordinates
 * @returns Zone number (0-8)
 */
export function calculateZone(position: Position): number {
  const zoneX = Math.floor((position.x - 1) / 50);
  const zoneY = Math.floor((position.y - 1) / 50);
  return zoneY * 3 + zoneX;
}

/**
 * Get random position within a specific zone
 * 
 * @param zone Zone number (0-8)
 * @returns Random position in zone
 */
export function getRandomPositionInZone(zone: number): Position {
  const zoneX = zone % 3;
  const zoneY = Math.floor(zone / 3);
  
  const baseX = zoneX * 50 + 1;
  const baseY = zoneY * 50 + 1;
  
  return {
    x: baseX + Math.floor(Math.random() * 50),
    y: baseY + Math.floor(Math.random() * 50)
  };
}

// ============================================================
// BOT CREATION
// ============================================================

/**
 * Create a new bot player with randomized stats
 * Full Permanence: permanentBase always true
 * 
 * @param zone Target zone for bot (0-8, or null for random)
 * @param specialization Override specialization (or null for random)
 * @param isSpecial Create as Beer Base (3x resources)
 * @returns Bot player object ready for database insert
 */
export async function createBot(
  zone: number | null = null,
  specialization: BotSpecialization | null = null,
  isSpecial: boolean = false
): Promise<Partial<Player>> {
  const botSpec = specialization || getRandomSpecialization();
  const targetZone = zone ?? Math.floor(Math.random() * 9);
  const tier = Math.floor(Math.random() * 3) + 1; // 1-3
  
  const position = getRandomPositionInZone(targetZone);
  const resourceRange = getResourceRange(botSpec, tier);
  const baseResources = Math.floor(Math.random() * (resourceRange.max - resourceRange.min + 1)) + resourceRange.min;
  const resources = isSpecial ? baseResources * 3 : baseResources;
  
  const botConfig: BotConfig = {
    specialization: botSpec,
    tier,
    lastGrowth: new Date(),
    attackCooldown: new Date(),
    isSpecialBase: isSpecial,
    defeatedCount: 0,
    reputation: BotReputation.Unknown,
    movement: getMovementPattern(botSpec),
    zone: targetZone,
    nestAffinity: null,
    bountyValue: 0,
    permanentBase: true, // FULL PERMANENCE
  };
  
  const defenseMultiplier = getDefenseMultiplier(botSpec);
  const baseDefense = 100 + (tier * 50);
  
  return {
    username: generateBotName(),
    email: `bot-${Date.now()}-${Math.random()}@darkframe.internal`,
    password: 'BOT_ACCOUNT', // Bots cannot log in
    base: position,
    currentPosition: position,
    resources: {
      metal: resources,
      energy: resources
    },
    bank: {
      metal: 0,
      energy: 0,
      lastDeposit: null
    },
    rank: tier,
    inventory: {
      items: [],
      capacity: 0,
      metalDiggerCount: 0,
      energyDiggerCount: 0
    },
    gatheringBonus: { metalBonus: 0, energyBonus: 0 },
    activeBoosts: { gatheringBoost: null, expiresAt: null },
    shrineBoosts: [],
    units: [],
    totalStrength: 0,
    totalDefense: Math.floor(baseDefense * defenseMultiplier),
    xp: 0,
    level: tier * 5,
    researchPoints: 0,
    unlockedTiers: [],
    isBot: true,
    botConfig,
    createdAt: new Date()
  };
}

/**
 * Regenerate bot resources based on time elapsed and specialization
 * Full Permanence: Called hourly to restore resources after defeats
 * 
 * @param bot Bot player to regenerate
 * @returns Updated resource amounts
 */
export async function regenerateBotResources(bot: Player): Promise<{ metal: number; energy: number }> {
  if (!bot.isBot || !bot.botConfig) {
    throw new Error('regenerateBotResources called on non-bot player');
  }

  const now = new Date();
  const lastRegen = bot.botConfig.lastResourceRegen || bot.botConfig.lastGrowth;
  const hoursSinceRegen = (now.getTime() - lastRegen.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceRegen < 1) {
    return bot.resources; // Not enough time passed
  }

  const regenRate = getRegenerationRate(bot.botConfig.specialization);
  const resourceRange = getResourceRange(bot.botConfig.specialization, bot.botConfig.tier);
  const maxResources = bot.botConfig.isSpecialBase ? resourceRange.max * 3 : resourceRange.max;
  
  const hoursToRegen = Math.floor(hoursSinceRegen);
  const regenAmount = Math.floor(maxResources * regenRate * hoursToRegen);
  
  const newMetal = Math.min(bot.resources.metal + regenAmount, maxResources);
  const newEnergy = Math.min(bot.resources.energy + regenAmount, maxResources);
  
  return { metal: newMetal, energy: newEnergy };
}

// ============================================================
// BEER BASE SYSTEM
// ============================================================

/**
 * Check if it's time to respawn Beer Bases (Sunday 4 AM)
 * 
 * @returns True if it's Beer Base respawn time
 */
export function isBeerBaseRespawnTime(): boolean {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() === 4; // Sunday at 4 AM
}

/**
 * Remove all current Beer Bases from database
 * Called during weekly respawn
 */
export async function removeAllBeerBases(): Promise<number> {
  const db = await getDatabase();
  const result = await db.collection('players').deleteMany({
    isBot: true,
    'botConfig.isSpecialBase': true
  });
  return result.deletedCount;
}

/**
 * Spawn new Beer Bases at random locations
 * 
 * @param count Number of Beer Bases to spawn
 * @returns Array of created Beer Base bots
 */
export async function spawnBeerBases(count: number): Promise<Partial<Player>[]> {
  const beerBases: Partial<Player>[] = [];
  
  for (let i = 0; i < count; i++) {
    const bot = await createBot(null, null, true);
    beerBases.push(bot);
  }
  
  return beerBases;
}

// ============================================================
// IMPLEMENTATION NOTES:
// ============================================================
// - Full Permanence Model: Regular bots never despawn, regenerate resources hourly
// - Beer Bases despawn when defeated, respawn weekly (Sunday 4 AM)
// - All bots have permanentBase=true for static base locations
// - Resource regeneration rates: 5-20% per hour based on specialization
// - Reputation system tracks defeats for bonus loot (up to 2x)
// - Zone system ensures even distribution across 150×150 map
// - Admin panel will control all bot parameters via configuration
// ============================================================
