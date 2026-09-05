import { isRouteRegistered } from '../../constants/navigation/route-registry';

/**
 * Validates a navigation route during development.
 * Logs a warning to the console if the route is not registered in the centralized route registry.
 */
export const validateRoute = (href: string, label: string) => {
  if (process.env.NODE_ENV === 'development') {
    if (!isRouteRegistered(href)) {
      console.warn(`[Navigation Warning] Route not found for "${label}": ${href}`);
    }
  }
};
