import axiosInstance from '@/lib/api/axios';

export const partyApi = {
  getParties: async (page = 1, limit = 100) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any[];
      pagination: { page: number; limit: number; total: number; pages: number };
    }>(`/api/v1/parties?page=${page}&limit=${limit}`);
    
    return {
      ...response.data,
      data: response.data.data.map(p => ({
        ...p,
        id: p._id || p.id,
      }))
    };
  },

  addParty: async (partyData: any) => {
    const response = await axiosInstance.post<{
      success: boolean;
      data: any;
      message: string;
    }>('/api/v1/parties', partyData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      }
    };
  },

  updateParty: async (id: string, partyData: any) => {
    const response = await axiosInstance.patch<{
      success: boolean;
      data: any;
      message: string;
    }>(`/api/v1/parties/${id}`, partyData);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      }
    };
  },

  deleteParty: async (id: string) => {
    const response = await axiosInstance.delete<{
      success: boolean;
      message: string;
    }>(`/api/v1/parties/${id}`);
    return response.data;
  },

  getPartyDetail: async (id: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: any;
    }>(`/api/v1/parties/${id}`);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        id: response.data.data._id || response.data.data.id,
      }
    };
  },

  getPartyLedger: async (id: string) => {
    const response = await axiosInstance.get<{
      success: boolean;
      data: {
        party: any;
        ledger: any[];
        currentBalance: number;
      };
    }>(`/api/v1/parties/${id}/ledger`);
    
    return {
      ...response.data,
      data: {
        ...response.data.data,
        party: {
          ...response.data.data.party,
          id: response.data.data.party._id || response.data.data.party.id,
        }
      }
    };
  }
};
