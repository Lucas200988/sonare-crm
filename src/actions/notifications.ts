'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/server/auth/guards';
import { markAllNotificationsRead, markNotificationRead } from '@/server/services/notify';

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await requireAuth();
  await markNotificationRead(user, id);
  revalidatePath('/dashboard');
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireAuth();
  await markAllNotificationsRead(user);
  revalidatePath('/dashboard');
}
