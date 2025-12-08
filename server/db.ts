import * as schema from "@shared/schema";

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if using Neon (cloud) or local PostgreSQL
const isNeonDatabase = process.env.DATABASE_URL.includes('neon.tech');

let pool: any;
let db: any;

if (isNeonDatabase) {
  // Use Neon serverless driver for cloud database
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = (await import('ws')).default;
  
  neonConfig.webSocketConstructor = ws;
  
  pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  db = drizzle(pool, { schema });
  console.log('🌐 Connected to Neon cloud database');
} else {
  // Use standard pg driver for local PostgreSQL
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  
  pool = new pg.default.Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  
  db = drizzle(pool, { schema });
  console.log('🏠 Connected to local PostgreSQL database');
}

// Graceful shutdown - close pool on process termination
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing database pool...');
  await pool.end();
  process.exit(0);
});

export { pool, db };