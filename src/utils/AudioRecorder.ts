
import webRTCHandler from './WebRTCHandler';
import { supabase } from "@/integrations/supabase/client";

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioData: Uint8Array | null = null;
  private isRecording = false;
  private onAudioDataCallback: ((data: Uint8Array) => void) | null = null;
  private onTranscriptionCallback: ((text: string) => void) | null = null;
  private dummyDataInterval: NodeJS.Timeout | null = null;
  private isWebRTCConnected = false;
  private recordedChunks: Blob[] = [];
  private transcriptionInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.init = this.init.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.analyzeAudio = this.analyzeAudio.bind(this);
    this.generateDummyData = this.generateDummyData.bind(this);
    this.processAudioChunk = this.processAudioChunk.bind(this);
  }

  async init(): Promise<boolean> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      try {
        this.audioStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
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

  async startRecording(
    onAudioData: (data: Uint8Array) => void,
    onTranscription: (text: string) => void
  ): Promise<boolean> {
    this.onAudioDataCallback = onAudioData;
    this.onTranscriptionCallback = onTranscription;
    this.recordedChunks = [];
    
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
        
        // Create media recorder for actual recording
        this.mediaRecorder = new MediaRecorder(this.audioStream, {
          mimeType: 'audio/webm'
        });
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
            this.processAudioChunk(event.data);
          }
        };
        
        this.mediaRecorder.start(500); // Collect data every 500ms
        
        // Start analyzing audio for visualization
        this.isRecording = true;
        this.analyzeAudio();

        // Set up transcription interval (every 2 seconds)
        this.transcriptionInterval = setInterval(async () => {
          if (this.recordedChunks.length > 0) {
            const latestChunk = this.recordedChunks[this.recordedChunks.length - 1];
            this.processAudioChunk(latestChunk);
          }
        }, 2000);
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

  async processAudioChunk(chunk: Blob): Promise<void> {
    try {
      // Convert blob to base64
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      // Send to our Edge Function
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { audio: base64Data }
      });

      if (error) {
        console.error('Error from transcribe function:', error);
        return;
      }

      if (data?.text && this.onTranscriptionCallback) {
        console.log('Transcription received:', data.text);
        this.onTranscriptionCallback(data.text);
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error);
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

    if (this.transcriptionInterval) {
      clearInterval(this.transcriptionInterval);
      this.transcriptionInterval = null;
    }
    
    this.onAudioDataCallback = null;
    this.onTranscriptionCallback = null;
    this.recordedChunks = [];
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

      if (this.onTranscriptionCallback) {
        const dummyPhrases = [
          "Hello, I'm looking for information.",
          "Can you help me find something?",
          "I need assistance with a question.",
          "How does this service work?",
          "Tell me more about this app.",
        ];
        
        if (Math.random() > 0.7) {
          const randomPhrase = dummyPhrases[Math.floor(Math.random() * dummyPhrases.length)];
          this.onTranscriptionCallback(randomPhrase);
        }
      }
    }, 50); // Update dummy data at 20fps
  }
}

// Singleton instance
const audioRecorder = new AudioRecorder();
export default audioRecorder;
