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
      // Initialize visitor session
      await visitorSessionManager.initialize();
      
      // Check if the visitor session manager is in local-only mode
      this.useLocalStorage = visitorSessionManager.isUsingLocalOnlyMode();
      if (this.useLocalStorage) {
        console.log('📝 RecordingManager: Using local storage mode due to RLS restrictions');
        const localId = 'local-session-' + Date.now();
        this.currentSessionId = localId;
        this.clearLocalData();
        localStorage.setItem('current_session_id', localId);
        this.sequenceCounter = 0;
        console.log('📝 RecordingManager: New local session started with ID:', this.currentSessionId);
        return this.currentSessionId;
      }
      
      // Get or create session using visitor ID
      this.currentSessionId = await visitorSessionManager.getOrCreateSessionId();
      
      if (this.currentSessionId) {
        this.sequenceCounter = 0;
        console.log('📝 RecordingManager: New session started with ID:', this.currentSessionId);
        return this.currentSessionId;
      }
      
      // Fall back to previous method if visitor session fails
      // Check if user is authenticated
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData?.session?.user?.id;
      
      // Create session object
      const sessionData: any = {};
      if (userId) {
        sessionData.user_id = userId;
      }
      
      // Add visitor ID if available
      const visitorId = visitorSessionManager.getVisitorId();
      if (visitorId) {
        sessionData.visitor_id = visitorId;
      }
      
      const { data, error } = await supabase
        .from('sessions')
        .insert(sessionData)
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error starting session:', error);
        
        // If this is a permissions error, switch to local storage
        if (error.code === '42501') {
          console.log('📝 RecordingManager: Permission denied, switching to local storage mode');
          this.useLocalStorage = true;
          const localId = 'local-session-' + Date.now();
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
      const localId = 'local-session-' + Date.now();
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
      // Try to end session using visitor session manager first
      const visitorSessionResult = await visitorSessionManager.endCurrentSession();
      
      if (visitorSessionResult) {
        console.log('📝 RecordingManager: Session ended via visitor session manager:', this.currentSessionId);
        this.currentSessionId = null;
        this.sequenceCounter = 0;
        return true;
      }
      
      // Fall back to direct update if needed
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', this.currentSessionId);
        
      if (error) {
        console.error('📝 RecordingManager: Error ending session:', error);
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
    const sessionId = await this.getOrCreateSessionId();
    
    if (!sessionId) {
      console.error('📝 RecordingManager: No session ID available, cannot save transcription');
      return null;
    }
    
    // For local storage mode, save to memory and localStorage
    if (this.useLocalStorage) {
      const localId = `local-trans-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const transcription = {
        id: localId,
        session_id: sessionId,
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
        // If localStorage fails, just keep in memory
      }
      
      console.log('📝 RecordingManager: Local transcription saved with ID:', localId);
      return transcription as TranscriptionResult;
    }
    
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .insert({
          session_id: sessionId,
          sequence_number: this.sequenceCounter++,
          content: transcriptionText,
          audio_duration: audioDuration || null,
          is_final: false
        })
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error saving transcription:', error);
        
        // If this is a permissions error, switch to local storage mode
        if (error.code === '42501') {
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
      
      // For local storage mode, create a simple response (no AI generation)
      if (this.useLocalStorage) {
        const localId = `local-resp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const demoResponses = [
          "I understand what you're saying. Can you tell me more?",
          "That's interesting! I'm processing that information.",
          "I'm listening and understanding your input.",
          "Thanks for sharing that information with me.",
          "I've noted your comments and am ready to assist further."
        ];
        
        const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
        
        const response = {
          id: localId,
          session_id: sessionId,
          transcription_id: transcriptionId,
          content: randomResponse + " (Local Mode - RLS Policy Restricted)",
          audio_url: null,
          created_at: new Date().toISOString()
        };
        
        this.localResponses.push(response);
        try {
          localStorage.setItem('local_responses', JSON.stringify(this.localResponses));
        } catch (e) {
          console.error('📝 RecordingManager: Error saving to localStorage:', e);
        }
        
        console.log('📝 RecordingManager: Local response created:', response);
        this.isFetchingResponse = false;
        
        return {
          id: response.id,
          content: response.content,
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
