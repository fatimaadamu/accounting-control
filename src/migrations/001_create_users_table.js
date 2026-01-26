/**
 * Initial migration - Create users table
 */

async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(50) DEFAULT 'user',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index on email for faster lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `);

  console.log('Users table created successfully');
}

async function down(db) {
  await db.query('DROP TABLE IF EXISTS users CASCADE');
  console.log('Users table dropped');
}

module.exports = { up, down };
