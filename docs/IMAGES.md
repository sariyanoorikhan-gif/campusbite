# Food imagery

The demo loads photographs over HTTPS from images.unsplash.com, under the [Unsplash license](https://unsplash.com/license). They are illustrative sample assets, not photographs of a real college’s food. No paid Unsplash+ assets are intentionally used. Replace representative photos with the actual canteen menu before launch; related dishes currently share photographs. The local SVG fallback was created for this project.

| Used for | Unsplash image identifier / source |
| --- | --- |
| Dosa | photo-1743615467363-250466982515 — [Zoshua Colah, dosa with dipping sauces](https://unsplash.com/photos/a-dosa-is-served-with-three-dipping-sauces-4Au4dHNjt7w) |
| Sandwiches | photo-1528735602780-2552fd46c7af |
| Rice bowls | photo-1512058564366-18510be2db19 |
| Noodles | photo-1780493219430-c3e45cd17df8 |
| Samosa | photo-1601050690597-df0568f70950 |
| Hero and meal plates | photo-1546833999-b9f581a1996d |
| Coffee and tea | photo-1509042239860-f550ce710b93 |
| Burger | photo-1568901346375-23c9450c58cd |
| Lime drink | photo-1513558161293-cdaf765edfd7 |

URLs, crop, dimensions and quality settings are stored in server/seed.ts. Admins can replace image URLs. Local fallback ensures the app still works without external image connectivity.

The current banner is the generated canteen quick-bites asset public/canteen-bites-hero.jpg. External menu URLs are now defined in server/catalog.ts. See CANTEEN-MENU.md for new image sources and the generation prompt. Earlier thali images are retired from the current site.
