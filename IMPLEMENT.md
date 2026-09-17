# Implementation Checklist

## Tier 1 — Flow gaps

### 1.1 IQC Inspector UI
- [x] `app/api/inbound-tasks/[id]/iqc-pass/route.ts` — also accept JWT auth (not just API key)
- [x] `app/api/inbound-tasks/[id]/iqc-fail/route.ts` — new route (REJECTED + judgment FAIL)
- [x] `lib/client.ts` — add `iqcPass` and `iqcFail` methods
- [x] `app/receive/[id]/page.tsx` — replace static `WaitingIqc` with interactive `IqcPanel`
- [x] `app/iqc/page.tsx` — IQC inspector list (IQC_WAITING / IQC_IN_PROGRESS tasks)
- [x] `app/components/AppShell.tsx` — replace "Issue" nav with "IQC" → `/iqc`

### 1.2 AS400 silent auth error
- [x] `app/as400/page.tsx` — surface load errors instead of swallowing in `catch {}`

## Tier 2 — UX friction

- [x] Parts page: "Show critical only" filter toggle (`qty <= safetyStock`)
- [x] Receive "Done" tab: show `receivedAt` alongside invoice date
- [x] Parts page: auto-reload on search clear (match receive page behaviour)

## Tier 3 — Code health

- [x] Extract `useAuthRedirect()` hook — remove repeated guard from 5 pages
- [x] Extract shared `Th` / `Td` / `Info` to `app/components/table.tsx`
- [x] `useSearchRef()` hook — consolidated across 3 pages (receive, parts, iqc)
