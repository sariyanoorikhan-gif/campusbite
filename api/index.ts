import { createApp } from '../server/app.js';
if (!process.env.DATABASE_URL) throw new Error('A hosted PostgreSQL DATABASE_URL is required on Vercel.');
export default createApp();

