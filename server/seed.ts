import { db, initializeDatabase, closeDatabase } from './db.js';
import { hash } from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { canteenMenu, menuCategories } from './catalog.js';
export async function seed() {
  if (process.env.NODE_ENV === 'production' && !process.env.DEMO_PASSWORD) throw new Error('Explicit DEMO_PASSWORD required to seed production');
  const password = await hash(process.env.DEMO_PASSWORD || 'CampusBite123!', 12);
  for (const [role,name,email,rollNumber] of [['STUDENT','Aarav Sharma','student@campusbite.edu','CS2026001'],['STUDENT','Riya Singh','riya@campusbite.edu','CS2026002'],['STAFF','Kitchen team','staff@campusbite.edu','STAFF01'],['ADMIN','Campus admin','admin@campusbite.edu','ADMIN01']]) {
    const accountPassword=role==='ADMIN'&&process.env.ADMIN_INITIAL_PASSWORD?await hash(process.env.ADMIN_INITIAL_PASSWORD,12):role==='STAFF'&&process.env.STAFF_INITIAL_PASSWORD?await hash(process.env.STAFF_INITIAL_PASSWORD,12):password;
    await db.user.upsert({ where:{email}, update:{}, create:{role,name,email,rollNumber,password:accountPassword} });
  }
  await db.canteenSettings.upsert({where:{id:'main'},update:{},create:{id:'main'}});
  for(const c of menuCategories)await db.category.upsert({where:{id:c.name},update:{},create:{id:c.name,name:c.name}});
  for(const item of canteenMenu)await db.menuItem.upsert({where:{id:item.id},update:{},create:item});
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await initializeDatabase(); await seed(); console.log(`Demo accounts and ${canteenMenu.length} canteen items seeded. See README for local credentials.`); await closeDatabase();
}


