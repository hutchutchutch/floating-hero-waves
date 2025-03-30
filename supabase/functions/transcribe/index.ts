
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log("Edge function received request:", req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log("Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData = await req.json();
    const { audio, apiKey } = requestData;
    
    // Use API key from request or fall back to environment variable with the updated name
    const GROQ_API_KEY = apiKey || Deno.env.get('VITE_GROQ_API_KEY');
    
    // Debug logging for API key availability
    console.log("Checking for GROQ API key sources:");
    console.log("- From request:", apiKey ? "Present (length: " + apiKey.length + ")" : "Not provided");
    console.log("- From VITE_GROQ_API_KEY env:", Deno.env.get('VITE_GROQ_API_KEY') ? "Present" : "Not found");
    console.log("- From GROQ_API_KEY env (legacy):", Deno.env.get('GROQ_API_KEY') ? "Present" : "Not found");
    console.log("- Final GROQ_API_KEY status:", GROQ_API_KEY ? "Available" : "Not available");
    
    if (!GROQ_API_KEY) {
      console.error("GROQ API key not provided in request and not configured in edge function secrets");
      throw new Error('GROQ API key not available');
    } else {
      console.log("Found GROQ API key with length:", GROQ_API_KEY.length);
      console.log("GROQ API key first 4 chars:", GROQ_API_KEY.substring(0, 4));
    }
    
    if (!audio) {
      console.error("No audio data provided in request");
      throw new Error('No audio data provided');
    }
    
    console.log(`Received audio data with length: ${audio.length}`);

    // Convert base64 to binary
    const binaryString = atob(audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log(`Converted to binary: ${bytes.length} bytes`);

    // Log a sample of the binary data (first few bytes)
    const sampleBytes = bytes.slice(0, Math.min(20, bytes.length));
    console.log("Sample of binary data (first few bytes):", Array.from(sampleBytes));

    // Create FormData to send to GROQ API
    const formData = new FormData();
    
    // Fix: Use proper audio/webm MIME type instead of audio/wav
    // Whisper expects webm, mp3, mp4, mpeg, mpga, m4a, wav, or webm formats
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });
    
    console.log(`Created audio blob with size: ${audioBlob.size} bytes and type: ${audioBlob.type}`);
    
    // Name should end with .webm to ensure proper format detection
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-large-v3'); 

    console.log('Sending audio chunk to GROQ for transcription...');
    
    // Send to GROQ API for transcription
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData
    });

    // Log detailed response information
    console.log(`GROQ API response status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log(`GROQ API response body (preview): ${responseText.substring(0, 200)}...`);
    
    // Check specifically for 429 rate limit errors
    if (response.status === 429) {
      console.error("⚠️ RATE LIMIT EXCEEDED: GROQ API returned 429 status code");
      
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded", 
          statusCode: 429,
          message: "Too many requests to the GROQ API. Please wait before trying again."
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Handle 400 Bad Request errors specifically
    if (response.status === 400) {
      console.error(`GROQ API error (400): ${responseText}`);
      return new Response(
        JSON.stringify({ 
          error: "Invalid audio format", 
          statusCode: 400,
          message: "The audio format was not recognized by the transcription service."
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    if (!response.ok) {
      console.error(`GROQ API error: Status ${response.status}, Response: ${responseText}`);
      throw new Error(`GROQ API error: ${response.status} ${response.statusText}`);
    }

    try {
      const result = JSON.parse(responseText);
      console.log('Transcription result:', result);
      console.log('Transcription text:', result.text);
      console.log('Transcription text length:', result.text.length);
      console.log('Transcription word count:', result.text.split(' ').length);
      
      // Log if we're getting "Thank you." as a default response
      if (result.text === "Thank you." || result.text.includes("Thank you")) {
        console.warn('Detected "Thank you" in response. This might be a default fallback from the API.');
        console.warn('Full audio data length:', bytes.length, 'bytes');
        console.warn('Audio response quality may be poor or silence was detected.');
      }
      
      // Log if we're getting a very short response
      if (result.text.length < 10) {
        console.warn('Detected very short response:', result.text);
        console.warn('This might indicate a partial transcription or an issue with the audio quality.');
      }

      // Return the full result object for debugging
      const responseObj = { 
        text: result.text,
        debug: {
          textLength: result.text.length,
          wordCount: result.text.split(' ').length,
          audioBytes: bytes.length,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('Sending response to client:', responseObj);
      
      return new Response(
        JSON.stringify(responseObj),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      console.error('Raw response text:', responseText);
      throw new Error('Failed to parse transcription response');
    }
  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
