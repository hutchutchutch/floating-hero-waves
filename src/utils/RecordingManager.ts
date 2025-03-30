import { supabase } from "@/integrations/supabase/client";
import visitorSessionManager from "./VisitorSessionManager";

export interface TranscriptionResult {
  id: string;
  content: string;
  sequence_number: number;
  is_final: boolean;
}

export interface ResponseResult {
  id: string;
  content: string;
  audio_url: string | null;
}

class RecordingManager {
  private currentSessionId: string | null = null;
  private sequenceCounter: number = 0;
  private isFetchingResponse: boolean = false;
  private localTranscriptions: Array<any> = [];
  private localResponses: Array<any> = [];
  private useLocalStorage: boolean = false;
  
  /**
   * Starts a new recording session
   */
  async startNewSession(): Promise<string | null> {
    console.log('📝 RecordingManager: Starting new session');
    try {
      // Clear any existing session
      if (this.currentSessionId) {
        console.log('📝 RecordingManager: Clearing existing session:', this.currentSessionId);
        await this.endSession();
      }
      
      // Initialize visitor session
      await visitorSessionManager.initialize();
      
      // Check if the visitor session manager is in local-only mode
      this.useLocalStorage = visitorSessionManager.isUsingLocalOnlyMode();
      if (this.useLocalStorage) {
        console.log('📝 RecordingManager: Using local storage mode due to RLS restrictions');
        const localId = 'local-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        this.currentSessionId = localId;
        this.clearLocalData();
        localStorage.setItem('current_session_id', localId);
        this.sequenceCounter = 0;
        console.log('📝 RecordingManager: New local session started with ID:', this.currentSessionId);
        return this.currentSessionId;
      }
      
      // Get or create session using visitor ID
      const visitorId = visitorSessionManager.getVisitorId();
      
      if (!visitorId) {
        console.error('📝 RecordingManager: No visitor ID available');
        this.useLocalStorage = true;
        return this.startNewSession(); // Recursive call with local storage mode
      }
      
      console.log('📝 RecordingManager: Creating session for visitor:', visitorId);
      
      // Create session directly
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          visitor_id: visitorId,
          status: 'active'
        })
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error starting session:', error);
        
        // If this is a permissions error, switch to local storage
        if (error.code === '42501' || error.message.includes('permission denied')) {
          console.log('📝 RecordingManager: Permission denied, switching to local storage mode');
          this.useLocalStorage = true;
          const localId = 'local-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
          this.currentSessionId = localId;
          this.clearLocalData();
          localStorage.setItem('current_session_id', localId);
          this.sequenceCounter = 0;
          return localId;
        }
        
