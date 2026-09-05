import api from './axios';

export interface DashboardData {
  organization: {
    name: string;
    code: string;
    owner: string;
  };
  subscription: {
    package: string;
    status: string;
    remainingDays: number;
    expiryDate: string;
  } | null;
  shops: {
    current: number;
    limit: number | 'Unlimited';
  };
  employees: {
    total: number;
  };
  sales: {
    today: number;
    month: number;
    total: number;
  };
  inventory: {
    lowStockProducts: number;
  };
  recentActivity: Array<{
    action: string;
    details: string;
    date: string;
  }>;
}

export const getOrganizationDashboard = async (orgId: string): Promise<DashboardData> => {
  const response = await api.get(`/api/v1/organizations/${orgId}/dashboard`);
  return response.data.data;
};

export const createOrganizationShop = async (orgId: string, payload: {
  name: string;
  phone?: string;
  address?: string;
  city?: string;
}) => {
  const response = await api.post(`/api/v1/shops`, {
    ...payload,
    organizationId: orgId
  });
  return response.data.data;
};

