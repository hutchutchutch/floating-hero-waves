
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcriptionId, text, sessionId } = await req.json();
    
    if (!transcriptionId || !text || !sessionId) {
      throw new Error('Missing required fields: transcriptionId, text, or sessionId');
    }
    
    console.log('Received request to generate response for:');
    console.log('- Session ID:', sessionId);
    console.log('- Transcription ID:', transcriptionId);
    console.log('- Text length:', text.length);
    console.log('- Text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // API keys for external services
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || Deno.env.get('VITE_GROQ_API_KEY') || '';
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') || '';
    
    // Log API key status
    console.log('GROQ API key present:', GROQ_API_KEY ? 'Yes' : 'No');
    console.log('ELEVENLABS API key present:', ELEVENLABS_API_KEY ? 'Yes' : 'No');
    
    if (!GROQ_API_KEY) {
      throw new Error('GROQ API key not configured');
    }
    
    console.log('Generating response with Llama3-8b...');
    
    // Generate response with Llama3-8b via GROQ
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: text }
        ]
      })
    });
    
    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('GROQ API error:', groqResponse.status, errorText);
      throw new Error(`GROQ API error: ${groqResponse.status} ${errorText}`);
    }
    
    const groqData = await groqResponse.json();
    const responseText = groqData.choices[0].message.content;
    console.log('Generated response:', responseText.substring(0, 100) + '...');
    
    // Save response to database
    const { data: responseData, error: insertError } = await supabase
      .from('responses')
      .insert({
        session_id: sessionId,
        transcription_id: transcriptionId,
        content: responseText
      })
      .select();
      
    if (insertError) {
      console.error('Error inserting response:', insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }
    
    console.log('Response saved to database with ID:', responseData[0].id);
    
    let audioUrl = null;
    
    // Generate audio with ElevenLabs if API key is available
    if (ELEVENLABS_API_KEY) {
      console.log('Generating audio with ElevenLabs...');
      
      // Use a more manageable text size for TTS (first 1000 chars)
      const ttsText = responseText.length > 1000 ? 
        responseText.substring(0, 1000) + "..." : 
        responseText;
      
      try {
        // Log the request details for debugging
        console.log('ElevenLabs request details:');
        console.log('- Voice ID: 21m00Tcm4TlvDq8ikWAM');
        console.log('- Model: eleven_monolingual_v1');
        console.log('- Text length:', ttsText.length);
        console.log('- Text preview:', ttsText.substring(0, 100) + '...');
        
        const audioResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: ttsText,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5
            }
          })
        });
        
        // Log the response status and headers
        console.log('ElevenLabs response status:', audioResponse.status);
        console.log('ElevenLabs response headers:', Object.fromEntries(audioResponse.headers.entries()));
        
        if (!audioResponse.ok) {
          const elevenlabsError = await audioResponse.text();
          console.error('ElevenLabs API error:', audioResponse.status, elevenlabsError);
          throw new Error(`ElevenLabs API error: ${audioResponse.status} - ${elevenlabsError}`);
        }
        
        // Get audio as array buffer
        const audioArrayBuffer = await audioResponse.arrayBuffer();
        const audioBytes = new Uint8Array(audioArrayBuffer);
        console.log('Received audio response:', audioBytes.length, 'bytes');
        
        // Upload to Supabase Storage
        const fileName = `responses/${sessionId}/${responseData[0].id}.mp3`;
        
        // Ensure the storage bucket exists
        const { data: bucketData, error: bucketError } = await supabase
          .storage
          .getBucket('audio');
        
        // Create bucket if it doesn't exist
        if (bucketError) {
          console.log('Audio bucket not found, attempting to create it...');
          const { error: createBucketError } = await supabase
            .storage
            .createBucket('audio', {
              public: true
            });
            
          if (createBucketError) {
            console.error('Error creating audio bucket:', createBucketError);
            throw new Error(`Storage bucket creation error: ${createBucketError.message}`);
          }
          console.log('Audio bucket created successfully');
        }
        
        const { data: storageData, error: storageError } = await supabase
          .storage
          .from('audio')
          .upload(fileName, audioBytes, {
            contentType: 'audio/mpeg',
            upsert: true
          });
          
        if (storageError) {
          console.error('Storage upload error:', storageError);
          throw new Error(`Storage error: ${storageError.message}`);
        }
        
        console.log('Audio uploaded to storage:', fileName);
        
        // Get public URL
        const { data: urlData } = supabase
          .storage
          .from('audio')
          .getPublicUrl(fileName);
          
        audioUrl = urlData.publicUrl;
        console.log('Audio public URL:', audioUrl);
        
        // Update response with audio URL
        const { error: updateError } = await supabase
          .from('responses')
          .update({ audio_url: audioUrl })
          .eq('id', responseData[0].id);
          
        if (updateError) {
          console.error('Error updating response with audio URL:', updateError);
        }
      } catch (elevenlabsError) {
        console.error('Error generating audio with ElevenLabs:', elevenlabsError);
        // Continue without audio - we still have the text response
      }
    } else {
      console.log('ElevenLabs API key not configured, skipping audio generation');
    }
    
    return new Response(
      JSON.stringify({
        id: responseData[0].id,
        text: responseText,
        audio_url: audioUrl
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Error generating response:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
