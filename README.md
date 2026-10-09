# NETVYL Business Management Platform — V36 Final

NETVYL is a browser-first multi-tenant print-business operating platform for the web, with Supabase as the source of truth. The project is optimized for normal online hosting and clean browser use, while optional desktop/mobile packaging remains available only when needed.

## What is included

- Tenant-isolated organizations and organization-scoped data.
- NETVYL Master Admin platform controls, support mode, organization lifecycle, licenses, subscriptions and devices.
- Company Administrator controls for staff, materials, services, pricing, workflows, inventory configuration and destructive operational actions.
- Large Format, DTF and Direct Image calculators in one unified order engine.
- Multiple service lines in one customer order.
- Universal inventory units, variants, pricing rules and production recipes foundation.
- Inventory consumption with an auditable ledger and administrator-only deletion/restoration.
- Service-aware production workflows and real-time status updates.
- Artwork/file attachments and customer approval status.
- Quotes with print/PDF and approve-to-order conversion.
- Payments with partial-payment support and balance tracking.
- Purchasing with inventory receiving through the inventory ledger.
- Expenses and profitability reporting.
- Delivery tracking.
- Operational notifications and realtime notification refresh.
- Organization JSON backup/export.
- Offline order drafts with automatic retry when the connection returns.
- PWA/service-worker shell caching.
- Responsive dark NETVYL interface.
- Web, Capacitor and Electron build configuration.
- Historical large-format jobs remain in the legacy model; V36 adds the generalized order engine without deleting them.

## Database installation

### Existing NETVYL project

Use Supabase SQL Editor and run:

`supabase/v36-commercial-complete.sql`

Run it after the existing NETVYL/V34 baseline migrations. It is additive and preserves existing organization data.

Then run `supabase/buyer-membership-activation-fix.sql` in the Supabase SQL Editor. It assigns existing buyer accounts to active organizations and repairs buyer membership when an organization or license is activated in the future.

If Business Setup reports that `public.pricing_rules` is missing, also run `supabase/business-setup-pricing-rules-fix.sql` in the SQL Editor. This safely creates the missing table, applies organization access policies, and reloads the API schema cache.

### New Supabase project

Use Supabase SQL Editor and run:

`supabase/NETVYL-FRESH-INSTALL.sql`

This is the consolidated installation script containing the required baseline plus V36 completion migration.

Then run `supabase/buyer-membership-activation-fix.sql` in the Supabase SQL Editor so license buyers receive organization access.

Then run `supabase/business-setup-pricing-rules-fix.sql` to ensure the pricing configuration table is present.

Do not run the individual historical migration files; they are intentionally consolidated to reduce setup mistakes.

## Environment

Copy `.env.example` to `.env.local` and supply:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase service-role/secret key in browser environment variables.

## Local web development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production web

```bash
npm install
npm run build
npm run start
```

This project is configured as a standard browser deployment with a standalone Next.js build, so it is ready for Vercel, Netlify, Railway, Render, or any normal Node hosting platform.

## Android / iOS

```bash
npm install
npm run mobile:build
npx cap add android
npx cap add ios
npm run mobile:sync
```

Then open Android Studio or Xcode:

```bash
npm run android:open
npm run ios:open
```

Mobile builds use Next static export output (`out`) while the normal web/Electron build uses standalone output.

## Windows

```bash
npm install
npm run electron:build
```

For the portable build:

```bash
npm run electron:build:portable
```

Artifacts are written to `dist/`.

## First organization setup

1. Master Admin creates the organization.
2. Master Admin generates a pending license.
3. Payment is submitted and verified.
4. Master Admin invites the first Company Administrator.
5. Company Administrator logs in.
6. Administration → Business Setup configures services, materials, variants, prices and workflows.
7. Opening stock and staff are configured.
8. The company can immediately use New Job → Production → Payment → Delivery.

## Admin user guide

For step-by-step instructions for Company Administrators and NETVYL Master Admins, see [ADMIN-GUIDE.md](ADMIN-GUIDE.md). It covers workspace setup, staff and permissions, daily operations, backups, licensing and platform administration.

## Important permissions

Company Administrator is the only normal company role allowed to:

- add/edit/delete materials and configuration;
- add/remove/change company staff;
- delete unified V36 orders and restore consumed inventory;
- reset company operational data;
- manage suppliers/purchasing.

Manager, Staff, Cashier and Production have operational permissions appropriate to their roles. Database RLS/RPC checks enforce these rules; hiding a menu item is not the security boundary.

## License behavior

Active licenses permit normal operations. Expired organizations remain readable but mutation helpers reject operational changes unless Master Admin Support Mode is active.

## Performance principles

- Calculator math is local and updates immediately while typing.
- Navigation avoids unnecessary full-page reloads.
- Database reads are scoped to the active organization.
- Large reads are scoped and limited at the UI layer where appropriate.
- Secondary data is loaded separately from critical interaction paths.
- Offline drafts are retained locally and retried after reconnection.

## Release verification performed

- TypeScript/TSX syntax audit: passed.
- Package JSON validation: passed.
- Calculator smoke tests: passed.
- Hard-coded organization UUID audit: passed.
- Browser secret audit: passed.
- Release artifact cleanup: passed.
- Next.js production build: requires npm package installation in a networked development environment; this execution environment could not complete npm dependency retrieval, so no false build-pass claim is made.
