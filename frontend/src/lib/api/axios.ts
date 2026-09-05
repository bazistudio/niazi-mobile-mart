import axios from "axios";

// Single axios instance — interceptors are configured in interceptors.ts
// and imported via layout.tsx to avoid circular dependencies.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // IMPORTANT: sends tp_token cookie on every request
});

export default api;