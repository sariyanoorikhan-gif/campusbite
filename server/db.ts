import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if(process.env.VERCEL && !url) throw new Error('Vercel requires a hosted PostgreSQL DATABASE_URL.');
if (!url && process.env.DATABASE_DIR !== 'memory://') mkdirSync(resolve(process.env.DATABASE_DIR || '.data/campusbite'), { recursive:true });
export const embedded = url ? null : new PGlite(process.env.DATABASE_DIR || '.data/campusbite');
export const db = new PrismaClient({ adapter: url ? new PrismaPg({ connectionString: url }) : new PrismaPGlite(embedded!) });

export async function initializeDatabase() {
  if (embedded) {
    await embedded.waitReady;
    await embedded.exec('CREATE TABLE IF NOT EXISTS campusbite_migrations (name TEXT PRIMARY KEY)');
    for (const name of (await readdir(resolve('prisma/migrations'))).filter(n => /^\d/.test(n)).sort()) {
      const exists = await embedded.query('SELECT name FROM campusbite_migrations WHERE name=$1', [name]);
      if (!exists.rows.length) {
        const sql = await readFile(resolve('prisma/migrations', name, 'migration.sql'), 'utf8');
        await embedded.transaction(async tx => { await tx.exec(sql); await tx.query('INSERT INTO campusbite_migrations(name) VALUES ($1)', [name]); });
      }
    }
  }
}
export async function closeDatabase() { await db.$disconnect(); if (embedded) await embedded.close(); }

