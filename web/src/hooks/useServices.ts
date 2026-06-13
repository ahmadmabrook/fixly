import { useQuery } from '@tanstack/react-query';
import { api, Service } from '../lib/api';

/** Active service catalogue. Cached across views via the shared query key. */
export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });
}

/** Single service by id; falls back to the catalogue cache when possible. */
export function useService(id: string | undefined) {
  return useQuery({
    queryKey: ['services', id],
    queryFn: async () => {
      const list = await api.get<Service[]>('/services');
      const match = list.find((s) => s.id === id);
      if (!match) throw new Error('الخدمة غير موجودة');
      return match;
    },
    enabled: !!id,
  });
}
