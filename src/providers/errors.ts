export class ProviderError extends Error {
  /** Creates a normalized provider error with optional HTTP context. */
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Converts provider and network failures into user-facing messages. */
export function providerErrorMessage(provider: string, error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.status === 401 || error.status === 403) {
      return `${provider} rejected the API key.`;
    }
    if (error.status === 429) {
      return `${provider} rate limit reached.`;
    }
    return error.message;
  }
  if (error instanceof SyntaxError) {
    return `${provider} returned malformed JSON. Try one more edit, lower temperature, or switch models.`;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Analysis request was cancelled.";
  }
  if (error instanceof TypeError) {
    return `${provider} request failed. Browser CORS, network access, or direct-browser API access may be blocked.`;
  }
  return error instanceof Error ? error.message : "Analysis failed.";
}
