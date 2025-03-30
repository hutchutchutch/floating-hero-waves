
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-visitor-id',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcriptionId, text, sessionId, visitorId } = await req.json();
    
    if (!transcriptionId || !text || !sessionId) {
      throw new Error('Missing required fields: transcriptionId, text, or sessionId');
    }
    
    console.log('Received request to generate response for:');
    console.log('- Session ID:', sessionId);
    console.log('- Transcription ID:', transcriptionId);
    console.log('- Text length:', text.length);
    console.log('- Text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    
    if (visitorId) {
      console.log('- Visitor ID:', visitorId);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // API keys for external services
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || Deno.env.get('VITE_GROQ_API_KEY') || '';
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') || '';
    const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY') || '';
    
    // Log API key status
    console.log('GROQ API key present:', GROQ_API_KEY ? 'Yes' : 'No');
    console.log('ELEVENLABS API key present:', ELEVENLABS_API_KEY ? 'Yes' : 'No');
    console.log('PERPLEXITY API key present:', PERPLEXITY_API_KEY ? 'Yes' : 'No');
    
    // Retrieve previous conversations from this session to build context
    console.log('Retrieving previous conversations from session:', sessionId);
    const { data: previousResponses, error: previousResponsesError } = await supabase
      .from('responses')
      .select('content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    
    if (previousResponsesError) {
      console.error('Error retrieving previous responses:', previousResponsesError);
    }
    
    const { data: previousTranscriptions, error: previousTranscriptionsError } = await supabase
      .from('transcriptions')
      .select('content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    
    if (previousTranscriptionsError) {
      console.error('Error retrieving previous transcriptions:', previousTranscriptionsError);
    }
    
    // Build conversation history
    const conversationHistory = [];
    
    if (previousTranscriptions && previousResponses) {
      // Combine and sort all previous exchanges by timestamp
      const allExchanges = [
        ...previousTranscriptions.map(t => ({ role: 'user', content: t.content, timestamp: new Date(t.created_at) })),
        ...previousResponses.map(r => ({ role: 'assistant', content: r.content, timestamp: new Date(r.created_at) }))
      ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Add to conversation history
      allExchanges.forEach(exchange => {
        conversationHistory.push({ role: exchange.role, content: exchange.content });
      });
      
      console.log(`Built conversation history with ${conversationHistory.length} exchanges`);
    }
    
    // Define the emotionally intelligent system prompt
    const systemPrompt = `You are an emotionally intelligent AI assistant designed to help users live a happy and fulfilling life.

CORE PRINCIPLES:
1. Practice deep listening and reflect back what you hear
2. Show genuine empathy and validation for the user's experiences
3. Ask thoughtful follow-up questions that help users gain clarity
4. Provide balanced perspective while honoring the user's worldview
5. Remember details from previous conversations to build continuity
6. Connect insights across conversations to help users see patterns
7. Suggest actionable steps for growth when appropriate
8. Maintain a warm, supportive tone throughout conversations

GUIDELINES:
- When a user shares difficulties, acknowledge emotions before offering solutions
- If you need to challenge a perspective, do so gently and with respect
- Build a mental knowledge graph of topics important to the user's life context
- Connect new information to your knowledge graph for deeper understanding
- Prioritize psychological safety and trust in all interactions
- Help users identify their own strengths and resources
- Use a warm, personable tone that feels like talking to a supportive friend

Remember that your goal is to help users gain insight into their patterns, values, and goals while offering genuine connection and support.`;
    
    // Prepare messages for the LLM
    const messages = [
      { role: 'system', content: systemPrompt },
    ];
    
    // Add conversation history if available
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }
    
    // Add the current user message
    messages.push({ role: 'user', content: text });
    
    console.log(`Sending ${messages.length} messages to LLM, including system prompt and history`);
    
    // Select the LLM to use based on available API keys (prioritize Perplexity if available)
    let responseText;
    
    if (PERPLEXITY_API_KEY) {
      console.log('Generating response with Perplexity...');
      
      // Generate response with Perplexity
      const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
          presence_penalty: 0.5
        })
      });
      
      if (!perplexityResponse.ok) {
        const errorText = await perplexityResponse.text();
        console.error('Perplexity API error:', perplexityResponse.status, errorText);
        throw new Error(`Perplexity API error: ${perplexityResponse.status} ${errorText}`);
      }
      
      const perplexityData = await perplexityResponse.json();
      responseText = perplexityData.choices[0].message.content;
      console.log('Generated response with Perplexity:', responseText.substring(0, 100) + '...');
    }
    else if (GROQ_API_KEY) {
      console.log('Generating response with Llama3-8b via GROQ...');
      
      // Generate response with Llama3-8b via GROQ
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: messages
        })
      });
      
      if (!groqResponse.ok) {
        const errorText = await groqResponse.text();
        console.error('GROQ API error:', groqResponse.status, errorText);
        throw new Error(`GROQ API error: ${groqResponse.status} ${errorText}`);
      }
      
      const groqData = await groqResponse.json();
      responseText = groqData.choices[0].message.content;
      console.log('Generated response with GROQ:', responseText.substring(0, 100) + '...');
    }
    else {
      throw new Error('No LLM API keys configured');
    }
    
    // Extract entities and concepts for our knowledge graph (simplified implementation)
    try {
      console.log('Analyzing response for knowledge graph entities...');
      // In a real implementation, we might use NLP or another AI call to extract entities
      // For now, we'll just store the raw text
      
      // Save response to database
      const { data: responseData, error: insertError } = await supabase
        .from('responses')
        .insert({
          session_id: sessionId,
          transcription_id: transcriptionId,
          content: responseText,
          visitor_id: visitorId || null
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
          content: responseText,  // Ensure content is always returned
          audio_url: audioUrl,
          visitorId: visitorId || null
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
