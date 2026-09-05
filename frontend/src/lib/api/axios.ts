import axios from "axios";

// Single axios instance — interceptors are configured in interceptors.ts
// and imported via main.tsx / layout to avoid circular dependencies.
const getBaseUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return "";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true, // IMPORTANT: sends tp_token cookie on every request
});

export default api;