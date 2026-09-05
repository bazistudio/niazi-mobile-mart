'use client';

import React, { useState, useMemo } from 'react';
import { 
  Megaphone, 
  Send, 
  Users, 
  MessageSquare, 
  Mail, 
  Smartphone, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Filter, 
  Search, 
  Clock,
  Layers,
  FileText,
  HelpCircle,
  Copy
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { customerApi } from '@/services/customer.api';
import { useTenantQueryKeys } from '@/lib/react-query/useTenantQueryKeys';
import { useOrganizationStore } from '@/store/useOrganizationStore';
import { DBCustomer } from '@/types/db.types';
import toast from 'react-hot-toast';

type ChannelType = 'sms' | 'whatsapp' | 'email';
type SegmentType = 'all' | 'due' | 'active' | 'with_phone' | 'with_email';

interface MessageTemplate {
  id: string;
  name: string;
  channel: ChannelType;
  content: string;
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tpl_1',
    name: 'Weekend Flash Sale',
    channel: 'sms',
    content: 'Dear {name}, enjoy 20% OFF on all mobile accessories this weekend at {shop}! Visit us today or reply for details.'
  },
  {
    id: 'tpl_2',
    name: 'Payment Due Reminder',
    channel: 'whatsapp',
    content: 'Salam {name}, this is a gentle reminder regarding your outstanding ledger balance of Rs {balance} at {shop}. Please arrange settlement at your earliest convenience.'
  },
  {
    id: 'tpl_3',
    name: 'New Stock Arrival',
    channel: 'sms',
    content: 'Dear {name}, fresh stock of premium cases and chargers has just arrived at {shop}. Limited stock available!'
  },
  {
    id: 'tpl_4',
    name: 'VIP Loyalty Discount',
    channel: 'email',
    content: 'Valued customer {name}, as a special thank you for shopping with {shop}, here is an exclusive 15% promotional voucher on your next visit!'
  }
];

