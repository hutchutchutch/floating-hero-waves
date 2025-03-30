
import { supabase } from "@/integrations/supabase/client";

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
  
  /**
   * Starts a new recording session
   */
  async startNewSession(): Promise<string | null> {
    console.log('📝 RecordingManager: Starting new session');
    try {
      // Check if user is authenticated
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData?.session?.user?.id;
      
      // Create session object
      const sessionData: any = {};
      if (userId) {
        sessionData.user_id = userId;
      }
      
      const { data, error } = await supabase
        .from('sessions')
        .insert(sessionData)
        .select();
        
      if (error) {
        console.error('📝 RecordingManager: Error starting session:', error);
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
      return null;
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
    
    try {
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
        return null;
      }
      
      if (data && data.length > 0) {
        console.log('📝 RecordingManager: Transcription saved with ID:', data[0].id);
        return data[0] as TranscriptionResult;
      }
      
      return null;
    } catch (error) {
      console.error('📝 RecordingManager: Exception saving transcription:', error);
      return null;
    }
  }
  
  /**
   * Marks a transcription as final
   */
  async finalizeTranscription(transcriptionId: string): Promise<TranscriptionResult | null> {
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
        return null;
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
      return null;
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
    
    try {
      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .eq('session_id', this.currentSessionId)
        .order('sequence_number', { ascending: true });
        
      if (error) {
        console.error('📝 RecordingManager: Error fetching transcriptions:', error);
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
}

// Export a singleton instance
const recordingManager = new RecordingManager();
export default recordingManager;
