# Revised college canteen menu

Published 17 November 2026 at https://campusbite-eta-lilac.vercel.app . Deployment: dpl_52yZs3dWf6AoJWySk87TYPQw5Uj5, READY.

30 sample-priced, individually orderable items across South Indian, Pasta, Burgers & Pizza, Snacks & Fries, Shakes, Coffee & Tea, Rice & Noodles, Parathas & Chole, and Combos.

Includes masala/plain dosa, idli sambar, uttapam, white-sauce pasta, veggie burgers/pizza, fries, chocolate/strawberry/mango shakes, hot and cold coffee, Delhi-style coffee, chai, chole bhature, veg fried rice, Schezwan fried rice, and aloo/paneer/pyaaz parathas. Prices are illustrative and editable in admin.

The live catalog was updated in one transaction. Existing IDs were retained for continuing dishes. Thali, chole-rice bowls, rajma chawal and other retired menu entries were archived, with historical order snapshots, stock records and account data preserved. New local installs use server/catalog.ts. Normal seeding still preserves admin edits. server/update-menu.ts applies the revised catalog explicitly to a configured local/database instance without resetting stock or accounts.

Verification: production /api/menu returned 30 active dishes, all specifically requested additions were present, no active thali was present, and the homepage bundle referenced /canteen-bites-hero.jpg. The JPEG returned HTTP 200. Production build and all 14 integration tests passed, including menu-presence checks and the full order/payment/pickup lifecycle.

## Hero asset

Saved project asset: C:/Users/Sariya Noori Khan/OneDrive/Desktop/CampusBite/public/canteen-bites-hero.jpg . Created using the built-in image generation tool, then JPEG encoded for web delivery. Illustrative image, not a photograph of the actual canteen.

Prompt: Photorealistic editorial hero photograph of modest Indian college canteen quick bites on separate small plates: masala dosa with chutney/sambar, a veggie burger with fries, a small bowl of white-sauce pasta, and a glass of iced cold coffee. Casual campus cafe, cream tabletop, natural window light, warm colors and realistic affordable portions. Generous margins for responsive cropping. No thali, roti/rice meal, text, logos or people.

## Additional illustrative image sources

All external menu photographs are served from images.unsplash.com; source image identifiers are in server/catalog.ts. Related variants share representative photos. These are sample visuals; replace them with real canteen photos for an actual campus launch.

- Pasta: https://unsplash.com/photos/plate-of-white-pasta-with-red-bell-pepper-huE4NUt2gq8
- Pizza: https://unsplash.com/photos/pizza-with-vegetables-and-pesto-HIQ8ssmoPWQ
- Strawberry shake: https://unsplash.com/photos/a-strawberry-milkshake-with-whipped-cream-and-a-straw-smsivJclnQM
- Mango shake: https://unsplash.com/photos/a-glass-with-a-liquid-in-it-qaE2Tqwgzic
- Fries: https://unsplash.com/photos/a-basket-filled-with-french-fries-next-to-a-bowl-of-ketchup-QHE-BP6QcOE
- Paratha, chole bhature and chocolate shake free-image collections: https://unsplash.com/s/photos/aloo-paratha , https://unsplash.com/s/photos/chole-bhature , https://unsplash.com/s/photos/chocolate-milkshake .

## Local database note

The existing Desktop embedded database was found with a stale lock and Windows/OneDrive permissions preventing restart. Its data was preserved; it was not replaced or reset. Isolated local test databases work and passed all tests. The hosted Neon database and public website are unaffected. Use a separate PostgreSQL database (README Docker setup) for dependable local use on a synchronized OneDrive workspace.
