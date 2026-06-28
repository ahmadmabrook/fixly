import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Service } from '../lib/api';

/** Active service catalogue. Cached across views via the shared query key. */
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });
}

/**
 * Single service by id. Seeds instantly from the already-cached catalogue
 * (`['services']`) when available — so deep-linking from the catalogue/landing
 * renders without a second round-trip — and only fetches the list itself when
 * the cache is cold (e.g. a hard refresh straight onto /services/:id).
 */
export function useService(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['services', id],
    queryFn: async () => {
      const cached = qc.getQueryData<Service[]>(['services']);
      const list = cached ?? (await api.get<Service[]>('/services'));
      const match = list.find((s) => s.id === id);
      if (!match) throw new Error('الخدمة غير موجودة');
      return match;
    },
    initialData: () => qc.getQueryData<Service[]>(['services'])?.find((s) => s.id === id),
    enabled: !!id,
  });
}
