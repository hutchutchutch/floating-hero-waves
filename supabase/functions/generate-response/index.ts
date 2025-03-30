
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import { neo4j } from "https://esm.sh/neo4j-driver@5.18.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-visitor-id',
}

// Life fulfillment domain schema categories
const FULFILLMENT_DOMAINS = [
  "relationships", "health", "career", "personal_growth", "spirituality", 
  "finances", "recreation", "purpose", "emotional_wellbeing", "community"
]

// Schema for Neo4j graph database
const SCHEMA = {
  nodes: {
    Person: {
      properties: ["visitorId", "sessionId"],
    },
    Concept: {
      properties: ["name", "description", "category", "importance"],
    },
    Goal: {
      properties: ["name", "description", "timeline", "status", "priority"],
    },
    Challenge: {
      properties: ["name", "description", "severity", "status"],
    },
    Value: {
      properties: ["name", "description", "importance"],
    },
    Emotion: {
      properties: ["name", "intensity", "valence", "timestamp"],
    },
    Habit: {
      properties: ["name", "description", "frequency", "statusType"],
    },
    Achievement: {
      properties: ["name", "description", "date"],
    },
  },
  relationships: {
    HAS_GOAL: {
      source: "Person",
      target: "Goal",
      properties: ["importance", "timeline"],
    },
    FACES_CHALLENGE: {
      source: "Person",
      target: "Challenge",
      properties: ["impact", "duration"],
    },
    HOLDS_VALUE: {
      source: "Person",
      target: "Value",
      properties: ["strength", "alignment"],
    },
    FEELS: {
      source: "Person",
      target: "Emotion",
      properties: ["context", "trigger", "duration"],
    },
    PRACTICES: {
      source: "Person",
      target: "Habit",
      properties: ["consistency", "difficulty", "impact"],
    },
    RELATED_TO: {
      source: "Concept",
      target: "Concept",
      properties: ["strength", "type"],
    },
    ACHIEVED: {
      source: "Person",
      target: "Achievement",
      properties: ["effort", "satisfaction"],
    },
    SUPPORTS: {
      source: "Concept",
      target: "Goal",
      properties: ["strength"],
    },
    HINDERS: {
      source: "Challenge",
      target: "Goal",
      properties: ["severity"],
    },
  },
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
    
    // Neo4j connection details
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || '';
    const NEO4J_USERNAME = Deno.env.get('NEO4J_USERNAME') || '';
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD') || '';
    
    // Log service key status
    console.log('GROQ API key present:', GROQ_API_KEY ? 'Yes' : 'No');
    console.log('ELEVENLABS API key present:', ELEVENLABS_API_KEY ? 'Yes' : 'No');
    console.log('PERPLEXITY API key present:', PERPLEXITY_API_KEY ? 'Yes' : 'No');
    console.log('NEO4J connection details present:', (NEO4J_URI && NEO4J_USERNAME && NEO4J_PASSWORD) ? 'Yes' : 'No');
    
    // Initialize Neo4j if credentials are available
    let neo4jDriver = null;
    let neo4jSession = null;
    
    if (NEO4J_URI && NEO4J_USERNAME && NEO4J_PASSWORD) {
      try {
        console.log('Initializing Neo4j connection...');
        neo4jDriver = neo4j.driver(
          NEO4J_URI,
          neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
        );
        
        // Verify connection
        await neo4jDriver.verifyConnectivity();
        console.log('Neo4j connection verified successfully');
        
        // Create session
        neo4jSession = neo4jDriver.session();
        
        // Create constraints and indexes if they don't exist
        await ensureNeo4jConstraintsAndIndexes(neo4jSession);
      } catch (neo4jError) {
        console.error('Neo4j connection error:', neo4jError);
        // Continue without Neo4j - we'll still generate responses
      }
    } else {
      console.log('Neo4j credentials not fully configured, proceeding without Neo4j integration');
    }
    
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
      
      // If Neo4j is connected, analyze previous conversations to build knowledge graph
      if (neo4jSession) {
        try {
          await updateKnowledgeGraph(neo4jSession, conversationHistory, visitorId, sessionId);
        } catch (graphError) {
          console.error('Error updating knowledge graph:', graphError);
          // Continue without failing if graph operations fail
        }
      }
    }
    
    // If Neo4j is available, get relevant contextual information
    let knowledgeGraphContext = "";
    let relevantConcepts = [];
    let suggestedFollowUps = [];
    
    if (neo4jSession) {
      try {
        // Extract knowledge context from the graph
        const graphResults = await getKnowledgeGraphContext(neo4jSession, visitorId, sessionId, text);
        knowledgeGraphContext = graphResults.contextString;
        relevantConcepts = graphResults.relevantConcepts;
        suggestedFollowUps = graphResults.suggestedFollowUps;
        
        console.log('Retrieved knowledge graph context:', knowledgeGraphContext.substring(0, 100) + "...");
        console.log('Relevant concepts:', relevantConcepts.slice(0, 5));
        console.log('Suggested follow-ups:', suggestedFollowUps.slice(0, 2));
      } catch (contextError) {
        console.error('Error getting knowledge graph context:', contextError);
        // Continue without graph context
      }
    }
    
    // Define the emotionally intelligent system prompt, now enhanced with knowledge graph info
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

