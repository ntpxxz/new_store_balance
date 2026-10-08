import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import ReceiveClient from './_client';
import type { Task } from '@/lib/client';

const PART_FILTER = { OR: [
  { partName: { contains: 'RAMP' } },
  { partName: { contains: 'DIVERTOR' } },
  { partName: { contains: 'BASEPLATE' } },
]};

export default async function ReceivePage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const [rows, pending, iqc, completed] = await Promise.all([
    prisma.inboundTask.findMany({
      where: { AND: [PART_FILTER], status: { in: ['PENDING', 'ARRIVED'] } },
      include: { inspection: true, part: { select: { drawingNo: true, spec: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
    prisma.inboundTask.count({ where: { AND: [PART_FILTER], status: { in: ['PENDING', 'ARRIVED'] } } }),
    prisma.inboundTask.count({ where: { AND: [PART_FILTER], status: { in: ['IQC_WAITING', 'IQC_IN_PROGRESS'] } } }),
    prisma.inboundTask.count({ where: { AND: [PART_FILTER], status: { in: ['COMPLETED', 'REJECTED', 'CANCELLED'] } } }),
  ]);

  const tasks: Task[] = rows.map((t: any) => ({
    ...t,
    itemDraw: t.part?.drawingNo ?? null,
    itemSpec: t.part?.spec ?? null,
    passedQty: t.inspection?.passedQty,
    failedQty: t.inspection?.failedQty,
    judgment: t.inspection?.judgment,
    defectReason: t.inspection?.defectReason,
  }));

  return <ReceiveClient initialTasks={tasks} initialCounts={{ pending, iqc, completed }} />;
}
