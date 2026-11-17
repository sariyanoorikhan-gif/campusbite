import { db,initializeDatabase,closeDatabase } from '../server/db';
import assert from 'node:assert/strict';
await initializeDatabase();
assert.equal(await db.order.count(),Number(process.env.EXPECTED_ORDERS));
assert.ok(await db.session.count()>0);
console.log('Fresh-process disk persistence verified');
await closeDatabase();
