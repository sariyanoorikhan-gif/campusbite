import { menuCategories } from '../src/menuCategories.js';
export { menuCategories };
const photo=(id:string)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const images={
  dosa:photo('photo-1743615467363-250466982515'),idli:photo('photo-1630383249896-424e482df921'),
  sandwich:photo('photo-1528735602780-2552fd46c7af'),rice:photo('photo-1512058564366-18510be2db19'),
  noodles:photo('photo-1780493219430-c3e45cd17df8'),samosa:photo('photo-1601050690597-df0568f70950'),
  coffee:photo('photo-1509042239860-f550ce710b93'),coldCoffee:photo('photo-1461023058943-07fcbe16d735'),
  burger:photo('photo-1568901346375-23c9450c58cd'),lime:photo('photo-1513558161293-cdaf765edfd7'),
  pasta:photo('photo-1570549986390-6bd150ac3515'),pizza:photo('photo-1788537894898-6e90a3abeea1'),
  fries:photo('photo-1676566399758-51b0d3927d48'),chocolate:photo('photo-1572490122747-3968b75cc699'),
  strawberry:photo('photo-1686638745403-d21193f16b2f'),mango:photo('photo-1655476148304-1d1214683af4'),
  paratha:photo('photo-1683533761804-5fc12be0f684'),chole:photo('photo-1780504863220-514ba37dcba0'),
  tea:photo('photo-1544787219-7f47ccb76574'),
};
type Row=[string,string,string,number,string,string,string,number];
const rows:Row[]=[
  ['food-1','Masala dosa','South Indian',60,'Crispy golden dosa with potato masala, sambar and chutney.','Rice, lentils, potato, mustard',images.dosa,12],
  ['food-2','Grilled veggie sandwich','Snacks & Fries',65,'Toasted bread, crunchy vegetables, cheese and green chutney.','Wheat bread, milk cheese, tomato, cucumber',images.sandwich,8],
  ['food-3','Veg fried rice','Rice & Noodles',80,'Wok-tossed rice with crunchy vegetables and a light soy seasoning.','Rice, vegetables, soy',images.rice,12],
  ['food-4','Hakka noodles','Rice & Noodles',85,'Street-style vegetable noodles, tossed fresh in the wok.','Wheat noodles, vegetables, soy',images.noodles,12],
  ['food-5','Punjabi samosa','Snacks & Fries',20,'A crisp potato-and-pea samosa with chutney.','Wheat, potato, peas',images.samosa,5],
  ['food-7','Filter coffee','Coffee & Tea',25,'Freshly brewed filter coffee with hot milk.','Coffee, milk',images.coffee,4],
  ['food-8','Campus veggie burger','Burgers & Pizza',70,'A crisp veggie patty, fresh greens and house sauce in a soft bun.','Wheat bun, vegetables, milk cheese',images.burger,10],
  ['food-9','Idli sambar','South Indian',40,'Soft steamed idlis served with sambar and coconut chutney.','Rice, lentils, coconut, mustard',images.idli,6],
  ['food-10','Butter plain dosa','South Indian',45,'Crisp plain dosa with a brush of butter, sambar and chutney.','Rice, lentils, milk butter',images.dosa,10],
  ['food-11','Onion uttapam','South Indian',55,'Fluffy rice pancake topped with onion, herbs and green chilli.','Rice, lentils, onion',images.dosa,12],
  ['food-13','Aloo paratha','Parathas & Chole',50,'Hot tawa paratha filled with spiced potato, served with pickle.','Wheat, potato, spices, milk butter',images.paratha,10],
  ['food-16','Paneer roll','Snacks & Fries',75,'A soft wrap with spiced paneer, onions and chutney.','Wheat, milk paneer, vegetables',images.sandwich,10],
  ['food-18','Masala chai','Coffee & Tea',15,'Fresh milk tea brewed with ginger and cardamom.','Tea, milk, ginger, cardamom',images.tea,4],
  ['food-19','Fresh lime soda','Shakes',35,'Fresh lime and chilled soda, sweet or salted.','Lime, soda water, sugar or salt',images.lime,4],
  ['food-20','Cold coffee','Coffee & Tea',55,'Chilled coffee blended with milk and ice.','Coffee, milk, sugar',images.coldCoffee,5],
  ['food-21','Sandwich + coffee combo','Combos',80,'A grilled veggie sandwich paired with a hot coffee.','Wheat bread, milk cheese, coffee, vegetables',images.sandwich,10],
  ['canteen-white-pasta','White-sauce pasta','Pasta',100,'Creamy white-sauce penne with sweetcorn, peppers and herbs.','Wheat pasta, milk, cheese, sweetcorn, bell peppers',images.pasta,12],
  ['canteen-veggie-pizza','Veggie pizza','Burgers & Pizza',120,'A cheesy pizza topped with onion, capsicum, corn and tomato.','Wheat, milk cheese, tomato, bell peppers, corn',images.pizza,15],
  ['canteen-margherita','Margherita pizza','Burgers & Pizza',100,'Classic tomato sauce and melted cheese on a golden pizza base.','Wheat, milk cheese, tomato, herbs',images.pizza,15],
  ['canteen-fries','French fries','Snacks & Fries',50,'Golden, lightly salted potato fries with ketchup.','Potato, vegetable oil, salt, tomato ketchup',images.fries,7],
  ['canteen-peri-fries','Peri-peri fries','Snacks & Fries',60,'Fresh crispy fries tossed in tangy peri-peri seasoning.','Potato, vegetable oil, peri-peri spices',images.fries,7],
  ['canteen-chocolate-shake','Chocolate shake','Shakes',75,'A chilled, creamy chocolate milkshake for your next break.','Milk, cocoa, sugar',images.chocolate,5],
  ['canteen-strawberry-shake','Strawberry shake','Shakes',80,'A refreshing pink strawberry shake, blended with chilled milk.','Milk, strawberry, sugar',images.strawberry,5],
  ['canteen-mango-shake','Mango shake','Shakes',80,'Sweet mango blended with chilled milk into a smooth shake.','Milk, mango, sugar',images.mango,5],
  ['canteen-delhi-coffee','Delhi-style coffee','Coffee & Tea',35,'Hot canteen-style coffee, beaten with milk until frothy.','Coffee, milk, sugar',images.coffee,5],
  ['canteen-tea','Classic tea','Coffee & Tea',12,'A simple, fresh cup of hot milk tea.','Tea, milk, sugar',images.tea,4],
  ['canteen-chole-bhature','Chole bhature','Parathas & Chole',80,'Puffy bhature with spiced chole, onion and pickle.','Wheat, chickpeas, onion, spices',images.chole,12],
  ['canteen-schezwan-rice','Schezwan fried rice','Rice & Noodles',90,'Spicy wok-tossed vegetable rice with Schezwan sauce.','Rice, vegetables, soy, chilli, garlic',images.rice,12],
  ['canteen-paneer-paratha','Paneer paratha','Parathas & Chole',65,'A golden tawa paratha filled with spiced paneer, with pickle.','Wheat, milk paneer, onion, spices, milk butter',images.paratha,12],
  ['canteen-pyaaz-paratha','Pyaaz paratha','Parathas & Chole',45,'A crisp onion-stuffed paratha with herbs and green chilli.','Wheat, onion, coriander, spices, milk butter',images.paratha,10],
];
export const retiredMenuIds=['food-6','food-12','food-14','food-15','food-17','food-22'];
export const canteenMenu=rows.map(([id,name,categoryId,price,description,ingredients,image,prepMinutes])=>({id,name,categoryId,price:price*100,description,ingredients,image,prepMinutes,vegetarian:true,allergens:[/wheat|pasta|noodles/i.test(ingredients)?'Contains gluten.':'',/milk|cheese|paneer|butter/i.test(ingredients)?'Contains milk.':'',/soy/i.test(ingredients)?'Contains soy.':'','Ask staff about cross-contact.'].filter(Boolean).join(' ')}));
