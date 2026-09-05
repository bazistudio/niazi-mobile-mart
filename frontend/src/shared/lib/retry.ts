// src/shared/lib/retry.ts

/**
 * Executes an async function with exponential backoff retries.
 * 
 * @param fn The async function to execute
 * @param retries Maximum number of retries before failing
 * @param baseDelay Base delay in ms between retries (multiplied exponentially)
 * @returns The result of the async function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      // Exponential backoff: baseDelay * 2^attempt + jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw new Error("Retry failed");
}
