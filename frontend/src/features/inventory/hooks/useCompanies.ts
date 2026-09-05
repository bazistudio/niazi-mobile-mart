import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companyService } from '../services/company.service';
import { useAuthStore } from '@/lib/auth/core/auth.store';

export const useCompanies = (options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const orgId = user?.organizationId || 'default';

  const { data: companies = [], isLoading, error } = useQuery({
    queryKey: ['companies', orgId],
    queryFn: () => companyService.getCompanies(),
    enabled: options?.enabled !== false,
  });

  const createCompany = useMutation({
    mutationFn: (data: { name: string; organizationId?: string }) =>
      companyService.createCompany(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', orgId] });
    },
  });

  const updateCompany = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      companyService.updateCompany(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', orgId] });
    },
  });

  const deleteCompany = useMutation({
    mutationFn: (id: string) => companyService.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', orgId] });
    },
  });

  return {
    companies,
    isLoading,
    error,
    createCompany: createCompany.mutateAsync,
    isCreating: createCompany.isPending,
    updateCompany: updateCompany.mutateAsync,
    isUpdating: updateCompany.isPending,
    deleteCompany: deleteCompany.mutateAsync,
    isDeleting: deleteCompany.isPending,
  };
};
