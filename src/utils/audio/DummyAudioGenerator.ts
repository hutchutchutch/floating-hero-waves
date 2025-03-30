
import { DUMMY_PHRASES, DUMMY_DATA_INTERVAL_MS } from "./constants";

/**
 * Generates dummy audio data for testing without a microphone
 */
export class DummyAudioGenerator {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  constructor(
    private readonly onAudioDataCallback: ((data: Uint8Array) => void) | null = null,
    private readonly onTranscriptionCallback: ((text: string) => void) | null = null
  ) {}
  
  /**
   * Start generating dummy audio data
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('🔊 DummyAudioGenerator: Generating dummy audio data...');
    
    // Create dummy buffer with 128 values (typical frequency bin count)
    const dummyData = new Uint8Array(128);
    
    // Set up interval to generate random audio-like data
    this.intervalId = setInterval(() => {
      if (!this.isRunning) {
        this.stop();
        return;
      }
      
      // Generate random waveform-like data
      for (let i = 0; i < dummyData.length; i++) {
        // Create more natural looking audio pattern
        const baseValue = 20 + Math.sin(Date.now() / 500 + i / 10) * 30;
        const randomVariation = Math.random() * 40;
        dummyData[i] = Math.min(255, Math.max(0, Math.floor(baseValue + randomVariation)));
      }
      
      if (this.onAudioDataCallback) {
        this.onAudioDataCallback(dummyData);
      }

      if (this.onTranscriptionCallback) {
        if (Math.random() > 0.7) {
          const randomPhrase = DUMMY_PHRASES[Math.floor(Math.random() * DUMMY_PHRASES.length)];
          console.log('🔊 DummyAudioGenerator: Generated dummy transcription:', randomPhrase);
          this.onTranscriptionCallback(randomPhrase);
        }
      }
    }, DUMMY_DATA_INTERVAL_MS);
  }
  
  /**
   * Stop generating dummy audio data
   */
  public stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🔊 DummyAudioGenerator: Stopped dummy audio generation');
    }
  }
}
