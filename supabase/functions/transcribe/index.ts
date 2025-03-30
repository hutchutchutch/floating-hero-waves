
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
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      console.error("GROQ API key not configured in edge function secrets");
      throw new Error('GROQ API key not configured in edge function secrets');
    } else {
      console.log("Found GROQ API key with length:", GROQ_API_KEY.length);
    }

    const requestData = await req.json();
    const { audio } = requestData;
    
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

    // Prepare audio blob
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });
    console.log(`Created audio blob with size: ${audioBlob.size} bytes`);
    
    // Create FormData to send to GROQ API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    console.log('Sending audio chunk to GROQ for transcription...');
    
    // Send to GROQ API for transcription
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GROQ API error: Status ${response.status}, Response: ${errorText}`);
      throw new Error(`GROQ API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Transcription result:', result);

    return new Response(
      JSON.stringify({ text: result.text }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
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
