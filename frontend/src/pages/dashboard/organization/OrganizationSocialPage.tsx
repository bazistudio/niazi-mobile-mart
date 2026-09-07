import React, { useState } from 'react';
import { OrganizationPageShell } from '@/features/dashboard/components/organization/OrganizationPageShell';
import { 
  Share2, 
  FileText, 
  Megaphone, 
  Radio, 
  HeartHandshake, 
  CalendarClock,
  Plus
} from 'lucide-react';

export function OrganizationSocialPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const socialSections = [
    { id: 'overview', label: 'Social Overview', icon: Share2, desc: 'Enterprise marketing presence and brand channel connectivity.' },
    { id: 'content', label: 'Content', icon: FileText, desc: 'Approved creative media, promotion text templates, and branding assets.' },
    { id: 'campaigns', label: 'Campaigns', icon: Megaphone, desc: 'Central organization promotions, seasonal discount announcements, and campaigns.' },
    { id: 'channels', label: 'Channels', icon: Radio, desc: 'Connected social platforms (WhatsApp, SMS, Meta, etc.).' },
    { id: 'engagement', label: 'Engagement', icon: HeartHandshake, desc: 'Aggregated follower feedback, campaign reach, and inquiry responses.' },
    { id: 'scheduled', label: 'Scheduled Content', icon: CalendarClock, desc: 'Upcoming scheduled broadcasts and marketing announcements calendar.' },
  ];

  const currentSection = socialSections.find((s) => s.id === activeTab) || socialSections[0];

  return (
    <OrganizationPageShell
      title="Social & Marketing Hub"
      description="Organization-level social campaigns, channel broadcasts, and brand marketing management (isolated from core POS/business logic)."
      badge="Marketing Hub"
      action={
        <button
          disabled
          className="flex items-center gap-2 px-3.5 py-2 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium cursor-not-allowed shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Campaign</span>
        </button>
      }
    >
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-800">
        {socialSections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeTab === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveTab(sec.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200/60 dark:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Empty State Container */}
      <div className="bg-white dark:bg-gray-800/90 rounded-xl p-12 border border-gray-200/80 dark:border-gray-700/80 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary mb-4">
          <Share2 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {currentSection.label}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5 leading-relaxed">
          {currentSection.desc}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 italic">
          Social channels and organization marketing broadcasts will appear here once marketing integrations are configured.
        </p>
      </div>
    </OrganizationPageShell>
  );
}

export default OrganizationSocialPage;
