import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import IqcClient from './_client';
import type { Task } from '@/lib/client';

const PART_FILTER = { OR: [
  { partName: { contains: 'RAMP' } },
  { partName: { contains: 'DIVERTOR' } },
  { partName: { contains: 'BASEPLATE' } },
]};

export default async function IqcPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  const rows = await prisma.inboundTask.findMany({
    where: { AND: [PART_FILTER], status: { in: ['IQC_WAITING', 'IQC_IN_PROGRESS'] } },
    include: { inspection: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const tasks: Task[] = rows.map((t: any) => ({
    ...t,
    passedQty: t.inspection?.passedQty,
    failedQty: t.inspection?.failedQty,
    judgment: t.inspection?.judgment,
    defectReason: t.inspection?.defectReason,
  }));

  return <IqcClient initialTasks={tasks} />;
}
