
// This file loads environment variables safely
export const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

// Helper function to check if key is configured
export const isGroqKeyConfigured = () => {
  return GROQ_API_KEY !== "" && GROQ_API_KEY !== undefined;
};
