import { z } from 'zod';

// User Validation
export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'USER']).optional(),
});

// Part/Inventory Validation
export const partSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    qty: z.number().min(0, 'Quantity must be positive'),
    unit: z.string().min(1, 'Unit is required'),
    status: z.enum(['normal', 'low', 'critical', 'fast']).optional(),
    icon: z.string().optional(),
    partNo: z.string().min(1, 'Part No is required'),
    location: z.string().min(1, 'Location is required'),
    locationStatus: z.enum(['Available', 'Reserved', 'On Hold']).optional(),
    spec: z.string().optional(),
    drawingNo: z.string().optional(),
    safetyStock: z.number().min(0).optional(),
    imageUrl: z.string().url().optional().nullable(),
});

export const moveInventorySchema = z.object({
    qty: z.number().min(0.0001, 'Quantity must be at least 0.0001'),
    destination: z.string().min(1, 'Destination is required'),
    type: z.enum(['transfer', 'inbound', 'adjustment', 'move']),
});

// Production Order Validation
export const productionOrderSchema = z.object({
    id: z.string().min(1, 'MO ID is required'),
    status: z.enum(['ready', 'scheduled', 'urgent', 'completed', 'cancelled']),
    line: z.string().min(1, 'Production line is required'),
    description: z.string().min(1, 'Description is required'),
    dueTime: z.string(),
    progress: z.number().int().min(0).max(100),
});

export const pickPartSchema = z.object({
    bomItemId: z.string().min(1, 'BOM item ID is required'),
    location: z.string().optional(),
    isSpecialCase: z.boolean().optional(),
});

// Inbound Validation
export const inboundReceiveSchema = z.object({
    itemId: z.string().min(1, 'Item ID is required'),
    receivedQty: z.number().min(0.0001, 'Received quantity must be at least 0.0001'),
});

// Validates a date string that represents a past received/recorded date.
// Must be parseable, not in the future, and not older than 1 year.
const receivedTimestampSchema = z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' })
    .refine((val) => new Date(val) <= new Date(), { message: 'Received date cannot be in the future' })
    .refine((val) => {
        const limit = new Date();
        limit.setFullYear(limit.getFullYear() - 1);
        return new Date(val) >= limit;
    }, { message: 'Received date cannot be more than 1 year in the past' })
    .optional();

export const createInvoiceSchema = z.object({
    vendor: z.string().min(1, 'Vendor is required'),
    partNo: z.string().min(1, 'Part number is required'),
    partName: z.string().optional(),
    po: z.string().optional(),
    invoice: z.string().optional(),
    qty: z.coerce.number().positive('Quantity must be greater than 0'),
    timestamp: receivedTimestampSchema,
    recordedBy: z.string().optional(),
    iqcstatus: z.enum(['Pending', 'Completed']).optional(),
    allowDuplicate: z.boolean().optional(),
});

export const createUserSchema = z.object({
    username: z.string().min(2, 'Username must be at least 2 characters'),
    password: z.string().min(4, 'Password must be at least 4 characters').optional(),
    email: z.string().email('Invalid email address').optional().nullable(),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'USER']).default('USER'),
    section: z.enum(['IQC', 'WAREHOUSE', 'PRODUCTION', 'PLANNING', 'PURCHASING']).optional(),
    isActive: z.boolean().optional(),
});

export const createInboundTaskSchema = z.object({
    invoiceNo: z.string().optional(),
    invoice: z.string().optional(),
    poNo: z.string().optional(),
    po: z.string().optional(),
    vendor: z.string().min(1, 'Vendor is required'),
    partNo: z.string().min(1, 'Part number is required'),
    partName: z.string().optional(),
    planQty: z.coerce.number().positive('Planned quantity must be greater than 0').optional(),
    qty: z.coerce.number().positive('Planned quantity must be greater than 0').optional(),
    isUrgent: z.boolean().optional(),
    dueDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid due date format' }).optional(),
    allowDuplicate: z.boolean().optional(),
    partId: z.string().optional(),
    iqcstatus: z.string().optional(),
    status: z.string().optional(),
}).refine(
    (data) => {
        const qty = data.planQty ?? data.qty;
        return qty !== undefined && qty > 0;
    },
    { message: 'Planned quantity must be greater than 0', path: ['planQty'] }
);

// Formats a Date to YYYYMMDD string for AS400 fields
export const fmtDateAS400 = (d: Date | null | undefined): string =>
    d ? d.toISOString().slice(0, 10).replace(/-/g, '') : '';

/**
 * Normalizes location strings to a standard format (e.g., "Aisle A, Bin 1" -> "A-01", "A-1" -> "A-01")
 */
export function normalizeLocation(loc: string): string {
    if (!loc) return '';
    const trimmed = loc.trim().toUpperCase();

    // 0. Support A11-D37 format precisely (Rack Level Slot)
    const rackPattern = trimmed.match(/^([A-D])\s*[-]?\s*([1-3][1-7])$/i);
    if (rackPattern) {
        return `${rackPattern[1].toUpperCase()}${rackPattern[2]}`;
    }

    // 1. Try "Aisle A, Bin 1" or "Aisle A, Bin 01"
    const verbose = trimmed.match(/AISLE\s*([A-Z0-9]+).*BIN\s*([0-9]+)/i);
    if (verbose) {
        return `${verbose[1]}-${verbose[2].padStart(2, '0')}`;
    }

    // 2. Try "A-1" or "A-01"
    const hyphen = trimmed.match(/^([A-Z0-9]+)\s*-\s*([0-9]+)$/i);
    if (hyphen) {
        return `${hyphen[1]}-${hyphen[2].padStart(2, '0')}`;
    }

    // 3. Try "A1" or "A01" (e.g. A01 -> A-01)
    const concat = trimmed.match(/^([A-Z]+)\s*([0-9]+)$/i);
    if (concat) {
        return `${concat[1]}-${concat[2].padStart(2, '0')}`;
    }

    return trimmed;
}

// Helper function to validate request body
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    try {
        const validated = schema.parse(data);
        return { success: true, data: validated };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const firstError = error.issues[0];
            return { success: false, error: firstError?.message || 'Validation failed' };
        }
        return { success: false, error: 'Validation failed' };
    }
}
