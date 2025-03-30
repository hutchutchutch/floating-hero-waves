
# Environment Variables Setup

This application uses environment variables for API keys. Follow these steps to set up your environment:

1. Create a `.env` file in the root of the project
2. Add your GROQ API key to the file:
   ```
   VITE_GROQ_API_KEY=your_publishable_groq_api_key_here
   ```
3. Make sure `.env` is listed in your `.gitignore` file to prevent committing sensitive information:
   ```
   # Add this to .gitignore
   .env
   ```

Note: A `.env.example` file is included as a template. Do not put real API keys in this file as it is tracked in git.
