export const HR_STAFF_EXTRA_CONFIG_PREFIX = 'nmm_hr_staff_extra_cfg_';

export interface StaffExtraConfig {
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'COMMISSION_PERCENTAGE';
  commissionPercentage?: number;
  standardShiftHours: number;
  individualBonus: number;
  bonusReason?: string;
  lateThresholdMinutes?: number;
}

export function getStaffExtraConfig(staffId: string): StaffExtraConfig {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${HR_STAFF_EXTRA_CONFIG_PREFIX}${staffId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.error('Failed to get staff extra config', e);
  }
  return {
    employmentType: 'FULL_TIME',
    commissionPercentage: 50,
    standardShiftHours: 11,
    individualBonus: 0,
    bonusReason: '',
    lateThresholdMinutes: 20,
  };
}

export function saveStaffExtraConfig(staffId: string, cfg: Partial<StaffExtraConfig>) {
  try {
    if (typeof window !== 'undefined') {
      const existing = getStaffExtraConfig(staffId);
      const updated = { ...existing, ...cfg };
      localStorage.setItem(`${HR_STAFF_EXTRA_CONFIG_PREFIX}${staffId}`, JSON.stringify(updated));
      return updated;
    }
  } catch (e) {
    console.error('Failed to save staff extra config', e);
  }
}
