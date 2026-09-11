import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import pbassClient from '@/lib/pbass';

// Pull the invoice list from PBASS and upsert into inbound_tasks.
// Unique key: TAX_INV_NO + ITEM_NO + VENDOR_CODE — these three fields must be stable across PBASS updates.
// ponytail: verify the mapping with ?dryRun=1 against real PBASS output before trusting writes.

const pick = (row: any, keys: string[]): any => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
};

function mapRow(row: any) {
  // TAX_INVOICE_NO = EPROIN field; TAX_INVOICE = INVINCOM field
  const invoiceNo = pick(row, ['TAX_INVOICE_NO', 'TAX_INVOICE', 'INVOICE_NO', 'INV_NO', 'invoiceNo', 'invoice', 'id']);
  const partNo    = pick(row, ['ITEM_NO', 'partNo', 'PART_NO', 'sku']);
  // VENDOR_CODE = EPROIN; VENDOR = INVINCOM (numeric vendor code)
  const vendor    = pick(row, ['VENDOR_CODE', 'VENDOR', 'VENDOR_NAME', 'vendor']);
  // VELIVERY_QUANTITY = EPROIN typo; REPLY_QTY = INVINCOM
  const qtyRaw    = pick(row, ['VELIVERY_QUANTITY', 'DELIVERY_QUANTITY', 'REPLY_QTY', 'STOCK_QTY', 'planQty', 'PLAN_QTY', 'qty', 'QTY']);
  const planQty   = qtyRaw != null ? parseFloat(String(qtyRaw)) : NaN;
  const poNo      = pick(row, ['PONO', 'PO_NO', 'poNo', 'po']);
  const partName  = pick(row, ['ITEM_NAME', 'partName', 'PART_NAME', 'name']);
  const lotNo     = pick(row, ['LOTNO', 'LOT_NO', 'lotNo', 'lot']);
  // DELIVERY_DATE = EPROIN; INV_DATE = INVINCOM
  const invDateRaw = pick(row, ['DELIVERY_DATE', 'INV_DATE', 'invoiceDate', 'INVOICE_DATE']);
  const invoiceDate = invDateRaw ? new Date(invDateRaw) : undefined;
  return {
    invoiceNo: invoiceNo ? String(invoiceNo) : undefined,
    partNo: partNo ? String(partNo) : undefined,
    vendor: vendor ? String(vendor) : 'Unknown Vendor',
    planQty,
    poNo: poNo ? String(poNo) : undefined,
    partName: partName ? String(partName) : undefined,
    lotNo: lotNo ? String(lotNo) : undefined,
    invoiceDate: invoiceDate && !isNaN(invoiceDate.getTime()) ? invoiceDate : undefined,
  };
}

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request);
  if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const body = await request.json().catch(() => ({}));

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const defaultEnd = new Date(today); defaultEnd.setDate(today.getDate() + 2); defaultEnd.setHours(23, 59, 59, 999);
    const rangeStart = body.dateFrom ? new Date(body.dateFrom) : today;
    const rangeEnd   = body.dateTo   ? (() => { const d = new Date(body.dateTo); d.setHours(23,59,59,999); return d; })() : defaultEnd;
    const plus2End = rangeEnd; // alias kept for filter below

    const res = await pbassClient.fetchData({
      customUrl: process.env.PBASS_INVOICE_API_URL,
      customToken: process.env.PBASS_INVOICE_API_TOKEN || process.env.PBASS_STOCK_API_TOKEN,
    });
    if (!res.success) return createErrorResponse(res.error || 'PBASS fetch failed', 502);

    const rows = res.data || [];
    // ponytail: STATUS_DESC = EPROIN field; STATUS = INVINCOM field
    const waiting = rows.filter((r: any) => {
      const status = r.STATUS_DESC || r.STATUS || '';
      if (status !== 'WAITING RECEIVE') return false;
      const rawDate = r.DELIVERY_DATE || r.INV_DATE || r.DUE_DATE;
      const dd = rawDate ? new Date(rawDate) : null;
      if (!dd || isNaN(dd.getTime())) return true;
      return dd >= rangeStart && dd <= plus2End;
    });
    const mapped = waiting.map(mapRow);
    const valid = mapped.filter((m) => m.invoiceNo && m.partNo && !isNaN(m.planQty) && m.planQty > 0);
    const skipped = mapped.length - valid.length;

    if (dryRun) {
      return createResponse({ dryRun: true, fetched: rows.length, waiting: waiting.length, valid: valid.length, skipped, sample: mapped.slice(0, 5), rawSample: waiting.slice(0, 2) });
    }

    // ponytail: count distinct keys before loop — source dupes collapse via upsert, explaining fetched vs dbCount gap
    const sourceKeys = new Set(valid.map(m => `${m.invoiceNo}|${m.partNo}|${m.vendor}`)); // TAX_INV_NO|ITEM_NO|VENDOR_CODE
    const sourceDuplicates = valid.length - sourceKeys.size;

    let upserted = 0;
    for (const m of valid) {
      await prisma.inboundTask.upsert({
        where: { invoiceNo_partNo_vendor: { invoiceNo: m.invoiceNo!, partNo: m.partNo!, vendor: m.vendor } },
        create: {
          invoiceNo: m.invoiceNo!,
          poNo: m.poNo || 'N/A',
          vendor: m.vendor,
          partNo: m.partNo!,
          partName: m.partName || null,
          planQty: m.planQty,
          lotNo: m.lotNo || null,
          invoiceDate: m.invoiceDate || null,
          status: 'PENDING',
          updatedAt: new Date(),
        },
        update: {
          // refresh plan data only — never touch status/actualQty (may already be received)
          ...(m.poNo && { poNo: m.poNo }),
          ...(m.partName && { partName: m.partName }),
          planQty: m.planQty,
          ...(m.lotNo && { lotNo: m.lotNo }),
          ...(m.invoiceDate && { invoiceDate: m.invoiceDate }),
        },
        select: { id: true },
      });
      upserted++;
    }

    const dbCount = await prisma.inboundTask.count({ where: { status: 'PENDING' } });

    logger.info({ fetched: rows.length, waiting: waiting.length, upserted, skipped, sourceDuplicates, dbCount }, 'PBASS invoice sync complete');
    return createResponse({ fetched: rows.length, waiting: waiting.length, upserted, skipped, sourceDuplicates, dbCount });
  } catch (error: any) {
    logger.error({ err: error }, 'PBASS sync error');
    captureException(error, { route: '/api/inbound-tasks/sync' });
    return createErrorResponse(error.message || 'PBASS sync failed', 500);
  }
}
