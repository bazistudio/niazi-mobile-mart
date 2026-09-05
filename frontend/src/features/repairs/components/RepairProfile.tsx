'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repairApi } from '../services/repair.api';
import { ArrowLeft, CheckCircle, Clock, Save, Smartphone, Wrench, FileText, Download, User, DollarSign } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export const RepairProfile = ({ repairId }: { repairId: string }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'timeline' | 'parts' | 'labor' | 'payments' | 'notes'>('timeline');

  const { data: job, isLoading } = useQuery({
    queryKey: ['repairJob', repairId],
    queryFn: () => repairApi.getRepairJobById(repairId)
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, note }: { status: string, note: string }) => repairApi.updateStatus(repairId, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairJob', repairId] });
    }
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading repair profile...</div>;
  if (!job) return <div className="p-8 text-center text-red-500">Repair job not found.</div>;

  const handleStatusChange = (newStatus: string) => {
    const note = prompt(`Enter optional note for changing status to ${newStatus}:`);
    if (note !== null) {
      statusMutation.mutate({ status: newStatus, note });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 animate-in fade-in">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard/shop-admin/repairs')}
            className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {job.jobId} 
              <span className="px-2.5 py-1 text-sm font-bold bg-[#006970] text-white rounded-full ml-2">
                {job.status}
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Created {format(new Date(job.createdAt), 'PPP p')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium">
            <Download className="w-4 h-4" /> Print Job Card
          </button>
          <select 
            className="px-4 py-2 bg-[#006970] text-white font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006970] cursor-pointer"
            value={job.status}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="Received">Received</option>
            <option value="Diagnosing">Diagnosing</option>
            <option value="Waiting Customer Approval">Waiting Approval</option>
            <option value="Waiting Parts">Waiting Parts</option>
            <option value="Repair In Progress">Repair In Progress</option>
            <option value="Quality Check">Quality Check</option>
            <option value="Ready for Pickup">Ready for Pickup</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Summary Cards */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
              <User className="w-4 h-4" /> Customer & Device
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500">Customer</p>
                <p className="font-bold text-gray-900 dark:text-white">{job.customerId?.name || job.customerId?.contactPerson || 'Unknown'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{job.customerId?.phone}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Device</p>
                <p className="font-bold text-gray-900 dark:text-white">{job.device.brand} {job.device.model}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">IMEI: {job.device.imei || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Problem</p>
                <p className="text-sm text-gray-800 dark:text-gray-200">{job.problemDescription}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
              <DollarSign className="w-4 h-4" /> Financial Summary
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Parts Cost</span>
                <span className="font-medium">Rs {job.partsTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Labor Charges</span>
                <span className="font-medium">Rs {job.laborTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                <span className="font-bold">Grand Total</span>
                <span className="font-bold text-[#006970]">Rs {job.grandTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span className="font-medium">Total Paid</span>
                <span className="font-medium">Rs {job.totalPaid.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700 text-orange-600">
                <span className="font-bold">Remaining</span>
                <span className="font-bold">Rs {job.remainingBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Tabs */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
            
            {/* Tabs Header */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {[
                { id: 'timeline', label: 'Timeline', icon: Clock },
                { id: 'parts', label: 'Parts Used', icon: Wrench },
                { id: 'labor', label: 'Labor', icon: CheckCircle },
                { id: 'payments', label: 'Payments', icon: DollarSign },
                { id: 'notes', label: 'Notes', icon: FileText }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === tab.id 
                    ? 'border-[#006970] text-[#006970] bg-white dark:bg-gray-800' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6 flex-1 overflow-y-auto">
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {job.timeline.slice().reverse().map((event, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-[#006970] ring-4 ring-[#006970]/20" />
                        {idx !== job.timeline.length - 1 && <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 my-1" />}
                      </div>
                      <div className="pb-6">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{event.status}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{format(new Date(event.timestamp), 'PPp')} by {event.user?.name || 'System'}</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                          {event.description}
                        </p>
                        {event.note && (
                          <p className="text-xs italic text-gray-500 mt-1">Note: {event.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'parts' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white">Consumed Parts</h3>
                    <button className="text-sm font-bold text-[#006970] bg-[#006970]/10 px-3 py-1.5 rounded-lg hover:bg-[#006970]/20 transition-colors">
                      + Add Part (Deducts Stock)
                    </button>
                  </div>
                  {job.partsUsed.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-8">No parts added yet.</p>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500">
                        <tr>
                          <th className="px-4 py-2">Part</th>
                          <th className="px-4 py-2">Qty</th>
                          <th className="px-4 py-2 text-right">Price</th>
                          <th className="px-4 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {job.partsUsed.map((part) => (
                          <tr key={part._id}>
                            <td className="px-4 py-3 font-medium">{part.productId?.name || 'Unknown Part'}</td>
                            <td className="px-4 py-3">{part.qty}</td>
                            <td className="px-4 py-3 text-right">Rs {part.price.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold">Rs {(part.qty * part.price).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Add Labor, Payments, and Notes tabs as needed similarly */}
              {activeTab === 'labor' && <div className="text-center text-gray-500 py-8">Labor charges feature coming soon in UI...</div>}
              {activeTab === 'payments' && <div className="text-center text-gray-500 py-8">Payments feature coming soon in UI...</div>}
              {activeTab === 'notes' && <div className="text-center text-gray-500 py-8">Notes feature coming soon in UI...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
