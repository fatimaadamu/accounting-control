require('dotenv').config();
const app = require('./src/app');
const { runMigrations } = require('./src/config/migrate');
const db = require('./src/config/database');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('Starting Accounting Control Server...');
    
    // Test database connection
    console.log('Testing database connection...');
    await db.query('SELECT NOW()');
    console.log('✓ Database connection successful');

    // Run migrations
    console.log('\nRunning database migrations...');
    await runMigrations();
    console.log('✓ Database migrations completed\n');

    // Start server
    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`💊 Health Check: http://localhost:${PORT}/api/health`);
      console.log('═══════════════════════════════════════════════\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  db.pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  db.pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

startServer();
