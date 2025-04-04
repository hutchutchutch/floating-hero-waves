
// Audio recorder constants
export const TRANSCRIPTION_INTERVAL_MS = 5000; // Increased from 3000ms to 5000ms
export const CHUNK_DURATION_MS = 250;
export const MAX_CHUNKS = 40; // Reduced from 60 to 40 chunks (10 seconds of audio)
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
