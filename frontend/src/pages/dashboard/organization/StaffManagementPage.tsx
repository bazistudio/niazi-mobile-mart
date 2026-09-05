import React from 'react';

export function StaffManagementPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Organization Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Manage personnel, roles, and branch permissions</p>
        </div>
        <button className="bg-[#006970] text-white px-4 py-2 rounded-md hover:bg-[#005a60] transition-colors shadow-sm cursor-pointer">
          Invite Member
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-100 dark:border-gray-700">
        <p className="text-gray-500">Staff directory and permissions control center.</p>
      </div>
    </div>
  );
}

export default StaffManagementPage;
