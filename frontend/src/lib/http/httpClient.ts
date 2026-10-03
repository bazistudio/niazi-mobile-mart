import { httpFetch } from '@/lib/tauri/tauriClient';

export const httpClient = {
  get: <T>(url: string) => httpFetch<T>(url, { method: 'GET' }),
  post: <T>(url: string, data: any) => httpFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  put: <T>(url: string, data: any) => httpFetch<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  delete: <T>(url: string) => httpFetch<T>(url, { method: 'DELETE' }),
};
