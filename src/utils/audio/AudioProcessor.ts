
import { supabase } from "@/integrations/supabase/client";
import { RATE_LIMIT_ERROR_MARKER } from "./constants";
import { RateLimiter } from "./RateLimiter";
import recordingManager from "../RecordingManager";

/**
 * Handles processing of audio chunks and transcription
 */
export class AudioProcessor {
  private recordedChunks: Blob[] = [];
  private chunkCounter = 0;
  private rateLimiter: RateLimiter;
  private lastTranscriptionText: string = '';
  private processingError: boolean = false;
  
  constructor(
    private readonly onTranscriptionCallback: ((text: string) => void) | null = null
  ) {
    this.rateLimiter = new RateLimiter();
  }
  
  /**
   * Add a new chunk of audio data
   */
  public addChunk(chunk: Blob): void {
    this.chunkCounter++;
    console.log(`🔊 AudioProcessor: Data available: ${chunk.size} bytes (chunk #${this.chunkCounter})`);
    
    if (chunk.size > 0) {
      this.recordedChunks.push(chunk);
    }
  }
  
  /**
   * Get the current chunk count
   */
  public getChunkCount(): number {
    return this.recordedChunks.length;
  }
  
  /**
   * Clear all recorded chunks
   */
  public clearChunks(): void {
    this.recordedChunks = [];
    this.chunkCounter = 0;
    this.processingError = false;
  }
  
  /**
   * Process recorded chunks for transcription if conditions are met
   * @returns true if processing was attempted, false if skipped
   */
  public async processChunksIfReady(maxChunks: number): Promise<boolean> {
    // Skip if we're rate limited or not enough time has passed
    if (!this.rateLimiter.canMakeCall()) {
      console.log(`🔊 AudioProcessor: Skipping transcription due to rate limiting or timing`);
      return false;
    }
    
    if (this.recordedChunks.length === 0) {
      console.log('🔊 AudioProcessor: No chunks to process');
      return false;
    }
    
    // If we had a processing error, we'll reduce the chunk count to try with less data
    if (this.processingError) {
      maxChunks = Math.max(5, Math.floor(maxChunks / 2));
      console.log(`🔊 AudioProcessor: Reducing chunks due to previous error, using max ${maxChunks} chunks`);
      this.processingError = false;
    }
    
    console.log(`🔊 AudioProcessor: Processing ${this.recordedChunks.length} audio chunks for transcription`);
    
    // Keep only the most recent chunks (to reduce payload size)
    if (this.recordedChunks.length > maxChunks) {
      console.log(`🔊 AudioProcessor: Limiting chunks to last ${maxChunks} (from ${this.recordedChunks.length})`);
      this.recordedChunks = this.recordedChunks.slice(-maxChunks);
    }
    
    // Create a combined blob from all chunks - explicitly set MIME type
    const combinedBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    console.log(`🔊 AudioProcessor: Created combined blob with size: ${combinedBlob.size} bytes and type: ${combinedBlob.type}`);
    
    // Process the combined audio
    this.rateLimiter.recordSuccess();
    try {
      await this.processAudioChunk(combinedBlob);
      return true;
    } catch (error) {
      console.error('🔊 AudioProcessor: Error during audio processing:', error);
      this.processingError = true;
      return false;
    }
  }
  
  /**
   * Process a single audio chunk for transcription
   */
  private async processAudioChunk(chunk: Blob): Promise<void> {
    console.log(`🔊 AudioProcessor: Processing audio chunk: ${chunk.size} bytes, type: ${chunk.type}`);
    try {
      // Calculate an approximate duration based on audio size and bit rate
      // This is a rough estimate - 32 kbps is a common bit rate for speech
      const estimatedDurationMs = (chunk.size * 8) / (32 * 1000);
      console.log(`🔊 AudioProcessor: Estimated audio duration: ${estimatedDurationMs.toFixed(2)} ms`);
      
      // Convert blob to base64
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      console.log(`🔊 AudioProcessor: Converted to Uint8Array with ${bytes.length} bytes`);
      
      // Verify the first bytes to ensure it's a valid audio format
      const firstBytes = bytes.slice(0, 16);
      console.log(`🔊 AudioProcessor: First bytes:`, Array.from(firstBytes));
      
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      console.log(`🔊 AudioProcessor: Converted to base64 string with length ${base64Data.length}`);

      // Get the GROQ API key from the environment
      const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
      if (!GROQ_API_KEY) {
        console.warn('🔊 AudioProcessor: VITE_GROQ_API_KEY not found in environment variables');
      }

      // Get visitor ID for tracking
      const visitorId = localStorage.getItem('visitor_id') || '';
      const sessionId = recordingManager.getCurrentSessionId();
      console.log(`🔊 AudioProcessor: Using visitor ID: ${visitorId}, session ID: ${sessionId}`);

      // Send to our Edge Function
      console.log('🔊 AudioProcessor: Sending audio chunk to Supabase Edge Function...');
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { 
          audio: base64Data,
          apiKey: GROQ_API_KEY,
          visitorId: visitorId,
          sessionId: sessionId
        }
      });

