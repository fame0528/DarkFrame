/**
 * @file scripts/fix-player-schema.ts
 * @created 2025-10-16
 * @overview Migration script to fix players missing inventory/gatheringBonus
 * 
 * Run with: node scripts/fix-player-schema.js
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://fame:Sthcnh4525!@darkframe.wtlbe6a.mongodb.net/darkframe?retryWrites=true&w=majority&appName=darkframe';

async function fixPlayerSchema() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔧 Starting player schema migration...');
    
    await client.connect();
    const db = client.db('darkframe');
    const playersCollection = db.collection('players');
    
    // Find players without inventory or gatheringBonus
    const playersToFix = await playersCollection.find({
      $or: [
        { inventory: { $exists: false } },
        { gatheringBonus: { $exists: false } },
        { activeBoosts: { $exists: false } }
      ]
    }).toArray();
    
    console.log(`📊 Found ${playersToFix.length} players to fix`);
    
    for (const player of playersToFix) {
      const updates = {};
      
      if (!player.inventory) {
        updates.inventory = {
          items: [],
          capacity: 2000,
          metalDiggerCount: 0,
          energyDiggerCount: 0
        };
        console.log(`  ✅ Adding inventory to ${player.username}`);
      }
      
      if (!player.gatheringBonus) {
        updates.gatheringBonus = {
          metalBonus: 0,
          energyBonus: 0
        };
        console.log(`  ✅ Adding gatheringBonus to ${player.username}`);
      }
      
      if (!player.activeBoosts) {
        updates.activeBoosts = {
          gatheringBoost: null,
          expiresAt: null
        };
        console.log(`  ✅ Adding activeBoosts to ${player.username}`);
      }
      
      // Update player
      await playersCollection.updateOne(
        { username: player.username },
        { $set: updates }
      );
    }
    
    console.log('✅ Player schema migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

fixPlayerSchema();
