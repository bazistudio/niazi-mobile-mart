'use client';

import React from 'react';

interface ComingSoonBadgeProps {
  className?: string;
}

export function ComingSoonBadge({ className = '' }: ComingSoonBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[--color-warning]/10 text-[--color-warning] border border-[--color-warning]/20 ${className}`}
    >
      Coming Soon
    </span>
  );
}