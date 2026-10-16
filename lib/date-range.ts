// Inbound task date filter: invoiceDate, falling back to createdAt when empty (matches UI fmtDate)
export function taskDateWhere(dateFrom?: string | null, dateTo?: string | null) {
  if (!dateFrom && !dateTo) return null;
  const range: { gte?: Date; lte?: Date } = {};
  // ponytail: pin day boundaries to TH (+07:00) — server-local is UTC in Docker, shifting the day by 7h. Make configurable if other sites appear.
  if (dateFrom) range.gte = new Date(`${dateFrom}T00:00:00+07:00`);
  if (dateTo) range.lte = new Date(`${dateTo}T23:59:59.999+07:00`);
  return { OR: [{ invoiceDate: range }, { invoiceDate: null, createdAt: range }] };
}
