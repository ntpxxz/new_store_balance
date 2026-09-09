# Receive Module — Standalone App Concept

## Goal

Replace scan-first flow with invoice-list-first.
User sees what is coming in, picks an item, processes it.
No tagNo scan involved anywhere.

---

## App Flow

```
┌─────────────────────────────┐
│  1. Invoice List (Home)     │  ← fetch from PBASS API on load
│                             │
│  [ INV-2026-001 ]  Vendor A │
│  [ INV-2026-002 ]  Vendor B │
│  [ INV-2026-003 ]  Vendor C │
└─────────────┬───────────────┘
              │ select
              ▼
┌─────────────────────────────┐
│  2. Invoice Detail          │  ← show all part lines in that invoice
│                             │
│  Part A  100 pcs  PENDING   │
│  Part B   50 pcs  PENDING   │
└─────────────┬───────────────┘
              │ tap a line
              ▼
┌─────────────────────────────┐
│  3. Receive Form            │  ← enter qty, note, urgent flag
│                             │
│  Qty: [____]                │
│  [Confirm Receive]          │
└─────────────┬───────────────┘
              │ confirm → POST /[id]/receive
              ▼
┌─────────────────────────────┐
│  4. Waiting IQC             │  ← status = ARRIVED
│                             │
│  (IQC system calls          │
│   POST /iqc-pass directly)  │
└─────────────┬───────────────┘
              │ iqc-pass webhook received
              ▼
┌─────────────────────────────┐
│  5. Store / Put-away        │  ← status = IQC_PASSED_WAITING_STOCK
│                             │
│  Bin: [____]  Qty: [____]   │
│  [Confirm Store]            │
└─────────────┬───────────────┘
              │ confirm → POST /[id]/store
              ▼
┌─────────────────────────────┐
│  6. Done                    │  ← status = COMPLETED
│     as400_queue row written │
└─────────────────────────────┘
```

---

## Data Source

```
PBASS API ──► upsert inbound_tasks
                    │
                    └──► App reads from inbound_tasks only
```

- On app load: call `PBASS_INVOICE_API_URL` → upsert into `inbound_tasks`
- App only queries `inbound_tasks` after that — PBASS is a one-time pull on open
- No tagNo involved anywhere

---

## Tables

### `inbound_tasks`
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| status | nvarchar | PENDING → ARRIVED → IQC_PASSED_WAITING_STOCK → COMPLETED |
| invoiceNo | nvarchar | invoice number |
| invoiceDate | datetime2? | null on old rows — fallback to createdAt |
| poNo | nvarchar? | PO number |
| vendor | nvarchar | vendor full name |
| partNo | nvarchar | part code |
| partName | nvarchar? | part name |
| lotNo / rev / mfgDate | — | optional part info |
| planQty | float | expected qty |
| actualQty | float | received qty |
| receivedBy | nvarchar? | username |
| receivedAt | datetime2? | |
| targetLocation | nvarchar? | bin after store |
| isUrgent | bit | |
| finishedAt | datetime2? | |

Upsert key: `(invoiceNo, partNo, vendor)` — unique constraint on `inbound_tasks`

### `as400_queue`
| Column | Type | Notes |
|---|---|---|
| id | int | PK autoincrement |
| VENDOR_CODE | nvarchar? | |
| VENDOR_NAME | nvarchar? | |
| MATLOT | nvarchar? | = invoiceNo |
| ITEM_NO | nvarchar? | = partNo |
| STOCK_QTY | decimal? | qty |
| ITEM_TYPE | nvarchar? | I = stored, P = IQC passed |
| INV_DATE | nvarchar? | YYYYMMDD |
| RCV_DATE | nvarchar? | YYYYMMDD |
| RCV_BY | nvarchar? | username |
| inboundTaskId | nvarchar? | FK → inbound_tasks |
| status | nvarchar | PENDING / SENT / FAILED |
| retryCount | int | |
| lastAttemptAt / sentAt / as400RefNo / error | — | retry tracking |

### `inspection_results`
| Column | Type | Notes |
|---|---|---|
| inboundTaskId | nvarchar | FK |
| passedQty / failedQty | float | |
| judgment | nvarchar | PASS / FAIL |
| inspector | nvarchar? | |
| defectReason / remark | nvarchar? | |

### `stock_lots` — created on store
| Column | Type | Notes |
|---|---|---|
| partId / location | nvarchar | |
| lotNo / invoiceNo | nvarchar? | |
| originalQty / remainingQty | float | FIFO |
| receivedAt | datetime2 | |

### `suppliers`
| Column | Type | Notes |
|---|---|---|
| code / name | nvarchar | name matches inbound_tasks.vendor |
| abbr | nvarchar? | short name for AS400 |

---

## API Routes

| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/api/inbound-tasks` | Required | List tasks — `?tab=pending` or `?tab=history` |
| POST | `/api/inbound-tasks/[id]/receive` | Required | Record receive |
| POST | `/api/inbound-tasks/[id]/iqc-pass` | None (system) | IQC pass from IQC system |
| POST | `/api/inbound-tasks/[id]/store` | Required | Put-away to bin |

### Request bodies

**POST /[id]/receive**
```json
{ "qty": 100, "isUrgent": false, "note": null, "bin": null }
```

**POST /[id]/iqc-pass**
```json
{ "passedQty": 98, "failedQty": 2, "inspector": "somchai", "defectReason": null, "remark": null }
```

**POST /[id]/store**
```json
{ "location": "A-01-01", "qty": 98 }
```

---

## What the New App Needs from store-smt

| Thing | Source |
|---|---|
| DB connection | Same `Warehouse_F5` SQL Server |
| Auth | Same JWT + `sessions` table |
| API routes | Reuse `/receive`, `/iqc-pass`, `/store` as-is |
| PBASS client | Copy `lib/pbass.ts` |
| as400_queue | Same table, same insert logic |

---

## Auth

- `Authorization: Bearer <jwt>` on all routes except `/iqc-pass`
- JWT validated against live `sessions` table — tokens are revocable
- All roles (`ADMIN`, `SUPERVISOR`, `USER`) can receive and store

---

## PBASS Client

```ts
import pbassClient from '@/lib/pbass';

const result = await pbassClient.fetchData({
    customUrl: process.env.PBASS_INVOICE_API_URL,
    customToken: process.env.PBASS_STOCK_API_TOKEN,
});
// result.data = array of invoice line records
```

Env vars required:
```
PBASS_INVOICE_API_URL=...
PBASS_STOCK_API_TOKEN=...
PBASS_API_TIMEOUT=30000
PBASS_API_IGNORE_SSL=true
HTTPS_PROXY=...
DATABASE_URL=sqlserver://localhost:1433;database=Warehouse_F5;...
```

---

## Key Rules

1. **No tagNo** — identify task by inboundTask.id from invoice selection
2. **as400_queue insert must not block** — wrap in `.catch()`, queue failure does not fail receive
3. **invoiceDate fallback** — use `invoiceDate ?? createdAt` for old rows
4. **Bin validation** — store only accepts locations in `bin_configs` table
5. **Double store guard** — reject if `status === 'COMPLETED'` before store
6. **Tech stack** — Next.js (reuse Prisma + auth verbatim) or plain Express with raw SQL
