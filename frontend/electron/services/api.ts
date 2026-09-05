import axios from 'axios';

// Change this to the real API endpoint later
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

export const api = {
  // Resolves conflicts by checking server.updatedAt > local.updatedAt
  syncEntity: async (entityType: string, operation: string, payload: any) => {
    const endpoint = `/${entityType}`;
    
    // Minimal mock-up of what the API interaction looks like
    try {
      let response;
      if (operation === 'CREATE') {
        response = await apiClient.post(endpoint, payload);
      } else if (operation === 'UPDATE') {
        response = await apiClient.put(`${endpoint}/${payload.id}`, payload);
      } else if (operation === 'DELETE') {
        response = await apiClient.delete(`${endpoint}/${payload.id}`);
      }
      return { success: true, data: response?.data };
    } catch (error: any) {
      // Basic Conflict Handling: if 409 Conflict, parse server entity
      if (error.response && error.response.status === 409) {
        return { success: false, conflict: true, serverData: error.response.data.serverEntity };
      }
      throw error;
    }
  }
};
