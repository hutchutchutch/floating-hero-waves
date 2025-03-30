
import { GROQ_API_KEY, isGroqKeyConfigured } from "../config/apiKeys";

class WebRTCHandler {
  private connection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private isConnected = false;
  private onMessageCallback: ((message: any) => void) | null = null;

  constructor() {
    this.init = this.init.bind(this);
    this.connectToGroq = this.connectToGroq.bind(this);
    this.sendAudioData = this.sendAudioData.bind(this);
    this.disconnect = this.disconnect.bind(this);
  }

  async init(onMessage: (message: any) => void): Promise<boolean> {
    try {
      this.onMessageCallback = onMessage;
      
      // Configure RTCPeerConnection with STUN servers
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      };
      
      this.connection = new RTCPeerConnection(configuration);
      
      // Set up data channel for sending audio
      this.dataChannel = this.connection.createDataChannel('audio');
      this.dataChannel.onopen = () => {
        console.log('WebRTC data channel open');
        this.isConnected = true;
      };
      this.dataChannel.onclose = () => {
        console.log('WebRTC data channel closed');
        this.isConnected = false;
      };
      
      // Handle incoming messages
      this.connection.ondatachannel = (event) => {
        const receiveChannel = event.channel;
        receiveChannel.onmessage = (messageEvent) => {
          if (this.onMessageCallback) {
            try {
              const data = JSON.parse(messageEvent.data);
              this.onMessageCallback(data);
            } catch (error) {
              console.error('Error parsing message:', error);
            }
          }
        };
      };
      
      return true;
    } catch (error) {
      console.error('Error initializing WebRTC:', error);
      return false;
    }
  }

  async connectToGroq(): Promise<boolean> {
    if (!this.connection) {
      console.error('Connection not initialized');
      return false;
    }

    try {
      if (!isGroqKeyConfigured()) {
        console.error('GROQ API key not configured in .env file');
        return false;
      }

      // Create and set local description
      const offer = await this.connection.createOffer();
      await this.connection.setLocalDescription(offer);

      // Send the offer to GROQ API and get answer
      const response = await fetch('https://api.groq.com/openai/v1/audio/webrtc', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sdp: this.connection.localDescription?.sdp,
          type: this.connection.localDescription?.type
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to GROQ: ${response.statusText}`);
      }

      const answerData = await response.json();
      
      // Set remote description from GROQ
      await this.connection.setRemoteDescription(new RTCSessionDescription({
        sdp: answerData.sdp,
        type: answerData.type
      }));

      console.log('WebRTC connection established with GROQ');
      return true;
    } catch (error) {
      console.error('Error connecting to GROQ:', error);
      return false;
    }
  }

  sendAudioData(audioData: Uint8Array): boolean {
    if (!this.isConnected || !this.dataChannel) {
      return false;
    }

    try {
      this.dataChannel.send(audioData);
      return true;
    } catch (error) {
      console.error('Error sending audio data:', error);
      return false;
    }
  }

  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    
    if (this.connection) {
      this.connection.close();
    }
    
    this.dataChannel = null;
    this.connection = null;
    this.isConnected = false;
    this.onMessageCallback = null;
  }
}

// Singleton instance
const webRTCHandler = new WebRTCHandler();
export default webRTCHandler;
