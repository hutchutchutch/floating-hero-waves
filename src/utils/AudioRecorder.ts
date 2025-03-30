
import { 
  CHUNK_DURATION_MS, 
  MAX_CHUNKS, 
  TRANSCRIPTION_INTERVAL_MS,
  RATE_LIMIT_ERROR_MARKER
} from './audio/constants';
import { AudioProcessor } from './audio/AudioProcessor';
import { DummyAudioGenerator } from './audio/DummyAudioGenerator';
import { IWebRTCHandler } from './audio/IWebRTCHandler';
import webRTCHandler from './WebRTCHandler';

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioData: Uint8Array | null = null;
  private isRecording = false;
  private onAudioDataCallback: ((data: Uint8Array) => void) | null = null;
  private onTranscriptionCallback: ((text: string) => void) | null = null;
  private isWebRTCConnected = false;
  private transcriptionInterval: NodeJS.Timeout | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private lastTranscriptionTime = 0;
  private audioChunkProcessor: AudioProcessor | null = null;
  private dummyGenerator: DummyAudioGenerator | null = null;
  
  constructor(private readonly webrtcHandler: IWebRTCHandler = webRTCHandler) {
    this.init = this.init.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.analyzeAudio = this.analyzeAudio.bind(this);
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
        const webRTCInitialized = await this.webrtcHandler.init((message) => {
          console.log('🔊 AudioRecorder: Received message from GROQ:', message);
        });
        
        if (webRTCInitialized) {
          console.log('🔊 AudioRecorder: WebRTC initialized, connecting to GROQ...');
          this.isWebRTCConnected = await this.webrtcHandler.connectToGroq();
          console.log('🔊 AudioRecorder: WebRTC connection status:', this.isWebRTCConnected ? 'Connected' : 'Failed');
          
          if (!this.isWebRTCConnected) {
            console.warn('🔊 AudioRecorder: Failed to connect to GROQ, continuing without WebRTC');
          } else {
            console.log('🔊 AudioRecorder: Successfully connected to GROQ via WebRTC');
            
            // Check WebRTC connection status periodically
            setInterval(() => {
              console.log('🔊 AudioRecorder: WebRTC connection check - Status:', 
                this.webrtcHandler.isConnected() ? 'Connected' : 'Disconnected');
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
    this.lastTranscriptionTime = 0;
    
    // Initialize audio chunk processor
    this.audioChunkProcessor = new AudioProcessor(onTranscription);
    
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
          if (this.audioChunkProcessor && event.data.size > 0) {
            this.audioChunkProcessor.addChunk(event.data);
          }
        };
        
        console.log('🔊 AudioRecorder: Starting MediaRecorder...');
        this.mediaRecorder.start(CHUNK_DURATION_MS); // Collect data every 250ms
        
        // Start analyzing audio for visualization
        this.isRecording = true;
        this.analyzeAudio();

        // Set up transcription interval
        console.log('🔊 AudioRecorder: Setting up transcription interval...');
        this.transcriptionInterval = setInterval(async () => {
          if (!this.audioChunkProcessor) return;
          
          // Check if enough time has passed since the last transcription
          const now = Date.now();
          const timeElapsed = now - this.lastTranscriptionTime;
          
          if (timeElapsed < TRANSCRIPTION_INTERVAL_MS) {
            console.log(`🔊 AudioRecorder: Skipping transcription, only ${timeElapsed}ms passed (need ${TRANSCRIPTION_INTERVAL_MS}ms)`);
            return;
          }
          
          const processed = await this.audioChunkProcessor.processChunksIfReady(MAX_CHUNKS);
          if (processed) {
            this.lastTranscriptionTime = now;
          }
        }, TRANSCRIPTION_INTERVAL_MS);
        
        console.log('🔊 AudioRecorder: Recording started successfully');
      } else {
        // Use dummy data if no microphone access
        console.log('🔊 AudioRecorder: No microphone access, using dummy data');
        this.isRecording = true;
        
        // Initialize and start dummy generator
        this.dummyGenerator = new DummyAudioGenerator(
          this.onAudioDataCallback,
          this.onTranscriptionCallback
        );
        this.dummyGenerator.start();
      }
      
      return true;
    } catch (error) {
      console.error('🔊 AudioRecorder: Error starting recording:', error);
      // Fall back to dummy data
      console.log('🔊 AudioRecorder: Falling back to dummy data due to error');
      this.isRecording = true;
      
      // Initialize and start dummy generator
      this.dummyGenerator = new DummyAudioGenerator(
        this.onAudioDataCallback,
        this.onTranscriptionCallback
      );
      this.dummyGenerator.start();
      
      return true;
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
    
    if (this.dummyGenerator) {
      console.log('🔊 AudioRecorder: Stopping dummy data generator...');
      this.dummyGenerator.stop();
      this.dummyGenerator = null;
    }

    if (this.transcriptionInterval) {
      console.log('🔊 AudioRecorder: Clearing transcription interval...');
      clearInterval(this.transcriptionInterval);
      this.transcriptionInterval = null;
    }
    
    this.onAudioDataCallback = null;
    this.onTranscriptionCallback = null;
    this.audioChunkProcessor = null;
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
      const isConnected = this.webrtcHandler.isConnected();
      if (Math.random() < 0.01) { // Only log 1% to avoid spam
        console.log('🔊 AudioRecorder: WebRTC status during analysis:', isConnected ? 'Connected' : 'Disconnected');
      }
      
      if (isConnected) {
        this.webrtcHandler.sendAudioData(this.audioData);
      }
    }
    
    // Continue analyzing while recording
    requestAnimationFrame(this.analyzeAudio);
  }
}

// Singleton instance
const audioRecorder = new AudioRecorder();
export default audioRecorder;
