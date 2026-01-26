const db = require('../config/database');

async function runMigrations() {
  try {
    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Migrations table ready');

    // Get list of executed migrations
    const { rows: executedMigrations } = await db.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const executedNames = executedMigrations.map(m => m.name);

    // Import and run migrations
    const fs = require('fs');
    const path = require('path');
    const migrationsDir = path.join(__dirname, '../migrations');
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort();

    for (const file of migrationFiles) {
      const migrationName = file.replace('.js', '');
      
      if (!executedNames.includes(migrationName)) {
        console.log(`Running migration: ${migrationName}`);
        const migration = require(path.join(migrationsDir, file));
        await migration.up(db);
        await db.query('INSERT INTO migrations (name) VALUES ($1)', [migrationName]);
        console.log(`✓ Migration completed: ${migrationName}`);
      } else {
        console.log(`⊙ Migration already executed: ${migrationName}`);
      }
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

module.exports = { runMigrations };
