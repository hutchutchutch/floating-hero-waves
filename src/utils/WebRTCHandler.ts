
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
    this.isConnected = this.isConnected.bind(this);
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
        console.log('🌐 WebRTC: Data channel open');
        this.isConnected = true;
      };
      this.dataChannel.onclose = () => {
        console.log('🌐 WebRTC: Data channel closed');
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
              console.error('🌐 WebRTC: Error parsing message:', error);
            }
          }
        };
      };
      
      // Monitor connection state
      this.connection.oniceconnectionstatechange = () => {
        console.log('🌐 WebRTC: ICE connection state changed to:', this.connection?.iceConnectionState);
        if (this.connection?.iceConnectionState === 'connected' || 
            this.connection?.iceConnectionState === 'completed') {
          this.isConnected = true;
        } else {
          this.isConnected = false;
        }
      };
      
      this.connection.connectionstatechange = () => {
        console.log('🌐 WebRTC: Connection state changed to:', this.connection?.connectionState);
      };
      
      return true;
    } catch (error) {
      console.error('🌐 WebRTC: Error initializing WebRTC:', error);
      return false;
    }
  }
  
  isConnected(): boolean {
    return this.isConnected && 
           this.dataChannel !== null && 
           this.dataChannel.readyState === 'open';
  }

  async connectToGroq(): Promise<boolean> {
    if (!this.connection) {
      console.error('🌐 WebRTC: Connection not initialized');
      return false;
    }

    try {
      if (!isGroqKeyConfigured()) {
        console.error('🌐 WebRTC: GROQ API key not configured in .env file');
        return false;
      }

      // Create and set local description
      const offer = await this.connection.createOffer();
      await this.connection.setLocalDescription(offer);

      // Send the offer to GROQ API and get answer
      console.log('🌐 WebRTC: Sending offer to GROQ API');
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

      const responseText = await response.text();
      console.log('🌐 WebRTC: Received response from GROQ API:', 
                  response.status, response.statusText);
      
      if (!response.ok) {
        console.error('🌐 WebRTC: Error response from GROQ:', responseText);
        throw new Error(`Failed to connect to GROQ: ${response.statusText}`);
      }

      try {
        const answerData = JSON.parse(responseText);
        console.log('🌐 WebRTC: Parsed answer data from GROQ');
        
        // Set remote description from GROQ
        await this.connection.setRemoteDescription(new RTCSessionDescription({
          sdp: answerData.sdp,
          type: answerData.type
        }));

        console.log('🌐 WebRTC: Connection established with GROQ');
        return true;
      } catch (parseError) {
        console.error('🌐 WebRTC: Error parsing response:', parseError);
        console.error('🌐 WebRTC: Raw response text:', responseText);
        throw new Error('Failed to parse WebRTC response');
      }
    } catch (error) {
      console.error('🌐 WebRTC: Error connecting to GROQ:', error);
      return false;
    }
  }

  sendAudioData(audioData: Uint8Array): boolean {
    if (!this.isConnected()) {
      return false;
    }

    try {
      this.dataChannel?.send(audioData);
      return true;
    } catch (error) {
      console.error('🌐 WebRTC: Error sending audio data:', error);
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
    
    console.log('🌐 WebRTC: Disconnected');
  }
}

// Singleton instance
const webRTCHandler = new WebRTCHandler();
export default webRTCHandler;
