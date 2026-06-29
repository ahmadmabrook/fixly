import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Service } from '../lib/api';

export type ServiceSort = 'price_asc' | 'price_desc' | 'duration_asc' | 'duration_desc' | 'category';

export interface ServiceFilters {
  category?: string;
  search?: string;
  sort?: ServiceSort;
}

interface ServiceListResponse {
  data: Service[];
  meta: { categories: string[] };
}

/** Active service catalogue. Cached across views via the shared query key. */
export function useServices(filters?: ServiceFilters) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort) params.set('sort', filters.sort);
  const qs = params.toString();
  const path = qs ? `/services?${qs}` : '/services';

  return useQuery({
    queryKey: ['services', filters?.category ?? '', filters?.search ?? '', filters?.sort ?? ''],
    queryFn: async () => {
      const raw = await api.get<ServiceListResponse | Service[]>(path);
      // Support both wrapped { data, meta } and plain array responses
      if (Array.isArray(raw)) {
        return { data: raw, meta: { categories: [] as string[] } };
      }
      return raw;
    },
  });
}

/**
 * Single service by id. Seeds instantly from the already-cached catalogue
 * when available — so deep-linking from the catalogue/landing renders
 * without a second round-trip — and only fetches the list itself when
 * the cache is cold (e.g. a hard refresh straight onto /services/:id).
 */
export function useService(id: string | undefined) {
  const qc = useQueryClient();

  function findInCache(): Service | undefined {
    // Try all cached service queries (any filter combination)
    const queries = qc.getQueriesData<ServiceListResponse>({ queryKey: ['services'] });
    for (const [, cached] of queries) {
      if (!cached) continue;
      const list = Array.isArray(cached) ? cached : cached.data;
      const match = (list as Service[]).find((s) => s.id === id);
      if (match) return match;
    }
    return undefined;
  }

  return useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const fromCache = findInCache();
      if (fromCache) return fromCache;
      const raw = await api.get<ServiceListResponse | Service[]>('/services');
      const list = Array.isArray(raw) ? raw : raw.data;
      const match = list.find((s) => s.id === id);
      if (!match) throw new Error('الخدمة غير موجودة');
      return match;
    },
    initialData: () => findInCache(),
    enabled: !!id,
  });
}
