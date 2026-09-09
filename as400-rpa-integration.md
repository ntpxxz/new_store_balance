# AS400 RPA Integration — Concept

## Overview

Two separate apps share one MSSQL database. `store-smt` writes, `as400-rpa` reads and drives the terminal.

```
[store-smt]  PUT-AWAY confirmed
                  ↓
             INSERT as400_queue (status=PENDING)
                  ↓ (shared MSSQL — Warehouse_F5)
[as400-rpa]  poll every N seconds
                  ↓
             fetch PENDING rows
                  ↓
             drive AS400 terminal (4-screen flow)
                  ↓
             UPDATE status → SENT / FAILED
```

---

## Connection Point

Both apps point to the same DB: `sqlserver://localhost:1433;database=Warehouse_F5`

- **store-smt** → writes via Prisma after `/api/inbound-tasks/[id]/store`
- **as400-rpa** → reads via `pyodbc` in `fetch_pending()`

No API calls between them. No new code needed on either side once DB config matches.

---

## Data Flow (per receive event)

1. Warehouse staff scans item → confirms put-away in WMS UI
2. `store/route.ts` completes transaction → calls `prisma.aS400Queue.create()`
3. Row inserted: `status=PENDING`, fields: `VENDOR_CODE`, `MATLOT` (invoiceNo), `ITEM_NO` (partNo), `STOCK_QTY`, `VENDOR_NAME`, `RCV_BY`, `RCV_DATE`, `INV_DATE`
4. RPA polls → finds PENDING row → runs 4-screen AS400 flow
5. RPA marks row `SENT` (with `as400RefNo`) or `FAILED` (with `error`)

---

## Schema Compatibility Check (to verify before go-live)

| Column (store-smt Prisma) | Column (as400-rpa reads) | Match? |
|---|---|---|
| `VENDOR_CODE` | `q.VENDOR_CODE` | ✓ |
| `VENDOR_NAME` | `q.VENDOR_NAME` | ✓ |
| `MATLOT` (invoiceNo) | `q.MATLOT` | ✓ |
| `ITEM_NO` (partNo) | `q.ITEM_NO` | ✓ |
| `STOCK_QTY` (storeQty) | `q.STOCK_QTY` | ✓ |
| — | `vs.shortname` (JOIN vendor_shortname) | ⚠ needs `vendor_shortname` table in DB |

---

## What Needs Verification Before Implementation

1. **Same DB?** — confirm `as400-rpa/.env` `DB_NAME` = `Warehouse_F5` (same as store-smt)
2. **`vendor_shortname` table** — does it exist in Warehouse_F5? RPA does a LEFT JOIN on it for `shortname` field (DTN07122 screen). If missing, shortname will be NULL/blank — may or may not matter depending on AS400 field requirement.
3. **`as400_queue` table** — RPA's `ensure_table()` uses `IF NOT EXISTS`, so Prisma's richer schema won't be clobbered. OK.
4. **Network/firewall** — RPA machine must reach MSSQL on port 1433.

---

## Status Visibility (already built)

- `GET /api/as400/queue?status=PENDING|SENT|FAILED` — queue dashboard in WMS
- `AS400QueueView` component shows queue state to supervisors
- Failed rows stay PENDING and retry until `retry_count >= MAX_RETRY` (RPA side config)

---

## Not Needed

- No new API endpoint between the two apps
- No message broker / queue middleware
- No Python worker file in store-smt (RPA lives in `D:\TJ825\S_APP\as400-rpa`)
