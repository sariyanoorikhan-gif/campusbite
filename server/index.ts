import 'dotenv/config';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { initializeDatabase,closeDatabase } from './db.js';

await initializeDatabase();
const app=createApp();
if(process.env.NODE_ENV==='production') {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));
} else {
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}
const port=Number(process.env.PORT||5173);
const server=app.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`CampusBite ready: http://localhost:${port}`));
async function shutdown(){server.close();await closeDatabase();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

