# CampusBite hosted deployment

Live demo: https://campusbite-eta-lilac.vercel.app

Management: https://campusbite-eta-lilac.vercel.app/manage

Vercel dashboard: https://vercel.com/sariya1/campusbite

## Resources

- Vercel team: Sariya (`sariya1`).
- Vercel project: `campusbite`, ID `prj_HDInjSphNBhENFOlUXExgoHv44eK`.
- Production deployment: `dpl_B3oqBATZ7cmaMCpDoC8CZnDBajdM`, READY.
- PostgreSQL: Neon project `campusbite`, ID `little-mouse-85017555`.
- Node.js 24, Vite frontend and Express API deployed as a Vercel Function.
- Database and session secrets are stored as encrypted Vercel environment variables, not in the source upload.

## Sign in

Student demo: `student@campusbite.edu` with password `CampusBite123!`.

Admin/staff accounts have distinct randomly generated hosted passwords. They are saved only in `PRIVATE-ACCESS.txt` in the Desktop CampusBite folder. The local demo still uses the local credentials in README. Do not publish the private credentials file.

This is a college-project demo, with a 24-hour demo schedule so ordering can be tested at night. Change canteen settings to real campus hours before actual use. The current payment flow is explicitly DEMO prepaid checkout; no real money is processed. See PAYMENTS-BUYER-SETUP.md for buyer activation and refund requirements. One order in the hosted database was used to verify collection and is labeled as a deployment verification test.

## Redeployment and migrations

The current release was uploaded through the connected Vercel tool; it is not linked to a Git repository. Source is in the Desktop folder, with a synchronized copy in the original project folder. Future source changes require a new deployment through Vercel or the authenticated Vercel CLI.

The Vercel project builds with `npm ci` then `npm run build`. `api/index.ts` exports the Express app; `vercel.json` routes API traffic separately from the React SPA. Runtime writes use Neon, not the Vercel filesystem. Explicit `.js` relative imports and the Prisma generator's `importFileExtension = "js"` are needed for the deployed ESM function.

Apply schema migrations to the intended database before deploying code that requires them. Use a direct Neon connection for migrations and the pooled URL for the app. The initial three migrations were applied successfully; migration credentials are not saved in this document. Never seed the hosted admin account with the public local-demo password.

## Remaining scope

Real online payments/refunds, email verification, password recovery, camera QR scanning, automatic no-show processing, shared rate-limit storage and external monitoring are not included. Student menu and admin UI use the same application as the previously inspected local desktop/mobile interface. The hosted API flow was tested against actual PostgreSQL. See VERIFICATION.md.
