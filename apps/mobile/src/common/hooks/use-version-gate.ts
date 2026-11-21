import { metaResponseSchema } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { apiFetch } from '@/common/lib/api-client';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useVersionGate(): 'ok' | 'update-required' | 'unknown' {
  const { data, isError } = useQuery({
    queryKey: ['meta'],
    queryFn: () =>
      apiFetch('/v1/meta', metaResponseSchema, { tokenOverride: null }),
    retry: false,
    staleTime: 1000 * 60 * 60,
  });

  const current = Application.nativeApplicationVersion;

  if (isError || !data || !current) {
    return 'unknown';
  }

  return compareVersions(current, data.minSupportedVersion) < 0
    ? 'update-required'
    : 'ok';
}
