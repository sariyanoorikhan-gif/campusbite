import {db,initializeDatabase,closeDatabase} from './db.js';
import {canteenMenu,menuCategories,retiredMenuIds} from './catalog.js';
await initializeDatabase();
await db.$transaction(async tx=>{
  for(const c of menuCategories)await tx.category.upsert({where:{id:c.name},update:{},create:{id:c.name,name:c.name}});
  for(const item of canteenMenu)await tx.menuItem.upsert({where:{id:item.id},update:{...item,archived:false},create:item});
  await tx.menuItem.updateMany({where:{id:{in:retiredMenuIds}},data:{archived:true,available:false}});
},{timeout:30000});
console.log(`Updated ${canteenMenu.length} canteen dishes. Archived retired items; order history and stock preserved.`);
await closeDatabase();
