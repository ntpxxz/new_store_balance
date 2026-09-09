import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import pbassClient from '@/lib/pbass';

// Pull the invoice list from PBASS and upsert into inbound_tasks.
// Writes mirror the store-smt oneinv webhook (unique key invoiceNo_partNo_vendor,
// create rows as PENDING). The READ side is the uncertain part: PBASS record key
// names are not documented here, so we pick tolerantly across common variants.
// ponytail: verify the mapping with ?dryRun=1 against real PBASS output before trusting writes.

const pick = (row: any, keys: string[]): any => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
};

function mapRow(row: any) {
  const invoiceNo = pick(row, ['INVOICE_NO', 'MATLOT', 'invoiceNo', 'INV_NO', 'invoice', 'id']);
  const partNo = pick(row, ['ITEM_NO', 'partNo', 'PART_NO', 'sku']);
  const vendor = pick(row, ['VENDOR_NAME', 'vendor', 'VENDOR', 'VENDOR_CODE']);
  const qtyRaw = pick(row, ['DELIVERY_QUANTITY', 'STOCK_QTY', 'planQty', 'PLAN_QTY', 'qty', 'QTY']);
  const planQty = qtyRaw != null ? parseFloat(String(qtyRaw)) : NaN;
  const poNo = pick(row, ['PONO', 'PO_NO', 'poNo', 'po']);
  const partName = pick(row, ['ITEM_NAME', 'partName', 'PART_NAME', 'name']);
  const lotNo = pick(row, ['LOTNO', 'LOT_NO', 'lotNo', 'lot']);
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

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const plus2End = new Date(today); plus2End.setDate(today.getDate() + 2); plus2End.setHours(23, 59, 59, 999);

    const res = await pbassClient.fetchData({
      customUrl: process.env.PBASS_INVOICE_API_URL,
      customToken: process.env.PBASS_INVOICE_API_TOKEN || process.env.PBASS_STOCK_API_TOKEN,
    });
    if (!res.success) return createErrorResponse(res.error || 'PBASS fetch failed', 502);

    const rows = res.data || [];
    // ponytail: filter by DELIVERY_DATE on our side — EPROIN URL uses path-based dates, query params are ignored
    const waiting = rows.filter((r: any) => {
      if (r.STATUS_DESC !== 'WAITING RECEIVE') return false;
      const dd = r.DELIVERY_DATE ? new Date(r.DELIVERY_DATE) : null;
      if (!dd || isNaN(dd.getTime())) return true;
      return dd >= today && dd <= plus2End;
    });
    const mapped = waiting.map(mapRow);
    const valid = mapped.filter((m) => m.invoiceNo && m.partNo && !isNaN(m.planQty) && m.planQty > 0);
    const skipped = mapped.length - valid.length;

    if (dryRun) {
      return createResponse({ dryRun: true, fetched: rows.length, waiting: waiting.length, valid: valid.length, skipped, sample: mapped.slice(0, 5), rawSample: waiting.slice(0, 2) });
    }

    // ponytail: count distinct keys before loop — source dupes collapse via upsert, explaining fetched vs dbCount gap
    const sourceKeys = new Set(valid.map(m => `${m.invoiceNo}|${m.partNo}|${m.vendor}`));
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
