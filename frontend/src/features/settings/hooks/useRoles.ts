'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../services/settings.api';
import { CreateRoleDto, UpdateRoleDto, RoleWithPermissions } from '../types/role.types';

const ROLES_QUERY_KEY = ['settings', 'roles'] as const;

export function useRoles() {
  return useQuery<RoleWithPermissions[], Error>({
    queryKey: ROLES_QUERY_KEY,
    queryFn: settingsApi.getRoles,
  });
}

export function useRoleById(id: string) {
  return useQuery<RoleWithPermissions, Error>({
    queryKey: ['settings', 'roles', id],
    queryFn: () => settingsApi.getRoleById(id),
    enabled: !!id,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoleDto) => settingsApi.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRoleDto }) =>
      settingsApi.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => settingsApi.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useDuplicateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => settingsApi.duplicateRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}