export const MarketingWorkspace: React.FC = () => {
  const keys = useTenantQueryKeys();
  const activeShop = useOrganizationStore(state => state.activeShop);

  const [channel, setChannel] = useState<ChannelType>('sms');
  const [selectedSegment, setSelectedSegment] = useState<SegmentType>('all');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [isManualSelectionMode, setIsManualSelectionMode] = useState(false);

  // Fetch real customer database
  const { data: customerResponse, isLoading, error } = useQuery({
    queryKey: keys.customers,
    queryFn: () => customerApi.getCustomers(1, 300),
    staleTime: 60000,
  });

  const allCustomers: DBCustomer[] = useMemo(() => {
    return customerResponse?.data || [];
  }, [customerResponse]);

  // Derived Audience Segmentation
  const segmentedCustomers = useMemo(() => {
    return allCustomers.filter(c => {
      if (selectedSegment === 'due') return (c.currentBalance || 0) > 0;
      if (selectedSegment === 'active') return (c.currentBalance || 0) === 0;
      if (selectedSegment === 'with_phone') return Boolean(c.phone || c.mobile);
      if (selectedSegment === 'with_email') return Boolean((c as any).email);
      return true;
    });
  }, [allCustomers, selectedSegment]);

  // Search filter within segment
  const displayAudience = useMemo(() => {
    if (!searchTerm) return segmentedCustomers;
    const term = searchTerm.toLowerCase();
    return segmentedCustomers.filter(c => 
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term)) ||
      ((c as any).email && (c as any).email.toLowerCase().includes(term))
    );
  }, [segmentedCustomers, searchTerm]);

  // Effective target count
  const effectiveRecipientCount = isManualSelectionMode 
    ? selectedCustomerIds.length 
    : segmentedCustomers.length;

  const handleApplyTemplate = (tpl: MessageTemplate) => {
    setChannel(tpl.channel);
    setMessageBody(tpl.content);
    toast.success(`Applied template: ${tpl.name}`);
  };

  const handleSelectCustomer = (id: string) => {
    setIsManualSelectionMode(true);
    setSelectedCustomerIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    setIsManualSelectionMode(true);
    setSelectedCustomerIds(displayAudience.map(c => c.id));
  };

  const handleClearSelection = () => {
    setIsManualSelectionMode(false);
    setSelectedCustomerIds([]);
  };

  // Preview interpolation with sample customer
  const previewSample = displayAudience[0] || {
    name: 'Ahmed Khan',
    phone: '+92 300 1234567',
    currentBalance: 4500
  };

  const interpolatedPreview = useMemo(() => {
    if (!messageBody) return 'Your message preview will appear here...';
    return messageBody
      .replace(/{name}/g, previewSample.name || 'Valued Customer')
      .replace(/{shop}/g, activeShop?.name || 'TijaratPro Shop')
      .replace(/{balance}/g, (previewSample.currentBalance || 0).toLocaleString());
  }, [messageBody, previewSample, activeShop]);

  const handleSendDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignTitle.trim() || !messageBody.trim()) {
      toast.error('Please provide a campaign title and message.');
      return;
    }
    if (effectiveRecipientCount === 0) {
      toast.error('Target audience cannot be zero.');
      return;
    }

    // Honest reporting: Gateway dependency
    toast.error('External Provider Required: SMS Gateway / WhatsApp Cloud API credentials must be configured in backend to dispatch live broadcast messages.', {
      duration: 5000,
      icon: '📡'
    });
  };

  return (
    <div className="flex flex-col h-full space-y-6 pb-12 animate-in fade-in duration-200">
      
      {/* Workspace Header */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center border border-orange-500/30">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
              Marketing & Broadcasts
              <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                P10
              </span>
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Promotional SMS, WhatsApp & Email Campaigns for Registered Clients
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded-xl text-xs font-bold text-neutral-700 dark:text-neutral-300">
          <Users className="w-4 h-4 text-orange-500" />
          <span>Total Database: {allCustomers.length} Customers</span>
        </div>
      </div>

      {/* Main Grid: Composer (Left) + Audience & Templates (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Composer & Preview): 7 cols */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Campaign Form Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" /> Campaign Composer
              </h2>
              <span className="text-[11px] font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-500">
                Target: {effectiveRecipientCount} Recipients
              </span>
            </div>

            <form onSubmit={handleSendDraft} className="space-y-4">
              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase mb-2">
                  Broadcast Channel
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setChannel('sms')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      channel === 'sms'
                        ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" /> SMS Broadcast
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      channel === 'whatsapp'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" /> WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannel('email')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                      channel === 'email'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Mail className="w-4 h-4" /> Email
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase mb-1.5">
                  Campaign Title / Internal Reference
                </label>
                <input
                  type="text"
                  required
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="e.g. Eid Mega Sale 2026 / Weekend Clearance"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white"
                />
              </div>

              {/* Message Body */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 uppercase">
                    Message Template Content
                  </label>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {messageBody.length} chars ({Math.ceil(messageBody.length / 160) || 1} SMS unit)
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Enter message text... Use {name}, {shop}, or {balance} as dynamic placeholders."
                  className="w-full p-3 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 dark:text-white resize-none"
                />
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-neutral-400">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Available placeholders: <code className="text-orange-500 font-bold">{'{name}'}</code>, <code className="text-orange-500 font-bold">{'{shop}'}</code>, <code className="text-orange-500 font-bold">{'{balance}'}</code></span>
                </div>
              </div>

              {/* Submit / Dispatch CTA */}
              <button
                type="submit"
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Send className="w-4 h-4" /> Send Broadcast Campaign
              </button>
            </form>
          </div>

          {/* Live Mobile Device Preview */}
          <div className="bg-neutral-900 text-white rounded-2xl p-5 border border-neutral-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs text-neutral-400 border-b border-neutral-800 pb-2">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-400">
                <Smartphone className="w-3.5 h-3.5" /> Sample Customer Device Preview
              </span>
              <span className="font-mono text-[11px]">Recipient: {previewSample.name}</span>
            </div>

            <div className="p-4 rounded-xl bg-neutral-800/80 border border-neutral-700/60 font-sans text-xs leading-relaxed text-neutral-200">
              <p className="whitespace-pre-wrap">{interpolatedPreview}</p>
            </div>
            
            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
              <span>Channel: <strong className="text-neutral-300 uppercase">{channel}</strong></span>
              <span>Timestamp: Just now</span>
            </div>
          </div>
        </div>

        {/* Right Column (Audience & Presets): 5 cols */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Audience Targeting Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-500" /> Customer Audience
              </h2>
              {isManualSelectionMode && (
                <button
                  onClick={handleClearSelection}
                  className="text-[11px] font-bold text-orange-600 hover:underline"
                >
                  Reset Segment
                </button>
              )}
            </div>

            {/* Segment Selector Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'All Customers', count: allCustomers.length },
                { id: 'due', label: 'With Ledger Due', count: allCustomers.filter(c => (c.currentBalance || 0) > 0).length },
                { id: 'active', label: 'Clear Balance', count: allCustomers.filter(c => (c.currentBalance || 0) === 0).length },
                { id: 'with_phone', label: 'Phone Valid', count: allCustomers.filter(c => c.phone || c.mobile).length },
              ].map(seg => (
                <button
                  key={seg.id}
                  onClick={() => {
                    setSelectedSegment(seg.id as SegmentType);
                    setIsManualSelectionMode(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    selectedSegment === seg.id && !isManualSelectionMode
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  <span>{seg.label}</span>
                  <span className="px-1 py-0.2 rounded text-[10px] bg-black/15 text-current font-mono">
                    {seg.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search customers in segment..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Customer List Sub-Panel */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-neutral-100 dark:divide-neutral-800 custom-scrollbar">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-neutral-400">Loading customer audience...</div>
              ) : displayAudience.length === 0 ? (
                <div className="py-6 text-center text-xs text-neutral-400">No matching customers in this segment</div>
              ) : (
                displayAudience.slice(0, 30).map(c => {
                  const isChecked = selectedCustomerIds.includes(c.id);
                  return (
                    <div 
                      key={c.id} 
                      onClick={() => handleSelectCustomer(c.id)}
                      className="pt-1.5 flex items-center justify-between p-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/60 cursor-pointer text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-neutral-900 dark:text-white truncate">{c.name}</p>
                        <p className="text-[11px] text-neutral-400 truncate">{c.phone || c.mobile || 'No phone'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {(c.currentBalance || 0) > 0 ? (
                          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block font-mono">
                            Due Rs {c.currentBalance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">Clear</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {displayAudience.length > 30 && (
              <p className="text-[11px] text-neutral-400 text-center">
                Showing top 30 of {displayAudience.length} customers in segment
              </p>
            )}
          </div>

          {/* Quick Message Preset Templates Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-neutral-200 dark:border-neutral-800 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <FileText className="w-4 h-4 text-orange-500" /> Preset Templates
            </h2>

            <div className="space-y-2.5">
              {DEFAULT_TEMPLATES.map(tpl => (
                <div 
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-orange-400 dark:hover:border-orange-500/50 bg-neutral-50/50 dark:bg-neutral-800/40 cursor-pointer transition-all space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-neutral-900 dark:text-white group-hover:text-orange-600 transition-colors">
                      {tpl.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 uppercase">
                      {tpl.channel}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {tpl.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
