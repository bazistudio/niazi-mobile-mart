'use client';

import React from 'react';

export default function StaffManagementPage() {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Organization Staff</h1>
        <button className="bg-[#006970] text-white px-4 py-2 rounded-md hover:bg-[#005a60]">
          Invite Member
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <p className="text-gray-500">Staff list placeholder. This will display all users and their roles/shop accesses.</p>
      </div>
    </div>
  );
}
