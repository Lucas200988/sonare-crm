'use server';

import { requireAuth } from '@/server/auth/guards';
import { globalSearch, type SearchHit } from '@/server/services/search';

export async function globalSearchAction(termo: string): Promise<SearchHit[]> {
  const user = await requireAuth();
  return globalSearch(user, termo);
}
