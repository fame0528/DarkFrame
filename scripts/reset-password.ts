/**
 * @file scripts/reset-password.ts
 * @created 2025-10-31
 * @overview Script to reset a user's password
 * 
 * Usage:
 *   tsx scripts/reset-password.ts <username> <new-password>
 *   
 * Example:
 *   tsx scripts/reset-password.ts FAME mynewpassword123
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { hashPassword } from '../lib/authService';
import { getCollection } from '../lib/mongodb';

async function resetPassword(username: string, newPassword: string): Promise<void> {
  console.log('\n🔐 Password Reset Utility\n');
  console.log(`Target User: ${username}`);
  console.log(`New Password: ${'*'.repeat(newPassword.length)}\n`);

  try {
    // Hash the new password
    console.log('⏳ Hashing password...');
    const hashedPassword = await hashPassword(newPassword);
    console.log('✅ Password hashed successfully');

    // Update the database
    console.log('⏳ Connecting to database...');
    const playersCollection = await getCollection('players');
    
    const result = await playersCollection.updateOne(
      { username },
      { $set: { password: hashedPassword } }
    );

    if (result.matchedCount === 0) {
      console.error(`❌ Error: User "${username}" not found in database`);
      process.exit(1);
    }

    if (result.modifiedCount === 0) {
      console.warn(`⚠️  Warning: Password was not changed (may already be set to this value)`);
    } else {
      console.log(`✅ Password updated successfully for user "${username}"`);
    }

    console.log('\n✨ Password reset complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error resetting password:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error('\n❌ Usage: tsx scripts/reset-password.ts <username> <new-password>\n');
  console.error('Example: tsx scripts/reset-password.ts FAME mynewpassword123\n');
  process.exit(1);
}

const [username, newPassword] = args;

if (!username || !newPassword) {
  console.error('\n❌ Both username and password are required\n');
  process.exit(1);
}

if (newPassword.length < 6) {
  console.error('\n❌ Password must be at least 6 characters long\n');
  process.exit(1);
}

// Run the password reset
resetPassword(username, newPassword);
