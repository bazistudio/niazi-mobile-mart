import { httpFetch, HttpFetchOptions } from '@/lib/tauri/tauriClient';

export const httpClient = {
  get: <T>(url: string, options?: HttpFetchOptions) => httpFetch<T>(url, { method: 'GET', ...options }),
  post: <T>(url: string, data: any, options?: HttpFetchOptions) => httpFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...options,
  }),
  put: <T>(url: string, data: any, options?: HttpFetchOptions) => httpFetch<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...options,
  }),
  delete: <T>(url: string, options?: HttpFetchOptions) => httpFetch<T>(url, { method: 'DELETE', ...options }),
  patch: <T>(url: string, data: any, options?: HttpFetchOptions) => httpFetch<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...options,
  }),
};
