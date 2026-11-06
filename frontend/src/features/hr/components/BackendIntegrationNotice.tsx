import React from 'react';
import { AlertCircle, Clock, Database } from 'lucide-react';

interface BackendIntegrationNoticeProps {
  /**
   * Short title shown in the notice header.
   */
  title?: string;
  /**
   * Specific description of what backend work is needed.
   */
  description: string;
  /**
   * Optional list of specific API endpoints / backend tasks required.
   */
  requiredEndpoints?: string[];
  /**
   * Visual variant: 'info' (blue, default) | 'warning' (amber)
   */
  variant?: 'info' | 'warning';
  /**
   * Whether to show the notice in a compact single-line form.
   */
  compact?: boolean;
  className?: string;
}

/**
 * BackendIntegrationNotice
 *
 * Displayed in any HR / Progress Report section that CANNOT save or retrieve
 * real data because backend endpoints have not yet been built.
 *
 * RULE: Every section that calls a stub in hr.api.ts MUST render this notice.
 * Never show a success message or imply data was saved without a real API round-trip.
 */
export const BackendIntegrationNotice: React.FC<BackendIntegrationNoticeProps> = ({
  title = 'Backend Integration Pending',
  description,
  requiredEndpoints,
  variant = 'info',
  compact = false,
  className = '',
}) => {
  const isWarning = variant === 'warning';

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          ${isWarning
            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
          } ${className}`}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{description}</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 space-y-3
        ${isWarning
          ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
          : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
        } ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-lg
          ${isWarning
            ? 'bg-amber-100 dark:bg-amber-900/50'
            : 'bg-blue-100 dark:bg-blue-900/50'
          }`}>
          <AlertCircle className={`w-4 h-4
            ${isWarning
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-blue-600 dark:text-blue-400'
            }`}
          />
        </div>
        <span className={`text-sm font-semibold
          ${isWarning
            ? 'text-amber-800 dark:text-amber-300'
            : 'text-blue-800 dark:text-blue-300'
          }`}>
          {title}
        </span>
      </div>

      {/* Description */}
      <p className={`text-sm
        ${isWarning
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-blue-700 dark:text-blue-400'
        }`}>
        {description}
      </p>

      {/* Required Endpoints */}
      {requiredEndpoints && requiredEndpoints.length > 0 && (
        <div className="space-y-1.5">
          <div className={`flex items-center gap-1.5 text-xs font-medium
            ${isWarning
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-blue-700 dark:text-blue-400'
            }`}>
            <Database className="w-3 h-3" />
            <span>Required API endpoints:</span>
          </div>
          <ul className="space-y-1">
            {requiredEndpoints.map((ep) => (
              <li key={ep}>
                <code className={`text-xs px-2 py-0.5 rounded font-mono
                  ${isWarning
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                    : 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300'
                  }`}>
                  {ep}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BackendIntegrationNotice;
