import { supabase } from "@/integrations/supabase/client";

class WebRTCHandler {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((message: string) => void) | null = null;
  private _isConnected: boolean = false;
  private queue: Uint8Array[] = [];
  private queueProcessorRunning = false;
  private maxQueueLength = 50;
  
  constructor() {
    this.init = this.init.bind(this);
    this.connectToGroq = this.connectToGroq.bind(this);
    this.sendAudioData = this.sendAudioData.bind(this);
    this.processQueue = this.processQueue.bind(this);
    this.onDataChannelMessage = this.onDataChannelMessage.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }

  // Method to check connection status
  isConnected(): boolean {
    return this._isConnected;
  }

  async init(onMessage: (message: string) => void): Promise<boolean> {
    console.log('WebRTC: Initializing WebRTCHandler...');
    try {
      this.onMessageCallback = onMessage;

      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      };
      
      this.pc = new RTCPeerConnection(config);
      console.log('WebRTC: RTCPeerConnection created');
      
      // Create data channel
      this.dataChannel = this.pc.createDataChannel('audio', {
        ordered: true,
      });
      
      this.dataChannel.onopen = () => {
        console.log('WebRTC: Data channel is open');
        this._isConnected = true;
      };
      
      this.dataChannel.onclose = () => {
        console.log('WebRTC: Data channel is closed');
        this._isConnected = false;
      };
      
      this.dataChannel.onmessage = this.onDataChannelMessage;
      
      // Monitor connection state
      this.pc.onconnectionstatechange = () => {
        console.log(`WebRTC: Connection state changed to: ${this.pc?.connectionState}`);
        if (this.pc?.connectionState === 'connected') {
          this._isConnected = true;
        } else if (['disconnected', 'failed', 'closed'].includes(this.pc?.connectionState || '')) {
          this._isConnected = false;
        }
      };
      
      return true;
    } catch (error) {
      console.error('WebRTC: Error initializing WebRTCHandler:', error);
      return false;
    }
  }

  async connectToGroq(): Promise<boolean> {
    console.log('WebRTC: Connecting to GROQ...');
    if (!this.pc) {
      console.error('WebRTC: RTCPeerConnection not initialized');
      return false;
    }

    try {
      // 1. Create Offer
      console.log('WebRTC: Creating offer...');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('WebRTC: Offer created and set as local description');

      // 2. Send Offer to Supabase Edge Function
      console.log('WebRTC: Sending offer to Supabase Edge Function...');
      const { data, error } = await supabase.functions.invoke('webrtc-groq', {
        body: { sdp: offer.sdp, type: offer.type },
      });

      if (error) {
        console.error('WebRTC: Error invoking Supabase Edge Function:', error);
        return false;
      }

      if (!data?.sdp || !data?.type) {
        console.error('WebRTC: Invalid response from Supabase Edge Function:', data);
        return false;
      }

      // 3. Set Answer as Remote Description
      console.log('WebRTC: Setting answer as remote description...');
      const answer = { type: data.type, sdp: data.sdp };
      await this.pc.setRemoteDescription(answer);
      console.log('WebRTC: Remote description set');

      // Handle ICE candidates
      this.pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('WebRTC: Sending ICE candidate to Supabase Edge Function:', event.candidate);
          const { error: iceError } = await supabase.functions.invoke('webrtc-groq', {
            body: { ice: event.candidate },
          });

          if (iceError) {
            console.error('WebRTC: Error sending ICE candidate:', iceError);
          }
        } else {
          console.log('WebRTC: ICE gathering complete');
        }
      };

      console.log('WebRTC: Connection to GROQ initiated');
      return true;
    } catch (error) {
      console.error('WebRTC: Error connecting to GROQ:', error);
      return false;
    }
  }

  sendAudioData(data: Uint8Array): void {
    if (!this.dataChannel) {
      console.warn('WebRTC: Data channel not available, cannot send audio data');
      return;
    }

    if (this.dataChannel.readyState === 'open') {
      if (this.dataChannel.bufferedAmount > 65535 * 2) {
        console.warn('WebRTC: Data channel is congested, pausing sending audio data');
        return;
      }
      
      if (this.queue.length > this.maxQueueLength) {
        console.warn(`WebRTC: Queue is full (${this.queue.length}/${this.maxQueueLength}), dropping oldest data`);
        this.queue.shift(); // Remove the oldest item from the queue
      }
      
      this.queue.push(data);
      if (!this.queueProcessorRunning) {
        this.processQueue();
      }
    } else {
      console.warn('WebRTC: Data channel is not open, cannot send audio data');
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queueProcessorRunning) return;
    this.queueProcessorRunning = true;
    
    while (this.queue.length > 0 && this.dataChannel && this.dataChannel.readyState === 'open') {
      const data = this.queue.shift();
      if (data) {
        try {
          this.dataChannel.send(data);
          if (Math.random() < 0.01) { // Log 1% of the time
            console.log(`WebRTC: Sent audio data chunk of ${data.length} bytes, queue length: ${this.queue.length}`);
          }
          // await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
        } catch (error) {
          console.error('WebRTC: Error sending data:', error);
          break; // Stop processing if there's an error
        }
      }
    }
    
    this.queueProcessorRunning = false;
  }

  private onDataChannelMessage(event: MessageEvent): void {
    if (this.onMessageCallback) {
      this.onMessageCallback(event.data);
    }
  }

  cleanup(): void {
    console.log('WebRTC: Cleaning up WebRTCHandler...');
    if (this.dataChannel) {
      console.log('WebRTC: Closing data channel');
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.pc) {
      console.log('WebRTC: Closing peer connection');
      this.pc.close();
      this.pc = null;
    }
    
    this._isConnected = false;
    this.onMessageCallback = null;
    this.queue = [];
    this.queueProcessorRunning = false;
    console.log('WebRTC: WebRTCHandler cleanup complete');
  }
}

// Singleton instance
const webRTCHandler = new WebRTCHandler();
export default webRTCHandler;
