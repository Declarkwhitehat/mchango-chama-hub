/**
 * Retry helpers for M-Pesa payment operations with exponential backoff
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // in milliseconds
  maxDelay: number; // in milliseconds
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 16000, // 16 seconds
};

/**
 * Calculate delay for exponential backoff
 * Formula: min(baseDelay * 2^attempt, maxDelay)
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attemptNumber);
  return Math.min(exponentialDelay, config.maxDelay);
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a deposit can be retried
 */
export function canRetry(
  retryCount: number,
  maxRetries: number = DEFAULT_RETRY_CONFIG.maxRetries
): boolean {
  return retryCount < maxRetries;
}

/**
 * Format retry attempt message for user
 */
export function getRetryMessage(attemptNumber: number, totalAttempts: number): string {
  const delay = calculateBackoffDelay(attemptNumber);
  const seconds = Math.round(delay / 1000);
  
  return `Retry attempt ${attemptNumber + 1} of ${totalAttempts} in ${seconds} seconds...`;
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attemptNumber: number) => void
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if we've exhausted attempts
      if (attempt >= config.maxRetries) {
        break;
      }
      
      // Notify about retry
      if (onRetry) {
        onRetry(attempt);
      }
      
      // Wait with exponential backoff
      const delay = calculateBackoffDelay(attempt, config);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Retry failed');
}