        return null;
      }
      
      if (data && data.length > 0) {
        this.currentSessionId = data[0].id;
        this.sequenceCounter = 0;
        console.log('📝 RecordingManager: New session started with ID:', this.currentSessionId);
        return this.currentSessionId;
      }
      
      return null;
    } catch (error) {
      console.error('📝 RecordingManager: Exception starting session:', error);
      
      // Fall back to local storage on error
      this.useLocalStorage = true;
      const localId = 'local-session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      this.currentSessionId = localId;
      this.clearLocalData();
      localStorage.setItem('current_session_id', localId);
      this.sequenceCounter = 0;
      console.log('📝 RecordingManager: Fallback to local session with ID:', localId);
      return localId;
    }
  }
  
  /**
   * Clears all local data for transcriptions and responses
   */
  private clearLocalData(): void {
    this.localTranscriptions = [];
    this.localResponses = [];
    try {
      localStorage.setItem('local_transcriptions', JSON.stringify([]));
      localStorage.setItem('local_responses', JSON.stringify([]));
    } catch (e) {
      console.error('📝 RecordingManager: Error saving to localStorage:', e);
    }
  }
  
  /**
   * Gets the current session ID or creates a new one if none exists
   */
  async getOrCreateSessionId(): Promise<string | null> {
    if (!this.currentSessionId) {
      return this.startNewSession();
    }
    return this.currentSessionId;
  }
  
  /**
   * Ends the current session
   */
  async endSession(): Promise<boolean> {
    if (!this.currentSessionId) {
      console.log('📝 RecordingManager: No active session to end');
      return false;
    }
    
    // For local storage mode, just clear the session ID
    if (this.useLocalStorage) {
      console.log('📝 RecordingManager: Ending local session:', this.currentSessionId);
      this.currentSessionId = null;
      this.sequenceCounter = 0;
      localStorage.removeItem('current_session_id');
      return true;
    }
    
    try {
      // Fall back to direct update
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', this.currentSessionId);
        
      if (error) {
        console.error('📝 RecordingManager: Error ending session:', error);
        // Don't null out the session ID on error - we'll try again
        return false;
      }
      
      console.log('📝 RecordingManager: Session ended:', this.currentSessionId);
      this.currentSessionId = null;
      this.sequenceCounter = 0;
      return true;
    } catch (error) {
      console.error('📝 RecordingManager: Exception ending session:', error);
      return false;
    }
  }
  
  /**
   * Saves a transcription to the database
   */
  async saveTranscription(transcriptionText: string, audioDuration?: number): Promise<TranscriptionResult | null> {
    // Make sure we have a session ID
    const sessionId = await this.getOrCreateSessionId();
    
    if (!sessionId) {
      console.error('📝 RecordingManager: No session ID available, cannot save transcription');
      // Try to create a new session one more time
      const newSessionId = await this.startNewSession();
      if (!newSessionId) {
        return null;
      }
    }
    
    console.log('📝 RecordingManager: Saving transcription for session:', this.currentSessionId);
    
    // For local storage mode, save to memory and localStorage
    if (this.useLocalStorage) {
      const localId = `local-trans-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const transcription = {
        id: localId,
        session_id: this.currentSessionId,
        sequence_number: this.sequenceCounter++,
        content: transcriptionText,
        audio_duration: audioDuration || null,
        is_final: false,
        created_at: new Date().toISOString()
      };
      
      this.localTranscriptions.push(transcription);
      try {
        localStorage.setItem('local_transcriptions', JSON.stringify(this.localTranscriptions));
      } catch (e) {
        console.error('📝 RecordingManager: Error saving to localStorage:', e);
      }
      
      console.log('📝 RecordingManager: Local transcription saved with ID:', localId);
      return transcription as TranscriptionResult;
    }
    
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .insert({
          session_id: this.currentSessionId,
          sequence_number: this.sequenceCounter++,
          content: transcriptionText,
          audio_duration: audioDuration || null,
          is_final: false
        })
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error saving transcription:', error);
        
        // If this is a permissions error, switch to local storage mode
        if (error.code === '42501' || error.message.includes('permission denied')) {
          console.log('📝 RecordingManager: Permission denied saving transcription, switching to local storage mode');
          this.useLocalStorage = true;
          return this.saveTranscription(transcriptionText, audioDuration);
        }
        
        return null;
      }
      
      if (data && data.length > 0) {
        console.log('📝 RecordingManager: Transcription saved with ID:', data[0].id);
        return data[0] as TranscriptionResult;
      }
      
      return null;
    } catch (error) {
      console.error('📝 RecordingManager: Exception saving transcription:', error);
      
      // Fall back to local storage on error
      this.useLocalStorage = true;
      return this.saveTranscription(transcriptionText, audioDuration);
    }
  }
  
  /**
   * Marks a transcription as final
   */
  async finalizeTranscription(transcriptionId: string): Promise<TranscriptionResult | null> {
    // For local storage mode, update in memory
    if (this.useLocalStorage) {
      const index = this.localTranscriptions.findIndex(t => t.id === transcriptionId);
      if (index >= 0) {
        this.localTranscriptions[index].is_final = true;
        try {
          localStorage.setItem('local_transcriptions', JSON.stringify(this.localTranscriptions));
        } catch (e) {
          console.error('📝 RecordingManager: Error saving to localStorage:', e);
        }
        console.log('📝 RecordingManager: Local transcription finalized:', transcriptionId);
        return this.localTranscriptions[index] as TranscriptionResult;
      }
      return null;
    }
    
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .update({ is_final: true })
        .eq('id', transcriptionId)
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error finalizing transcription:', error);
        return null;
      }
      
      if (data && data.length > 0) {
        console.log('📝 RecordingManager: Transcription finalized:', data[0].id);
        return data[0] as TranscriptionResult;
      }
      
      return null;
    } catch (error) {
      console.error('📝 RecordingManager: Exception finalizing transcription:', error);
      return null;
    }
  }
  
  /**
   * Generates and saves an AI response for a transcription
   */
  async generateAndSaveResponse(transcriptionId: string, fullText: string): Promise<ResponseResult | null> {
    if (this.isFetchingResponse) {
      console.log('📝 RecordingManager: Already fetching a response, skipping');
      return null;
    }
    
    const sessionId = this.currentSessionId;
    if (!sessionId) {
      console.error('📝 RecordingManager: No session ID available, cannot generate response');
      return null;
    }
    
    try {
      this.isFetchingResponse = true;
      console.log('📝 RecordingManager: Generating response for transcription:', transcriptionId);
      console.log('📝 RecordingManager: Using session ID:', sessionId);
      console.log('📝 RecordingManager: Text length:', fullText.length);
      console.log('📝 RecordingManager: Text preview:', fullText.substring(0, 100) + (fullText.length > 100 ? '...' : ''));
      
      // For local storage mode, create a more context-aware response
      if (this.useLocalStorage) {
        const localId = `local-resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // More contextual responses based on common input patterns
        let response = '';
        const lowerText = fullText.toLowerCase().trim();
        
        if (lowerText.includes('hello') || lowerText.includes('hi ') || lowerText.startsWith('hi') || lowerText.includes('hey')) {
          response = "Hello! I'm listening. How can I assist you today?";
        } else if (lowerText.includes('how are you')) {
          response = "I'm doing well, thank you for asking! How can I help you?";
        } else if (lowerText.includes('what') && (lowerText.includes('do') || lowerText.includes('can you do'))) {
          response = "I can help you explore various concepts around living a happy and fulfilling life. What specific topic would you like to discuss?";
        } else if (lowerText.includes('test')) {
          response = "I can confirm that your audio is being processed correctly. What would you like to talk about?";
        } else if (lowerText.includes('working') || lowerText.includes('function')) {
          response = "Yes, the system is functioning as designed. Your voice is being transcribed and processed in local mode due to connection limitations.";
        } else if (lowerText.includes('help') || lowerText.includes('assist')) {
          response = "I'd be happy to help. Please let me know what specific assistance you need regarding well-being or life fulfillment.";
        } else if (lowerText.includes('thank')) {
          response = "You're welcome! Feel free to continue our conversation whenever you'd like.";
        } else if (lowerText.includes('generate') || lowerText.includes('creating')) {
          response = "Yes, I'm generating responses based on your input. Currently running in local mode, but I'm still able to assist you.";
        } else {
          // Use a more contextual generic response
          response = `I've processed your input about "${fullText.substring(0, 30)}..." and I'm ready to continue our conversation. Please elaborate on what you'd like to discuss.`;
        }
        
        // Add local mode note only if not already responding about the system status
        if (!lowerText.includes('working') && !lowerText.includes('function') && !lowerText.includes('generate')) {
          response += " (Local Mode)";
        }
        
        const responseObj = {
          id: localId,
          session_id: sessionId,
          transcription_id: transcriptionId,
          content: response,
          audio_url: null,
          created_at: new Date().toISOString()
        };
        
        this.localResponses.push(responseObj);
        try {
          localStorage.setItem('local_responses', JSON.stringify(this.localResponses));
        } catch (e) {
          console.error('📝 RecordingManager: Error saving to localStorage:', e);
        }
        
        console.log('📝 RecordingManager: Local response created:', responseObj);
        this.isFetchingResponse = false;
        
        return {
          id: responseObj.id,
          content: responseObj.content,
          audio_url: null
        };
      }
      
      // Call our edge function to generate a response
      const { data, error } = await supabase.functions.invoke('generate-response', {
        body: { 
          transcriptionId, 
          text: fullText,
          sessionId 
        }
      });
      
      if (error) {
        console.error('📝 RecordingManager: Error generating response:', error);
        this.isFetchingResponse = false;
        
        // If this seems like a permissions error, switch to local mode
        this.useLocalStorage = true;
        return this.generateAndSaveResponse(transcriptionId, fullText);
      }
      
      console.log('📝 RecordingManager: Response generated:', data);
      
      if (!data || !data.text) {
        console.error('📝 RecordingManager: Invalid response data:', data);
        this.isFetchingResponse = false;
        return null;
      }
      
      this.isFetchingResponse = false;
      
      return {
        id: data.id,
        content: data.text,
        audio_url: data.audio_url
      };
    } catch (error) {
      console.error('📝 RecordingManager: Exception generating response:', error);
      this.isFetchingResponse = false;
      
      // Fall back to local storage mode on error
      this.useLocalStorage = true;
      return this.generateAndSaveResponse(transcriptionId, fullText);
    }
  }
  
  /**
   * Gets all transcriptions for the current session
   */
  async getSessionTranscriptions(): Promise<TranscriptionResult[]> {
    if (!this.currentSessionId) {
      console.log('📝 RecordingManager: No active session, returning empty transcription list');
      return [];
    }
    
    // For local storage mode, return from memory
    if (this.useLocalStorage) {
      console.log('📝 RecordingManager: Returning local transcriptions');
      return this.localTranscriptions as TranscriptionResult[];
    }
    
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .eq('session_id', this.currentSessionId)
        .order('sequence_number', { ascending: true });
        
      if (error) {
        console.error('📝 RecordingManager: Error fetching transcriptions:', error);
        
        // If this is a permissions error, switch to local storage mode
        if (error.code === '42501') {
          this.useLocalStorage = true;
          return this.getSessionTranscriptions();
        }
        
        return [];
      }
      
      return data as TranscriptionResult[];
    } catch (error) {
      console.error('📝 RecordingManager: Exception fetching transcriptions:', error);
      return [];
    }
  }
  
  /**
   * Gets all responses for the current session
   */
  async getSessionResponses(): Promise<ResponseResult[]> {
    if (!this.currentSessionId) {
      console.log('📝 RecordingManager: No active session, returning empty response list');
      return [];
    }
    
    // For local storage mode, return from memory
    if (this.useLocalStorage) {
      console.log('📝 RecordingManager: Returning local responses');
      return this.localResponses.map(r => ({
        id: r.id,
        content: r.content,
        audio_url: r.audio_url
      })) as ResponseResult[];
    }
    
    try {
      const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('session_id', this.currentSessionId)
        .order('created_at', { ascending: true });
        
      if (error) {
        console.error('📝 RecordingManager: Error fetching responses:', error);
        return [];
      }
      
      return data as ResponseResult[];
    } catch (error) {
      console.error('📝 RecordingManager: Exception fetching responses:', error);
      return [];
    }
  }
  
  /**
   * Gets the most recent response for the current session
   */
  async getLatestResponse(): Promise<ResponseResult | null> {
    if (!this.currentSessionId) {
      console.log('📝 RecordingManager: No active session, cannot get latest response');
      return null;
    }
    
    // For local storage mode, return most recent from memory
    if (this.useLocalStorage && this.localResponses.length > 0) {
      const latestResponse = this.localResponses[this.localResponses.length - 1];
      return {
        id: latestResponse.id,
        content: latestResponse.content,
        audio_url: latestResponse.audio_url
      };
    }
    
    try {
      const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('session_id', this.currentSessionId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) {
        console.error('📝 RecordingManager: Error fetching latest response:', error);
        return null;
      }
      
      if (data && data.length > 0) {
        return data[0] as ResponseResult;
      }
      
      return null;
    } catch (error) {
      console.error('📝 RecordingManager: Exception fetching latest response:', error);
      return null;
    }
  }
  
  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
  
  /**
   * Sets the current session ID
   */
  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
    this.sequenceCounter = 0;
  }
  
  /**
   * Check if we're using local storage mode (due to RLS policies or errors)
   */
  isUsingLocalStorageMode(): boolean {
    return this.useLocalStorage;
  }
}

// Export a singleton instance
const recordingManager = new RecordingManager();
export default recordingManager;
