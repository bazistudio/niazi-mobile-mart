'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../services/settings.api';
import { CreateStaffDto, UpdateStaffDto, StaffUser } from '../types/staff.types';

const STAFF_QUERY_KEY = ['settings', 'staff'] as const;

export function useStaff() {
  return useQuery<StaffUser[], Error>({
    queryKey: STAFF_QUERY_KEY,
    queryFn: settingsApi.getStaff,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStaffDto) => settingsApi.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStaffDto }) =>
      settingsApi.updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });
}

export function useUpdateStaffStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' | 'inactive' }) =>
      settingsApi.updateStaffStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });
}

export function useResetStaffPin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => settingsApi.resetStaffPin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });
}

export function useChangeStaffRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      settingsApi.changeStaffRole(id, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });
}