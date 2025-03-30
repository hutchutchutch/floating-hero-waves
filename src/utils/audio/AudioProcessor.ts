
import { supabase } from "@/integrations/supabase/client";
import { RATE_LIMIT_ERROR_MARKER } from "./constants";
import { RateLimiter } from "./RateLimiter";

/**
 * Handles processing of audio chunks and transcription
 */
export class AudioProcessor {
  private recordedChunks: Blob[] = [];
  private chunkCounter = 0;
  private rateLimiter: RateLimiter;
  
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
    
    console.log(`🔊 AudioProcessor: Processing ${this.recordedChunks.length} audio chunks for transcription`);
    
    // Keep only the most recent chunks (to reduce payload size)
    if (this.recordedChunks.length > maxChunks) {
      console.log(`🔊 AudioProcessor: Limiting chunks to last ${maxChunks} (from ${this.recordedChunks.length})`);
      this.recordedChunks = this.recordedChunks.slice(-maxChunks);
    }
    
    // Create a combined blob from all chunks
    const combinedBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    console.log(`🔊 AudioProcessor: Created combined blob with size: ${combinedBlob.size} bytes`);
    
    // Process the combined audio
    this.rateLimiter.recordSuccess();
    await this.processAudioChunk(combinedBlob);
    return true;
  }
  
  /**
   * Process a single audio chunk for transcription
   */
  private async processAudioChunk(chunk: Blob): Promise<void> {
    console.log(`🔊 AudioProcessor: Processing audio chunk: ${chunk.size} bytes, type: ${chunk.type}`);
    try {
      // Convert blob to base64
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      console.log(`🔊 AudioProcessor: Converted to Uint8Array with ${bytes.length} bytes`);
      
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

      // Send to our Edge Function
      console.log('🔊 AudioProcessor: Sending audio chunk to Supabase Edge Function...');
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { 
          audio: base64Data,
          apiKey: GROQ_API_KEY
        }
      });

      // Check for rate limit response
      // Fix the TypeScript error by checking data.statusCode instead of error.status
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

      if (error) {
        console.error('🔊 AudioProcessor: Error from transcribe function:', error);
        return;
      }

      if (data?.text) {
        console.log('🔊 AudioProcessor: Transcription successfully received:', data.text);
        console.log('🔊 AudioProcessor: Transcription length:', data.text.length);
        console.log('🔊 AudioProcessor: Transcription word count:', data.text.split(' ').length);
        
        // Log the full response for debugging
        console.log('🔊 AudioProcessor: Full response data:', JSON.stringify(data));
        
        if (this.onTranscriptionCallback) {
          console.log('🔊 AudioProcessor: Calling transcription callback with text:', data.text);
          this.onTranscriptionCallback(data.text);
        }
      } else {
        console.log('🔊 AudioProcessor: No transcription text in response:', data);
        console.log('🔊 AudioProcessor: Full response data for debugging:', JSON.stringify(data));
      }
    } catch (error) {
      console.error('🔊 AudioProcessor: Error processing audio chunk:', error);
    }
  }
}
