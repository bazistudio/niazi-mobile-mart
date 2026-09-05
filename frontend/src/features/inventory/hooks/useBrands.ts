import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { brandService } from '../services/brand.service';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export const useBrands = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organizationId || 'default';

  const { data: brands = [], isLoading, error } = useQuery({
    queryKey: ['brands', orgId],
    queryFn: () => brandService.getBrands(),
    enabled: options?.enabled !== false,
  });

  const createBrand = useMutation({
    mutationFn: (data: { name: string; organizationId?: string }) =>
      brandService.createBrand(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', orgId] });
    },
  });

  const updateBrand = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      brandService.updateBrand(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', orgId] });
    },
  });

  const deleteBrand = useMutation({
    mutationFn: (id: string) => brandService.deleteBrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', orgId] });
    },
  });

  return {
    brands,
    isLoading,
    error,
    createBrand: createBrand.mutateAsync,
    isCreating: createBrand.isPending,
    updateBrand: updateBrand.mutateAsync,
    isUpdating: updateBrand.isPending,
    deleteBrand: deleteBrand.mutateAsync,
    isDeleting: deleteBrand.isPending,
  };
};
