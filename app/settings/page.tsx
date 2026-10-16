import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-session';
import prisma from '@/lib/prisma';
import { userSelect } from '@/lib/validation';
import SettingsClient from './_client';

export default async function SettingsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  const users = await prisma.user.findMany({ select: userSelect, orderBy: { username: 'asc' } });
  return <SettingsClient meId={user.id} initialUsers={JSON.parse(JSON.stringify(users))} />;
}
