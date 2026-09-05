'use client';

import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settings.store';
import { Users, Shield, Plus, MoreHorizontal } from 'lucide-react';

export const UserManagement: React.FC = () => {
  const { staffList, fetchStaff, createStaff, updateStaff, isLoading } = useSettingsStore();
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'CASHIER', phone: '' });

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createStaff(formData);
    setIsAdding(false);
    setFormData({ name: '', email: '', password: '', role: 'CASHIER', phone: '' });
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await updateStaff(id, { status: newStatus });
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Staff Accounts
          </h2>
          <p className="text-sm text-neutral-500 mt-1">Manage workforce access and assign roles.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Invite Staff
        </button>
      </div>

      {isAdding && (
        <div className="p-6 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-800">
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Name</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Email</label>
              <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Temp Password</label>
              <input required type="text" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Role</label>
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <option value="MANAGER">Manager</option>
                <option value="CASHIER">Cashier</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Add</button>
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
            <tr>
              <th className="px-6 py-4 font-semibold">Name</th>
              <th className="px-6 py-4 font-semibold">Contact</th>
              <th className="px-6 py-4 font-semibold">Role</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && staffList.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-neutral-500">Loading...</td></tr>
            ) : staffList.map(staff => (
              <tr key={staff._id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-bold text-neutral-900 dark:text-white">{staff.name}</div>
                  <div className="text-xs text-neutral-500">Joined {new Date(staff.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-neutral-600 dark:text-neutral-300">{staff.email}</div>
                  <div className="text-xs text-neutral-500">{staff.phone || 'No phone'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 rounded-md text-xs font-bold w-max">
                    <Shield className="w-3 h-3" />
                    {staff.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <button 
                    onClick={() => handleStatusToggle(staff._id, staff.status)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                    staff.status === 'active' 
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200' 
                      : 'bg-red-50 text-red-600 border border-red-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200'
                  }`}>
                    {staff.status}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <button className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
