import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityService } from '../services/quality.service';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export const useQualities = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organizationId || 'default';

  const { data: qualities = [], isLoading, error } = useQuery({
    queryKey: ['qualities', orgId],
    queryFn: () => qualityService.getQualities(),
    enabled: options?.enabled !== false,
  });

  const createQuality = useMutation({
    mutationFn: (data: { name: string; organizationId?: string }) =>
      qualityService.createQuality(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualities', orgId] });
    },
  });

  const updateQuality = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      qualityService.updateQuality(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualities', orgId] });
    },
  });

  const deleteQuality = useMutation({
    mutationFn: (id: string) => qualityService.deleteQuality(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualities', orgId] });
    },
  });

  return {
    qualities,
    isLoading,
    error,
    createQuality: createQuality.mutateAsync,
    isCreating: createQuality.isPending,
    updateQuality: updateQuality.mutateAsync,
    isUpdating: updateQuality.isPending,
    deleteQuality: deleteQuality.mutateAsync,
    isDeleting: deleteQuality.isPending,
  };
};
