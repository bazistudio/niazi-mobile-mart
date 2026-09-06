export const partyApi = {
  getParties: async (_page = 1, _limit = 100): Promise<{
    success: boolean;
    data: any[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    return {
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0, pages: 1 }
    };
  },

  addParty: async (partyData: any): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> => {
    return {
      success: true,
      data: {
        id: `party_${Date.now()}`,
        ...partyData,
      },
      message: 'Party added',
    };
  },

  updateParty: async (id: string, partyData: any): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> => {
    return {
      success: true,
      data: {
        id,
        ...partyData,
      },
      message: 'Party updated',
    };
  },

  deleteParty: async (_id: string): Promise<{
    success: boolean;
    message: string;
  }> => {
    return {
      success: true,
      message: 'Party deleted',
    };
  },

  getPartyDetail: async (id: string): Promise<{
    success: boolean;
    data: any;
  }> => {
    return {
      success: true,
      data: {
        id,
        name: 'Party',
      }
    };
  },

  getPartyLedger: async (id: string): Promise<{
    success: boolean;
    data: {
      party: any;
      ledger: any[];
      currentBalance: number;
    };
  }> => {
    return {
      success: true,
      data: {
        party: { id, name: 'Party' },
        ledger: [],
        currentBalance: 0,
      }
    };
  }
};
