export const importApi = {
  uploadPDF: async (_file: File): Promise<{
    success: boolean;
    pages: number;
    rawLines: string[];
    products: any[];
    meta: { parsedCount: number; matchedCount: number };
  }> => {
    return {
      success: true,
      pages: 1,
      rawLines: [],
      products: [],
      meta: { parsedCount: 0, matchedCount: 0 },
    };
  },

  commitImport: async (_payload: any): Promise<{
    success: boolean;
    data: {
      supplierId: string;
      totalCost: number;
    };
    message: string;
  }> => {
    return {
      success: true,
      data: {
        supplierId: 'supp_1',
        totalCost: 0,
      },
      message: 'Import committed',
    };
  },

  manualImport: async (_payload: any): Promise<{
    success: boolean;
    data: any;
    message: string;
  }> => {
    return {
      success: true,
      data: null,
      message: 'Manual import saved',
    };
  }
};
