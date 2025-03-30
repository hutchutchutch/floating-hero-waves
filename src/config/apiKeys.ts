
// This file loads environment variables safely
export const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

// Helper function to check if key is configured
export const isGroqKeyConfigured = () => {
  // We no longer need to check this on the client side since 
  // the Edge Function can now accept the key in the request
  // and also check for VITE_GROQ_API_KEY in its environment
  return true;
};