      // Check for rate limit response
      if ((error && error.message && error.message.includes('429')) || (data && data.statusCode === 429)) {
        console.error('🔊 AudioProcessor: RATE LIMIT ERROR (429) from transcribe function');
        
        // Apply rate limiting logic
        const shouldNotify = this.rateLimiter.recordRateLimitError();
        
        // Notify application about rate limit via callback if needed
        if (shouldNotify && this.onTranscriptionCallback) {
          this.onTranscriptionCallback(RATE_LIMIT_ERROR_MARKER);
        }
        
        return;
      }

      // Check for audio format errors (400 Bad Request)
      if ((error && error.message && error.message.includes('400')) || (data && data.statusCode === 400)) {
        console.error('🔊 AudioProcessor: AUDIO FORMAT ERROR (400) from transcribe function');
        console.error('🔊 AudioProcessor: Audio format was rejected by the transcription service');
        this.processingError = true;
        
        // For now, just log the error but don't notify the user
        // We could add a specific notification if needed
        
        return;
      }

      if (error) {
        console.error('🔊 AudioProcessor: Error from transcribe function:', error);
        
        // Still pass any detected text if available to maintain functionality
        if (data && data.text) {
          console.log('🔊 AudioProcessor: Despite error, received transcription:', data.text);
          this.processTranscriptionResult(data.text, estimatedDurationMs);
        }
        
        return;
      }

      if (data?.text) {
        console.log('🔊 AudioProcessor: Transcription successfully received:', data.text);
        console.log('🔊 AudioProcessor: Transcription length:', data.text.length);
        console.log('🔊 AudioProcessor: Transcription word count:', data.text.split(' ').length);
        
        // Log the full response for debugging
        console.log('🔊 AudioProcessor: Full response data:', JSON.stringify(data));
        
        this.processTranscriptionResult(data.text, estimatedDurationMs);
      } else {
        console.log('🔊 AudioProcessor: No transcription text in response:', data);
        console.log('🔊 AudioProcessor: Full response data for debugging:', JSON.stringify(data));
      }
    } catch (error) {
      console.error('🔊 AudioProcessor: Error processing audio chunk:', error);
      this.processingError = true;
      throw error; // Rethrow to mark the processing as failed
    }
  }
  
  /**
   * Process a transcription result and store it
   */
  private async processTranscriptionResult(text: string, estimatedDurationMs: number): Promise<void> {
    // Get the session ID first to ensure it exists
    const sessionId = recordingManager.getCurrentSessionId();
    
    if (!sessionId) {
      console.error('🔊 AudioProcessor: No session ID available for saving transcription');
      // Try to create a new session
      const newSessionId = await recordingManager.startNewSession();
      if (!newSessionId) {
        console.error('🔊 AudioProcessor: Failed to create new session for transcription');
        // Still call the callback with the text so UI updates
        if (this.onTranscriptionCallback) {
          this.onTranscriptionCallback(text);
        }
        return;
      }
      console.log('🔊 AudioProcessor: Created new session with ID:', newSessionId);
    }
    
    console.log('🔊 AudioProcessor: Processing transcription result:', text);
    console.log('🔊 AudioProcessor: Current session ID:', sessionId);
    
    // Save the transcription to the database if different from last one
    if (text !== this.lastTranscriptionText) {
      console.log('🔊 AudioProcessor: Saving new transcription to database or local storage');
      const transcription = await recordingManager.saveTranscription(
        text, 
        estimatedDurationMs / 1000 // Convert to seconds
      );
      
      if (transcription) {
        console.log('🔊 AudioProcessor: Transcription saved with ID:', transcription.id);
        console.log('🔊 AudioProcessor: Using ' + 
          (recordingManager.isUsingLocalStorageMode() ? 'local storage' : 'database') + 
          ' for transcription storage');
        this.lastTranscriptionText = text;
      } else {
        console.error('🔊 AudioProcessor: Failed to save transcription');
      }
    } else {
      console.log('🔊 AudioProcessor: Skipping save, transcription unchanged');
    }
    
    if (this.onTranscriptionCallback) {
      console.log('🔊 AudioProcessor: Calling transcription callback with text:', text);
      this.onTranscriptionCallback(text);
    }
  }
}
