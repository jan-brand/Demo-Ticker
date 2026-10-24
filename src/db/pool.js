import 'dotenv/config';
import pg from 'pg';

const { Pool, types } = pg;

// Return DATE as 'YYYY-MM-DD' and TIME as 'HH:MM' instead of timezone-shifted Date objects.
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIME, (value) => value.slice(0, 5));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_SIZE ?? 5),
});
