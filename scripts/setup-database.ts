#!/usr/bin/env -S deno run -A

import "https://deno.land/std@0.208.0/dotenv/load.ts";
import { neon } from '@neondatabase/serverless';

async function setupDatabase() {
  const databaseUrl = Deno.env.get('DATABASE_URL');
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not found');
    console.log('📝 Please add DATABASE_URL to your .env file');
    console.log('💡 Example: DATABASE_URL=postgresql://user:pass@host/db?sslmode=require');
    Deno.exit(1);
  }

  console.log('🚀 Setting up Neon PostgreSQL database...');
  
  try {
    const sql = neon(databaseUrl);
    
    // Test connection first
    console.log('🔗 Testing database connection...');
    await sql`SELECT 1 as test`;
    console.log('✅ Database connection successful');
    
    // Read and execute schema
    console.log('📖 Reading database schema...');
    const schemaPath = new URL('../database/schema.sql', import.meta.url);
    const schemaContent = await Deno.readTextFile(schemaPath);
    
    console.log('🏗️ Creating database schema...');
    
    // Split the schema into individual statements
    const statements = schemaContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    let successCount = 0;
    
    for (const statement of statements) {
      try {
        if (statement.trim()) {
          await sql.unsafe(statement);
          successCount++;
        }
      } catch (error) {
        // Some statements might fail if objects already exist
        if (!error.message.includes('already exists')) {
          console.warn(`⚠️ Statement failed: ${error.message}`);
        }
      }
    }
    
    console.log(`✅ Executed ${successCount} database statements`);
    
    // Verify tables were created
    console.log('🔍 Verifying database setup...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    console.log('📊 Created tables:');
    for (const table of tables) {
      console.log(`   • ${table.table_name}`);
    }
    
    // Check views
    const views = await sql`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    if (views.length > 0) {
      console.log('👁️ Created views:');
      for (const view of views) {
        console.log(`   • ${view.table_name}`);
      }
    }
    
    // Insert initial data if needed
    console.log('🌱 Setting up initial data...');
    const existingState = await sql`SELECT COUNT(*) as count FROM app_state`;
    
    if (existingState[0].count === 0) {
      await sql`
        INSERT INTO app_state (key, value) VALUES 
        ('last_processed_tweet_id', '{}'),
        ('polling_status', '{"enabled": false, "last_run": null}'),
        ('rate_limit_status', '{"remaining": 1000, "reset_time": null}')
      `;
      console.log('✅ Initial app state created');
    } else {
      console.log('ℹ️ App state already exists, skipping initial data');
    }
    
    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📊 Database Statistics:');
    console.log(`   Tables: ${tables.length}`);
    console.log(`   Views: ${views.length}`);
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Test your connection: deno run -A scripts/test-database.ts');
    console.log('   2. Update your application to use the database');
    console.log('   3. Monitor your database at console.neon.tech');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Verify your DATABASE_URL is correct');
    console.log('   2. Check that your Neon database is running');
    console.log('   3. Ensure your IP is allowlisted (usually automatic)');
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await setupDatabase();
} 