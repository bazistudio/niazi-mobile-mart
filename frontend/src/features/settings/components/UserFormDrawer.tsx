'use client';

import React, { useState, useEffect } from 'react';
import { SlideOverDrawer } from '@/components/ui/SlideOverDrawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PinInput } from './PinInput';
import { RoleSelect } from './RoleSelect';
import { StaffUser, CreateStaffDto, UpdateStaffDto } from '../types/staff.types';
import { useCreateStaff, useUpdateStaff } from '../hooks/useStaff';
import toast from 'react-hot-toast';

interface UserFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingStaff?: StaffUser | null;
}

export const UserFormDrawer: React.FC<UserFormDrawerProps> = ({
  isOpen,
  onClose,
  editingStaff,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [roleId, setRoleId] = useState('');
  const [nameError, setNameError] = useState('');
  const [roleError, setRoleError] = useState('');

  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();

  const isEditing = !!editingStaff;
  const isPending = createStaff.isPending || updateStaff.isPending;

  useEffect(() => {
    if (isOpen) {
      if (editingStaff) {
        setName(editingStaff.name);
        setPhone(editingStaff.phone || '');
        setUsername(editingStaff.username || '');
        setEmail(editingStaff.email || '');
        setPin('');
        setRoleId(editingStaff.roleId);
      } else {
        setName('');
        setPhone('');
        setUsername('');
        setEmail('');
        setPin('');
        setRoleId('');
      }
      setNameError('');
      setRoleError('');
    }
  }, [isOpen, editingStaff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;

    if (!name.trim()) {
      setNameError('Name is required');
      hasError = true;
    } else {
      setNameError('');
    }

    if (!roleId) {
      setRoleError('Role is required');
      hasError = true;
    } else {
      setRoleError('');
    }

    if (hasError) return;

    try {
      if (isEditing && editingStaff) {
        const data: UpdateStaffDto = {
          name: name.trim(),
          phone: phone.trim() || undefined,
          username: username.trim() || undefined,
          email: email.trim() || undefined,
          roleId,
        };
        await updateStaff.mutateAsync({ id: editingStaff._id, data });
        toast.success('User updated successfully');
      } else {
        const data: CreateStaffDto = {
          name: name.trim(),
          phone: phone.trim() || undefined,
          username: username.trim() || undefined,
          email: email.trim() || undefined,
          pin: pin || undefined,
          roleId,
        };
        await createStaff.mutateAsync(data);
        toast.success('User created successfully');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save user');
    }
  };

  const handleClose = () => {
    if (!isPending) {
      onClose();
    }
  };

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? 'Edit User' : 'Add User'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="flex-1 space-y-5">
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError('');
            }}
            error={nameError}
            placeholder="Full name"
            disabled={isPending}
            required
          />

          <Input
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 03XX-XXXXXXX"
            disabled={isPending}
            type="tel"
          />

          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username for login"
            disabled={isPending}
          />

          <Input
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            disabled={isPending}
            type="email"
          />

          <RoleSelect
            value={roleId}
            onChange={(val) => {
              setRoleId(val);
              if (val) setRoleError('');
            }}
            error={roleError}
            disabled={isPending}
          />

          {!isEditing && (
            <PinInput
              label="PIN (Optional)"
              value={pin}
              onChange={setPin}
              length={4}
              disabled={isPending}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isPending}
          >
            {isEditing ? 'Save Changes' : 'Add User'}
          </Button>
        </div>
      </form>
    </SlideOverDrawer>
  );
};