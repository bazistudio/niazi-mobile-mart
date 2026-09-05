import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryService } from '../services/category.service';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export const useCategories = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organizationId || 'default';

  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ['categories', orgId],
    queryFn: () => categoryService.getCategories(),
    enabled: options?.enabled !== false,
  });

  const createCategory = useMutation({
    mutationFn: (data: { name: string; organizationId?: string }) =>
      categoryService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      categoryService.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => categoryService.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', orgId] });
    },
  });

  return {
    categories,
    isLoading,
    error,
    createCategory: createCategory.mutateAsync,
    isCreating: createCategory.isPending,
    updateCategory: updateCategory.mutateAsync,
    isUpdating: updateCategory.isPending,
    deleteCategory: deleteCategory.mutateAsync,
    isDeleting: deleteCategory.isPending,
  };
};
