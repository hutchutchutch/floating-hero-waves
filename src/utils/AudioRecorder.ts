
class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private audioData: Uint8Array | null = null;
  private isRecording = false;
  private onAudioDataCallback: ((data: Uint8Array) => void) | null = null;

  constructor() {
    this.init = this.init.bind(this);
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.analyzeAudio = this.analyzeAudio.bind(this);
  }

  async init(): Promise<boolean> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }

  async startRecording(onAudioData: (data: Uint8Array) => void): Promise<boolean> {
    if (!this.audioStream) {
      const initialized = await this.init();
      if (!initialized) return false;
    }

    try {
      if (this.audioStream && this.audioContext) {
        this.onAudioDataCallback = onAudioData;
        
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
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
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
    
    // Continue analyzing while recording
    requestAnimationFrame(this.analyzeAudio);
  }
}

// Singleton instance
const audioRecorder = new AudioRecorder();
export default audioRecorder;
