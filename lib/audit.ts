import prisma from './prisma';

export enum ActivityType {
    INVENTORY_MOVE = 'INVENTORY_MOVE',
    INVENTORY_STOCK_UPDATE = 'INVENTORY_STOCK_UPDATE',
    INBOUND_RECEIVE = 'INBOUND_RECEIVE',
    INBOUND_STORE = 'INBOUND_STORE',
    PICKING = 'PICKING',
    BIN_CONFIG_UPDATE = 'BIN_CONFIG_UPDATE',
    USER_ACTION = 'USER_ACTION',
    SYSTEM = 'SYSTEM'
}

export async function logActivity(params: {
    userId?: string;
    type: ActivityType | string;
    label: string;
    description: string;
    details?: any;
}) {
    try {
        return await prisma.activityLog.create({
            data: {
                userId: params.userId,
                type: params.type,
                label: params.label,
                description: params.description,
                // details column is NVarChar(Max) (SQL Server has no JSON type) — stringify objects.
                details: params.details == null
                    ? undefined
                    : (typeof params.details === 'string' ? params.details : JSON.stringify(params.details)),
            }
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
        // Don't throw, we don't want audit logging to break the main feature
    }
}
