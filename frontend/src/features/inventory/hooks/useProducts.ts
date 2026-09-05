import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productService } from '../services/product.service';
import { PaginationParams } from '../types';

export const useProducts = (params: PaginationParams, options?: { enabled?: boolean }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products', params],
    queryFn: () => productService.getProducts(params),
    enabled: options?.enabled !== false,
  });

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: productService.createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return {
    products: data?.products || [],
    total: data?.total || 0,
    isLoading,
    error,
    createProduct: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
