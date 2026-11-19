import { useState, useEffect } from 'react';
import { tauriClient } from '@/lib/tauri/tauriClient';
import { shopApi } from '@/services/shop.api';

export interface BranchOption {
  id: string;
  name: string;
}

export function useBranches() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    async function load() {
      try {
        const rawList = await tauriClient.branchList().catch(() => []);
        let mapped: BranchOption[] = [];
        if (rawList && rawList.length > 0) {
          mapped = rawList
            .filter((b: any) => b.is_active !== false && b.is_active !== 0)
            .map((b: any) => ({ id: b.id, name: b.name }));
        } else {
          const res = await shopApi.getAllShops().catch(() => ({ success: false, data: [] }));
          if (res.success && res.data?.length > 0) {
            mapped = res.data
              .filter((s: any) => s.status === 'active' || s.status === 'ACTIVE')
              .map((s: any) => ({ id: s._id || s.id, name: s.name }));
          }
        }
        if (!cancelled) {
          setBranches(mapped);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { branches, isLoading };
}
