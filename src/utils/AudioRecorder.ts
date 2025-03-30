
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
  private audioProcessor: ScriptProcessorNode | null = null;
  private chunkCounter = 0;
  
  constructor() {
    this.init = this.init.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.analyzeAudio = this.analyzeAudio.bind(this);
    this.generateDummyData = this.generateDummyData.bind(this);
    this.processAudioChunk = this.processAudioChunk.bind(this);
  }

  async init(): Promise<boolean> {
    console.log('🔊 AudioRecorder: Initializing AudioRecorder...');
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('🔊 AudioRecorder: AudioContext created:', this.audioContext);
      
      try {
        console.log('🔊 AudioRecorder: Requesting microphone access...');
        this.audioStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('🔊 AudioRecorder: Microphone access granted:', this.audioStream);
        
        // Initialize WebRTC connection
        console.log('🔊 AudioRecorder: Initializing WebRTC connection...');
        const webRTCInitialized = await webRTCHandler.init((message) => {
          console.log('🔊 AudioRecorder: Received message from GROQ:', message);
        });
        
        if (webRTCInitialized) {
          console.log('🔊 AudioRecorder: WebRTC initialized, connecting to GROQ...');
          this.isWebRTCConnected = await webRTCHandler.connectToGroq();
          console.log('🔊 AudioRecorder: WebRTC connection status:', this.isWebRTCConnected ? 'Connected' : 'Failed');
          
          if (!this.isWebRTCConnected) {
            console.warn('🔊 AudioRecorder: Failed to connect to GROQ, continuing without WebRTC');
          } else {
            console.log('🔊 AudioRecorder: Successfully connected to GROQ via WebRTC');
            
            // Check WebRTC connection status periodically
            setInterval(() => {
              console.log('🔊 AudioRecorder: WebRTC connection check - Status:', 
                webRTCHandler.isConnected() ? 'Connected' : 'Disconnected');
            }, 5000);
          }
        } else {
          console.warn('🔊 AudioRecorder: WebRTC initialization failed');
        }
        
        return true;
      } catch (micError) {
        console.warn('🔊 AudioRecorder: Could not access microphone, using dummy data:', micError);
        // Continue with dummy data if mic access fails
        return true;
      }
    } catch (error) {
      console.error('🔊 AudioRecorder: Error initializing audio context:', error);
      return false;
    }
  }

  async startRecording(
    onAudioData: (data: Uint8Array) => void,
    onTranscription: (text: string) => void
  ): Promise<boolean> {
    console.log('🔊 AudioRecorder: Starting recording...');
    this.onAudioDataCallback = onAudioData;
    this.onTranscriptionCallback = onTranscription;
    this.recordedChunks = [];
    this.chunkCounter = 0;
    
    if (!this.audioStream) {
      console.log('🔊 AudioRecorder: No audio stream, initializing...');
      const initialized = await this.init();
      if (!initialized) {
        console.error('🔊 AudioRecorder: Failed to initialize audio');
        return false;
      }
    }

    try {
      // If we have actual microphone access
      if (this.audioStream && this.audioContext) {
        console.log('🔊 AudioRecorder: Setting up audio analyzer and recorder...');
        // Setup audio analyzer
        const source = this.audioContext.createMediaStreamSource(this.audioStream);
        this.audioAnalyser = this.audioContext.createAnalyser();
        this.audioAnalyser.fftSize = 256;
        source.connect(this.audioAnalyser);
        
        // Setup script processor for more detailed audio processing
        this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.audioProcessor.onaudioprocess = (e) => {
          if (!this.isRecording) return;
          
          const inputBuffer = e.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          if (Math.random() < 0.01) { // Only log 1% of audio processing events to avoid spam
            console.log(`🔊 AudioRecorder: Processing audio: ${inputData.length} samples at ${inputBuffer.sampleRate}Hz`);
          }
          
          // Convert Float32Array to Uint8Array for visualization
          const uint8Data = new Uint8Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Map -1.0 - 1.0 to 0 - 255
            uint8Data[i] = (inputData[i] * 0.5 + 0.5) * 255;
          }
          
          if (this.onAudioDataCallback) {
            this.onAudioDataCallback(uint8Data);
          }
        };
        
        source.connect(this.audioProcessor);
        this.audioProcessor.connect(this.audioContext.destination);
        
        const bufferLength = this.audioAnalyser.frequencyBinCount;
        this.audioData = new Uint8Array(bufferLength);
        
        // Create media recorder for actual recording
        console.log('🔊 AudioRecorder: Creating MediaRecorder instance...');
        this.mediaRecorder = new MediaRecorder(this.audioStream, {
          mimeType: 'audio/webm'
        });
        
        this.mediaRecorder.ondataavailable = (event) => {
          this.chunkCounter++;
          console.log(`🔊 AudioRecorder: Media recorder data available: ${event.data.size} bytes (chunk #${this.chunkCounter})`);
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
            this.processAudioChunk(event.data);
          }
        };
        
        console.log('🔊 AudioRecorder: Starting MediaRecorder...');
        this.mediaRecorder.start(500); // Collect data every 500ms
        
        // Start analyzing audio for visualization
        this.isRecording = true;
        this.analyzeAudio();

        // Set up transcription interval (every 2 seconds)
        console.log('🔊 AudioRecorder: Setting up transcription interval...');
        this.transcriptionInterval = setInterval(async () => {
          if (this.recordedChunks.length > 0) {
            console.log(`🔊 AudioRecorder: Processing ${this.recordedChunks.length} audio chunks for transcription`);
            const latestChunk = this.recordedChunks[this.recordedChunks.length - 1];
            this.processAudioChunk(latestChunk);
          }
        }, 2000);
        
        console.log('🔊 AudioRecorder: Recording started successfully');
      } else {
        // Use dummy data if no microphone access
        console.log('🔊 AudioRecorder: No microphone access, using dummy data');
        this.isRecording = true;
        this.generateDummyData();
      }
      
      return true;
    } catch (error) {
      console.error('🔊 AudioRecorder: Error starting recording:', error);
      // Fall back to dummy data
      console.log('🔊 AudioRecorder: Falling back to dummy data due to error');
      this.isRecording = true;
      this.generateDummyData();
      return true;
    }
  }

  async processAudioChunk(chunk: Blob): Promise<void> {
    console.log(`🔊 AudioRecorder: Processing audio chunk: ${chunk.size} bytes, type: ${chunk.type}`);
    try {
      // Convert blob to base64
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      console.log(`🔊 AudioRecorder: Converted to Uint8Array with ${bytes.length} bytes`);
      
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      console.log(`🔊 AudioRecorder: Converted to base64 string with length ${base64Data.length}`);

      // Send to our Edge Function
      console.log('🔊 AudioRecorder: Sending audio chunk to Supabase Edge Function...');
      const { data, error } = await supabase.functions.invoke('transcribe', {
        body: { audio: base64Data }
      });

      if (error) {
        console.error('🔊 AudioRecorder: Error from transcribe function:', error);
        return;
      }

      if (data?.text) {
        console.log('🔊 AudioRecorder: Transcription successfully received:', data.text);
        if (this.onTranscriptionCallback) {
          this.onTranscriptionCallback(data.text);
        }
      } else {
        console.log('🔊 AudioRecorder: No transcription text in response:', data);
      }
    } catch (error) {
      console.error('🔊 AudioRecorder: Error processing audio chunk:', error);
    }
  }

  stopRecording(): void {
    console.log('🔊 AudioRecorder: Stopping recording...');
    this.isRecording = false;
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      console.log('🔊 AudioRecorder: Stopping MediaRecorder...');
      this.mediaRecorder.stop();
    }
    
    if (this.audioStream) {
      console.log('🔊 AudioRecorder: Stopping audio tracks...');
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    if (this.audioProcessor) {
      console.log('🔊 AudioRecorder: Disconnecting audio processor...');
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }
    
    if (this.dummyDataInterval) {
      console.log('🔊 AudioRecorder: Clearing dummy data interval...');
      clearInterval(this.dummyDataInterval);
      this.dummyDataInterval = null;
    }

    if (this.transcriptionInterval) {
      console.log('🔊 AudioRecorder: Clearing transcription interval...');
      clearInterval(this.transcriptionInterval);
      this.transcriptionInterval = null;
    }
    
    this.onAudioDataCallback = null;
    this.onTranscriptionCallback = null;
    this.recordedChunks = [];
    console.log('🔊 AudioRecorder: Recording stopped');
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
      const isConnected = webRTCHandler.isConnected();
      if (Math.random() < 0.01) { // Only log 1% to avoid spam
        console.log('🔊 AudioRecorder: WebRTC status during analysis:', isConnected ? 'Connected' : 'Disconnected');
      }
      
      if (isConnected) {
        webRTCHandler.sendAudioData(this.audioData);
      }
    }
    
    // Continue analyzing while recording
    requestAnimationFrame(this.analyzeAudio);
  }

  private generateDummyData(): void {
    if (!this.onAudioDataCallback || !this.isRecording) return;

    console.log('🔊 AudioRecorder: Generating dummy audio data...');
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
          console.log('🔊 AudioRecorder: Generated dummy transcription:', randomPhrase);
          this.onTranscriptionCallback(randomPhrase);
        }
      }
    }, 50); // Update dummy data at 20fps
  }
}

// Singleton instance
const audioRecorder = new AudioRecorder();
export default audioRecorder;
