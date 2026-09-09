# Receive Module (newstore)

Standalone Next.js app for the inbound **receive** flow. Reads/writes the same
`Warehouse_F5` SQL Server as `store-smt`. UI from the Figma *Warehouse OS* export.

## Flow
Receive list → Invoice detail → Receive (qty, optional box-scan) → Waiting IQC
→ Put-away (bin) → Done. Statuses match `inbound_tasks`:
`PENDING → IQC_WAITING → IQC_PASSED_WAITING_STOCK → COMPLETED`.

## Run
```bash
cp .env.example .env      # set DATABASE_URL + JWT_SECRET (JWT_SECRET MUST match store-smt)
npm install               # runs prisma generate
npm run dev               # http://localhost:3000
```
Sign in with a `users` row from the shared DB.

## What's reused from store-smt (verbatim)
- `prisma/schema.prisma`, `lib/{prisma,auth,logger,audit,validation,rate-limit}.ts`
- API routes: `auth/login`, `inbound-tasks`, `inbound-tasks/[id]/{receive,iqc-pass,store}`
  — same logic, incl. AS400 queue insert on store/iqc-pass.

## Deliberately skipped (add when needed)
- **PBASS pull on load** — `inbound_tasks` is already populated by store-smt's
  `oneinv/webhook` against the shared DB, so the list reads real data. A direct
  PBASS pull needs the PBASS invoice response schema to map fields safely.
- **GET /inbound-tasks/[id]** — detail fetches the list and finds by id. Add a
  by-id route if the table grows large.
- **Reject Shipment** action (Figma) — no reject endpoint exists in store-smt.
- **Camera barcode scan** — the box-scan panel is a manual tally; wire
  `@zxing/browser` for real scanning.
