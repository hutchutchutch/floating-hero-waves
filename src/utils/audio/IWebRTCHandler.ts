
/**
 * Interface for WebRTC handler
 */
export interface IWebRTCHandler {
  init(onMessage: (message: string) => void): Promise<boolean>;
  connectToGroq(): Promise<boolean>;
  sendAudioData(data: Uint8Array): void;
  isConnected(): boolean;
  cleanup(): void;
}
