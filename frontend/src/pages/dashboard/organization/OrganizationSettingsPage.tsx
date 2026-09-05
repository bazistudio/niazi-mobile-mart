import React from 'react';

export function OrganizationSettingsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Organization Settings</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
        <p className="text-gray-500">Configure organization profile, billing, and global preferences.</p>
      </div>
    </div>
  );
}

export default OrganizationSettingsPage;
