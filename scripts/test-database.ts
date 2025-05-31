#!/usr/bin/env -S deno run -A

import "https://deno.land/std@0.208.0/dotenv/load.ts";
import { initDatabase, getDatabase } from '../src/database.ts';

async function testDatabase() {
  const databaseUrl = Deno.env.get('DATABASE_URL');
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not found');
    console.log('📝 Please add DATABASE_URL to your .env file');
    return;
  }

  console.log('🧪 Testing Neon PostgreSQL connection...');
  
  try {
    // Initialize database
    const db = initDatabase(databaseUrl);
    
    // Test basic connection
    console.log('🔗 Testing basic connection...');
    const isHealthy = await db.healthCheck();
    
    if (!isHealthy) {
      console.error('❌ Database health check failed');
      return;
    }
    
    console.log('✅ Database connection successful');
    
    // Test database stats
    console.log('📊 Getting database statistics...');
    const stats = await db.getStats();
    
    console.log('📈 Database Statistics:');
    console.log(`   Twitter Users: ${stats.twitter_users}`);
    console.log(`   Ethos Users: ${stats.ethos_users}`);
    console.log(`   Tweets: ${stats.tweets}`);
    console.log(`   Validations: ${stats.validations}`);
    console.log(`   Saved Tweets: ${stats.saved_tweets}`);
    console.log(`   Commands: ${stats.commands}`);
    
    // Test app state
    console.log('🔧 Testing app state operations...');
    await db.setAppState('test_key', { timestamp: new Date().toISOString(), test: true });
    const testState = await db.getAppState('test_key');
    
    if (testState && testState.test) {
      console.log('✅ App state operations working');
    } else {
      console.warn('⚠️ App state operations may have issues');
    }
    
    // Clean up test data
    await db.client`DELETE FROM app_state WHERE key = 'test_key'`;
    
    console.log('\n🎉 All database tests passed!');
    console.log('🚀 Your Neon database is ready to use');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Verify your DATABASE_URL is correct');
    console.log('   2. Run: deno run -A scripts/setup-database.ts');
    console.log('   3. Check Neon dashboard for issues');
  }
}

if (import.meta.main) {
  await testDatabase();
} 