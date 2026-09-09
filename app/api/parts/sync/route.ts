import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth, createResponse, createErrorResponse } from '@/lib/auth';
import { logger, captureException } from '@/lib/logger';
import pbassClient from '@/lib/pbass';

// POST /api/parts/sync — pull PBASS STKWHLOC (both WH=L and WH=P) and upsert master_parts + inventory_stocks.
// Stock unique key: [partId, location, wh] — we use AS400 LOCATION as the location key.

const str = (v: any) => (v != null && v !== '' ? String(v) : undefined);
const num = (v: any) => (v != null && v !== '' ? parseFloat(String(v)) : undefined);

function mapRecord(row: any) {
    return {
        partNo: str(row.ITEM_NO),
        name: str(row.ITEM_NAME),
        unit: str(row.UNIT),
        plac: str(row.PLAC),
        division: str(row.DIVISION),
        divisionName: str(row.DIVISION_NAME),
        itemType: str(row.ITEM_TYPE),
        dept: str(row.DEPT),
        acCode: str(row.AC_CODE),
        wh: str(row.WH),
        location: str(row.LOCATION) ?? 'UNKNOWN',
        stcl: str(row.STCL),
        matlot: str(row.MATLOT),
        vendorLot: str(row.VENDOR_LOT),
        vendorCode: str(row.VENDOR_CODE),
        vendorName: str(row.VENDOR_NAME),
        maker: str(row.MAKER),
        stdPrice: num(row.STD_PRICE),
        actPrice: num(row.ACT_PRICE),
        stdAmount: num(row.STD_AMOUNT),
        actAmount: num(row.ACT_AMOUNT),
        localCur: str(row.LOCAL_CUR),
        lastStockIn: str(row.LAST_STOCK_IN_UPDATE),
        lastIssued: str(row.LAST_ISSUED_UPDATE),
        latestUpdateDate: str(row.LATEST_UPDATE_DATE),
        latestOperator: str(row.LATEST_UPDATE_OPERATOR),
        latestOperatorName: str(row.LATEST_UPDATE_OPERATOR_NAME),
        qty: num(row.STOCK_QTY) ?? 0,
    };
}

export async function POST(request: NextRequest) {
    const authResult = await verifyAuth(request);
    if ('error' in authResult) return createErrorResponse(authResult.error, authResult.status);

    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

    try {
        // Fetch both warehouse L and P in parallel
        const [resL, resP] = await Promise.all([
            pbassClient.fetchData({ customUrl: process.env.PBASS_STOCK_L_API_URL, customToken: process.env.PBASS_STOCK_API_TOKEN }),
            pbassClient.fetchData({ customUrl: process.env.PBASS_STOCK_P_API_URL, customToken: process.env.PBASS_STOCK_API_TOKEN }),
        ]);

        const rows = [
            ...(resL.success ? (resL.data ?? []) : []),
            ...(resP.success ? (resP.data ?? []) : []),
        ];

        const errors: string[] = [];
        if (!resL.success) errors.push(`WH=L: ${resL.error}`);
        if (!resP.success) errors.push(`WH=P: ${resP.error}`);

        const records = rows.map(mapRecord).filter((r) => r.partNo);

        if (dryRun) {
            return createResponse({ dryRun: true, fetched: rows.length, valid: records.length, errors, sample: records.slice(0, 3), rawSample: rows.slice(0, 2) });
        }

        let upsertedParts = 0;
        let upsertedStocks = 0;

        for (const r of records) {
            // Upsert part master (only non-null fields to avoid overwriting richer local data)
            const part = await prisma.part.upsert({
                where: { partNo: r.partNo! },
                create: {
                    partNo: r.partNo!,
                    name: r.name ?? r.partNo!,
                    unit: r.unit ?? 'PCS',
                    plac: r.plac,
                    division: r.division,
                    divisionName: r.divisionName,
                    itemType: r.itemType,
                    dept: r.dept,
                    acCode: r.acCode,
                },
                update: {
                    ...(r.name && { name: r.name }),
                    ...(r.unit && { unit: r.unit }),
                    ...(r.plac && { plac: r.plac }),
                    ...(r.division && { division: r.division }),
                    ...(r.divisionName && { divisionName: r.divisionName }),
                    ...(r.itemType && { itemType: r.itemType }),
                    ...(r.dept && { dept: r.dept }),
                    ...(r.acCode && { acCode: r.acCode }),
                },
                select: { id: true },
            });
            upsertedParts++;

            // Upsert stock record — unique key [partId, location, wh]
            await prisma.stock.upsert({
                where: {
                    partId_location_wh: {
                        partId: part.id,
                        location: r.location,
                        wh: r.wh ?? '',
                    },
                },
                create: {
                    partId: part.id,
                    location: r.location,
                    as400Location: r.location,
                    wh: r.wh,
                    stcl: r.stcl,
                    matlot: r.matlot,
                    vendorLot: r.vendorLot,
                    vendorCode: r.vendorCode,
                    vendorName: r.vendorName,
                    maker: r.maker,
                    stdPrice: r.stdPrice,
                    actPrice: r.actPrice,
                    stdAmount: r.stdAmount,
                    actAmount: r.actAmount,
                    localCur: r.localCur,
                    lastStockIn: r.lastStockIn,
                    lastIssued: r.lastIssued,
                    latestUpdateDate: r.latestUpdateDate,
                    latestOperator: r.latestOperator,
                    latestOperatorName: r.latestOperatorName,
                    quantity: r.qty,
                },
                update: {
                    stcl: r.stcl,
                    matlot: r.matlot,
                    vendorLot: r.vendorLot,
                    vendorCode: r.vendorCode,
                    vendorName: r.vendorName,
                    maker: r.maker,
                    stdPrice: r.stdPrice,
                    actPrice: r.actPrice,
                    stdAmount: r.stdAmount,
                    actAmount: r.actAmount,
                    localCur: r.localCur,
                    lastStockIn: r.lastStockIn,
                    lastIssued: r.lastIssued,
                    latestUpdateDate: r.latestUpdateDate,
                    latestOperator: r.latestOperator,
                    latestOperatorName: r.latestOperatorName,
                    quantity: r.qty,
                },
            });
            upsertedStocks++;
        }

        logger.info({ fetched: rows.length, upsertedParts, upsertedStocks, fetchErrors: errors }, 'PBASS stock sync complete');
        return createResponse({ fetched: rows.length, upsertedParts, upsertedStocks, errors });
    } catch (error: any) {
        logger.error({ err: error }, 'PBASS stock sync error');
        captureException(error, { route: '/api/parts/sync' });
        return createErrorResponse(error.message || 'Stock sync failed', 500);
    }
}
