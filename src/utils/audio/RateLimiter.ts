
/**
 * RateLimiter handles rate limiting logic with exponential backoff
 */
export class RateLimiter {
  private isRateLimited = false;
  private consecutiveErrors = 0;
  private backoffMs = 1000; // Start with 1 second
  private maxConsecutiveErrors = 3;
  private lastToastTime = 0;
  private lastCallTime = 0;
  
  constructor(
    private readonly minBackoffMs: number = 1000,
    private readonly maxBackoffMs: number = 10000,
    private readonly toastIntervalMs: number = 10000
  ) {}
  
  /**
   * Checks if we're currently rate limited
   */
  public isLimited(): boolean {
    return this.isRateLimited;
  }
  
  /**
   * Gets the current backoff time in milliseconds
   */
  public getBackoffTime(): number {
    return this.backoffMs;
  }
  
  /**
   * Check if enough time has passed since the last call
   */
  public canMakeCall(): boolean {
    if (this.isRateLimited) return false;
    
    const now = Date.now();
    const timeElapsed = now - this.lastCallTime;
    return timeElapsed >= this.backoffMs;
  }
  
  /**
   * Record a successful API call
   */
  public recordSuccess(): void {
    this.lastCallTime = Date.now();
    this.consecutiveErrors = 0;
    this.backoffMs = this.minBackoffMs; // Reset backoff on success
  }
  
  /**
   * Record a rate limit error and apply backoff
   * @returns true if we should show a toast notification
   */
  public recordRateLimitError(): boolean {
    this.consecutiveErrors++;
    this.isRateLimited = true;
    
    // Increase backoff time with each rate limit (exponential backoff)
    this.backoffMs = Math.min(this.maxBackoffMs, this.backoffMs * 2);
    
    // Schedule clearing the rate limit flag
    setTimeout(() => {
      console.log(`RateLimiter: Clearing rate limit flag after ${this.backoffMs}ms backoff`);
      this.isRateLimited = false;
    }, this.backoffMs);
    
    // Determine if we should show a toast notification (max one per interval)
    const now = Date.now();
    const shouldShowToast = now - this.lastToastTime > this.toastIntervalMs;
    
    if (shouldShowToast) {
      this.lastToastTime = now;
    }
    
    return shouldShowToast;
  }
}
