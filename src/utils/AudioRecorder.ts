
import webRTCHandler from './WebRTCHandler';

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioData: Uint8Array | null = null;
  private isRecording = false;
  private onAudioDataCallback: ((data: Uint8Array) => void) | null = null;
  private dummyDataInterval: NodeJS.Timeout | null = null;
  private isWebRTCConnected = false;

  constructor() {
    this.init = this.init.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.analyzeAudio = this.analyzeAudio.bind(this);
    this.generateDummyData = this.generateDummyData.bind(this);
  }

  async init(): Promise<boolean> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Initialize WebRTC connection
        const webRTCInitialized = await webRTCHandler.init((message) => {
          console.log('Received message from GROQ:', message);
        });
        
        if (webRTCInitialized) {
          this.isWebRTCConnected = await webRTCHandler.connectToGroq();
          if (!this.isWebRTCConnected) {
            console.warn('Failed to connect to GROQ, continuing without WebRTC');
          }
        }
        
        return true;
      } catch (micError) {
        console.warn('Could not access microphone, using dummy data:', micError);
        // Continue with dummy data if mic access fails
        return true;
      }
    } catch (error) {
      console.error('Error initializing audio context:', error);
      return false;
    }
  }

  async startRecording(onAudioData: (data: Uint8Array) => void): Promise<boolean> {
    this.onAudioDataCallback = onAudioData;
    
    if (!this.audioStream) {
      const initialized = await this.init();
      if (!initialized) return false;
    }

    try {
      // If we have actual microphone access
      if (this.audioStream && this.audioContext) {
        // Setup audio analyzer
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        this.audioAnalyser = this.audioContext.createAnalyser();
        this.audioAnalyser.fftSize = 256;
        source.connect(this.audioAnalyser);
        
        const bufferLength = this.audioAnalyser.frequencyBinCount;
        this.audioData = new Uint8Array(bufferLength);
        
        // Create media recorder for actual recording if needed
        this.mediaRecorder = new MediaRecorder(this.audioStream);
        this.mediaRecorder.start();
        
        // Start analyzing audio for visualization
        this.isRecording = true;
        this.analyzeAudio();
      } else {
        // Use dummy data if no microphone access
        this.isRecording = true;
        this.generateDummyData();
      }
      
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      // Fall back to dummy data
      this.isRecording = true;
      this.generateDummyData();
      return true;
    }
  }

  stopRecording(): void {
    this.isRecording = false;
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    if (this.dummyDataInterval) {
      clearInterval(this.dummyDataInterval);
      this.dummyDataInterval = null;
    }
    
    this.onAudioDataCallback = null;
  }

  private analyzeAudio(): void {
    if (!this.isRecording || !this.audioAnalyser || !this.audioData || !this.onAudioDataCallback) {
      return;
    }

    // Get frequency data
    this.audioAnalyser.getByteFrequencyData(this.audioData);
    
    // Send data to callback for visualization
    this.onAudioDataCallback(this.audioData);
    
    // Send to GROQ via WebRTC if connected
    if (this.isWebRTCConnected) {
      webRTCHandler.sendAudioData(this.audioData);
    }
    
    // Continue analyzing while recording
    requestAnimationFrame(this.analyzeAudio);
  }

  private generateDummyData(): void {
    if (!this.onAudioDataCallback || !this.isRecording) return;

    // Create dummy buffer with 128 values (typical frequency bin count)
    const dummyData = new Uint8Array(128);
    
    // Set up interval to generate random audio-like data
    this.dummyDataInterval = setInterval(() => {
      if (!this.isRecording) {
        if (this.dummyDataInterval) clearInterval(this.dummyDataInterval);
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
    }, 50); // Update dummy data at 20fps
  }
}

// Singleton instance
const audioRecorder = new AudioRecorder();
export default audioRecorder;
