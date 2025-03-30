
// Audio recorder constants
export const TRANSCRIPTION_INTERVAL_MS = 3000;
export const CHUNK_DURATION_MS = 250;
export const MAX_CHUNKS = 60; // 60 chunks * 250ms = 15 seconds
export const DUMMY_DATA_INTERVAL_MS = 50;
export const MIN_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 10000;
export const RATE_LIMIT_TOAST_INTERVAL_MS = 10000;
export const RATE_LIMIT_ERROR_MARKER = "__RATE_LIMIT_ERROR__";

// Dummy transcription phrases for testing
export const DUMMY_PHRASES = [
  "Hello, I'm looking for information.",
  "Can you help me find something?",
  "I need assistance with a question.",
  "How does this service work?",
  "Tell me more about this app.",
];