KNOWLEDGE GRAPH AWARENESS:
${knowledgeGraphContext ? `Here's what I know about this person from our previous conversations:
${knowledgeGraphContext}

This information should inform your response, but do not explicitly mention the knowledge graph or directly reference it. Just use this information to provide more personalized, relevant support.` : "I don't have any previous context about this person yet, so I'll be extra attentive to what they share and ask thoughtful questions to help them explore their thoughts and feelings."}

${relevantConcepts.length > 0 ? `Concepts that may be relevant to this conversation:
${relevantConcepts.map(c => `- ${c.name}: ${c.description}`).join('\n')}` : ""}

GUIDELINES:
- When a user shares difficulties, acknowledge emotions before offering solutions
- If you need to challenge a perspective, do so gently and with respect
- Help users identify their own strengths and resources
- Use a warm, personable tone that feels like talking to a supportive friend
- Connect to the core domains of a fulfilling life: relationships, health, career, personal growth, spirituality, finances, recreation, purpose, emotional wellbeing, and community

${suggestedFollowUps.length > 0 ? `CONVERSATION GUIDANCE:
Consider exploring these areas if appropriate in your response:
${suggestedFollowUps.join('\n')}

But only if they naturally fit the conversation flow - don't force them.` : ""}

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
    
    // Extract entities and insights for our knowledge graph
    try {
      console.log('Analyzing response for knowledge graph entities...');
      
      if (neo4jSession) {
        // Process the current exchange and store insights in Neo4j
        await processExchangeForKnowledgeGraph(
          neo4jSession, 
          text, 
          responseText, 
          visitorId || "anonymous", 
          sessionId
        );
      }
      
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
      
      // Clean up Neo4j session if it exists
      if (neo4jSession) {
        try {
          await neo4jSession.close();
        } catch (closeError) {
          console.error('Error closing Neo4j session:', closeError);
        }
      }
      
      if (neo4jDriver) {
        try {
          await neo4jDriver.close();
        } catch (closeError) {
          console.error('Error closing Neo4j driver:', closeError);
        }
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

// Helper function to ensure Neo4j constraints and indexes exist
async function ensureNeo4jConstraintsAndIndexes(session) {
  console.log('Setting up Neo4j constraints and indexes...');
  
  try {
    // Create constraints for Person nodes
    await session.run(`
      CREATE CONSTRAINT person_id IF NOT EXISTS
      FOR (p:Person) REQUIRE p.visitorId IS UNIQUE
    `);
    
    // Create indices for faster queries
    await session.run(`
      CREATE INDEX concept_name IF NOT EXISTS
      FOR (c:Concept) ON (c.name)
    `);
    
    console.log('Neo4j constraints and indexes created successfully');
  } catch (error) {
    console.error('Error setting up Neo4j constraints:', error);
    throw error;
  }
}

// Process a conversation exchange and store insights in Neo4j
async function processExchangeForKnowledgeGraph(session, userText, assistantText, visitorId, sessionId) {
  console.log('Processing exchange for knowledge graph...');
  
  try {
    // First, ensure the Person node exists
    await session.run(`
      MERGE (p:Person {visitorId: $visitorId})
      ON CREATE SET p.sessionId = $sessionId, p.firstSeen = datetime()
      ON MATCH SET p.lastSeen = datetime(), p.sessionId = $sessionId
      RETURN p
    `, { visitorId, sessionId });
    
    // Simple keyword-based extraction for now
    // In a real implementation, we would use the LLM to extract entities/concepts/etc.
    const domainKeywords = {
      relationships: ["family", "friend", "partner", "spouse", "colleague", "connection", "relationship", "social"],
      health: ["exercise", "nutrition", "sleep", "wellness", "health", "fitness", "medical", "diet"],
      career: ["job", "work", "career", "profession", "business", "employment", "workplace"],
      personal_growth: ["learning", "growth", "development", "skill", "improvement", "progress", "goal"],
      spirituality: ["faith", "spiritual", "meditation", "mindfulness", "belief", "religion", "purpose"],
      finances: ["money", "financial", "saving", "investment", "budget", "expense", "income", "debt"],
      recreation: ["hobby", "leisure", "fun", "recreation", "entertainment", "relax", "vacation"],
      purpose: ["meaning", "purpose", "mission", "passion", "direction", "contribution", "impact"],
      emotional_wellbeing: ["emotion", "feeling", "mental health", "stress", "anxiety", "depression", "happiness"],
      community: ["community", "volunteer", "society", "belonging", "contribution", "service"],
    };
    
    // Extract potential concepts from the user text
    const combinedText = userText + " " + assistantText;
    const concepts = [];
    
    // For each domain, check if related keywords appear in the text
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      for (const keyword of keywords) {
        if (combinedText.toLowerCase().includes(keyword.toLowerCase())) {
          // Found a keyword related to this domain
          const keywordIndex = combinedText.toLowerCase().indexOf(keyword.toLowerCase());
          // Extract a bit of context (100 chars around the keyword)
          const start = Math.max(0, keywordIndex - 50);
          const end = Math.min(combinedText.length, keywordIndex + keyword.length + 50);
          const context = combinedText.substring(start, end);
          
          concepts.push({
            name: keyword,
            description: context,
            category: domain,
            importance: 0.5, // Default importance
          });
          
          break; // Only add one concept per domain for now
        }
      }
    }
    
    // Create Concept nodes and relationships to the Person
    for (const concept of concepts) {
      await session.run(`
        MERGE (c:Concept {name: $name, category: $category})
        ON CREATE SET c.description = $description, c.importance = $importance, c.created = datetime()
        ON MATCH SET c.description = $description, c.updated = datetime()
        
        WITH c
        MATCH (p:Person {visitorId: $visitorId})
        MERGE (p)-[r:INTERESTED_IN]->(c)
        ON CREATE SET r.firstMentioned = datetime(), r.strength = 0.5
        ON MATCH SET r.lastMentioned = datetime(), r.strength = r.strength + 0.1
        RETURN c, p, r
      `, {
        visitorId,
        name: concept.name,
        description: concept.description,
        category: concept.category,
        importance: concept.importance,
      });
    }
    
    console.log(`Added ${concepts.length} concepts to knowledge graph for person ${visitorId}`);
    
    // Store the complete exchange as a Conversation node
    await session.run(`
      MATCH (p:Person {visitorId: $visitorId})
      CREATE (conv:Conversation {
        userText: $userText,
        assistantText: $assistantText,
        timestamp: datetime(),
        sessionId: $sessionId
      })
      CREATE (p)-[:HAD_CONVERSATION]->(conv)
      RETURN conv
    `, { visitorId, userText, assistantText, sessionId });
    
    return true;
  } catch (error) {
    console.error('Error processing exchange for knowledge graph:', error);
    throw error;
  }
}

// Get relevant context from the knowledge graph to enhance LLM response
async function getKnowledgeGraphContext(session, visitorId, sessionId, currentText) {
  console.log('Retrieving knowledge graph context...');
  
  const contextString = [];
  const relevantConcepts = [];
  const suggestedFollowUps = [];
  
  try {
    // Check if the person exists in the graph
    const personResult = await session.run(`
      MATCH (p:Person {visitorId: $visitorId})
      RETURN p
    `, { visitorId });
    
    if (personResult.records.length === 0) {
      console.log('No person found in knowledge graph for visitor ID:', visitorId);
      return { 
        contextString: "", 
        relevantConcepts: [], 
        suggestedFollowUps: [
          "Ask what brings them joy in life",
          "Explore what they find meaningful in their daily activities",
          "Inquire about their personal definition of success"
        ] 
      };
    }
    
    // Get the concepts the person has shown interest in
    const conceptsResult = await session.run(`
      MATCH (p:Person {visitorId: $visitorId})-[r:INTERESTED_IN]->(c:Concept)
      RETURN c.name AS name, c.description AS description, c.category AS category, r.strength AS strength
      ORDER BY r.strength DESC
      LIMIT 10
    `, { visitorId });
    
    // For each concept, add to relevant concepts
    conceptsResult.records.forEach(record => {
      relevantConcepts.push({
        name: record.get('name'),
        description: record.get('description'),
        category: record.get('category'),
        strength: record.get('strength'),
      });
      
      contextString.push(`They've mentioned interest in ${record.get('name')} (related to ${record.get('category')}).`);
    });
    
    // Get previous conversations
    const conversationsResult = await session.run(`
      MATCH (p:Person {visitorId: $visitorId})-[:HAD_CONVERSATION]->(conv:Conversation)
      RETURN conv.userText AS userText, conv.assistantText AS assistantText, conv.timestamp AS timestamp
      ORDER BY conv.timestamp DESC
      LIMIT 5
    `, { visitorId });
    
    if (conversationsResult.records.length > 0) {
      contextString.push("From previous conversations, I know:");
      
      conversationsResult.records.forEach(record => {
        const userText = record.get('userText');
        // Just add a brief summary of what they talked about
        contextString.push(`- They discussed: "${userText.substring(0, 100)}${userText.length > 100 ? '...' : ''}"`);
      });
    }
    
    // Generate suggested follow-up questions based on domains not yet explored
    const exploredDomains = new Set(relevantConcepts.map(c => c.category));
    const unexploredDomains = FULFILLMENT_DOMAINS.filter(domain => !exploredDomains.has(domain));
    
    // Create follow-up questions for unexplored domains
    unexploredDomains.slice(0, 3).forEach(domain => {
      switch(domain) {
        case 'relationships':
          suggestedFollowUps.push("Ask about their key relationships and social connections");
          break;
        case 'health':
          suggestedFollowUps.push("Explore their perspective on physical health and wellbeing");
          break;
        case 'career':
          suggestedFollowUps.push("Inquire about their work satisfaction and career aspirations");
          break;
        case 'personal_growth':
          suggestedFollowUps.push("Ask what areas of personal growth they're focused on");
          break;
        case 'spirituality':
          suggestedFollowUps.push("Explore what gives their life meaning and purpose");
          break;
        case 'finances':
          suggestedFollowUps.push("Ask about their relationship with financial security");
          break;
        case 'recreation':
          suggestedFollowUps.push("Inquire about activities that bring them joy and recreation");
          break;
        case 'purpose':
          suggestedFollowUps.push("Explore what gives their life meaning and direction");
          break;
        case 'emotional_wellbeing':
          suggestedFollowUps.push("Ask about their emotional landscape and coping strategies");
          break;
        case 'community':
          suggestedFollowUps.push("Inquire about their sense of community and belonging");
          break;
      }
    });
    
    // Also add some generic follow-ups if we don't have many specific ones
    if (suggestedFollowUps.length < 3) {
      suggestedFollowUps.push("Ask what brings them joy in life");
      suggestedFollowUps.push("Explore what they find meaningful in their daily activities");
      suggestedFollowUps.push("Inquire about their personal definition of success");
    }
    
    return {
      contextString: contextString.join('\n'),
      relevantConcepts,
      suggestedFollowUps: suggestedFollowUps.slice(0, 3) // Limit to 3 suggestions
    };
  } catch (error) {
    console.error('Error getting knowledge graph context:', error);
    return { 
      contextString: "", 
      relevantConcepts: [], 
      suggestedFollowUps: [] 
    };
  }
}
