
import React, { useState, useEffect, useRef } from 'react';
import { Pause } from 'lucide-react';
import audioRecorder from '../utils/AudioRecorder';
import { useToast } from "@/components/ui/use-toast";
import { RATE_LIMIT_ERROR_MARKER } from '../utils/audio/constants';
import recordingManager from '../utils/RecordingManager';

type MicrophoneButtonProps = {
  onToggle?: (isActive: boolean) => void;
  onAudioData?: (data: Uint8Array) => void;
  onTranscription?: (text: string) => void;
  onAiResponse?: (response: { content: string, audio_url: string | null }) => void;
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ 
  onToggle, 
  onAudioData,
  onTranscription,
  onAiResponse
}) => {
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastTranscriptionRef = useRef<string>('');
  const { toast } = useToast();
  const transcriptionCountRef = useRef<number>(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle starting a new recording session
  const startRecordingSession = async () => {
    console.log('🎤 Starting new recording session');
    const sessionId = await recordingManager.startNewSession();
    if (sessionId) {
      console.log('🎤 New session started with ID:', sessionId);
    } else {
      console.error('🎤 Failed to start new recording session');
      toast({
        title: "Session Error",
        description: "Could not start a new recording session",
        variant: "destructive",
      });
    }
  };

  // Handle ending the current recording session
  const endRecordingSession = async () => {
    console.log('🎤 Ending current recording session');
    await recordingManager.endSession();
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  };

  // Generate an AI response based on the transcription
  const generateAiResponse = async (text: string) => {
    if (!text || text.trim().length < 5) {
      console.log('🎤 Text too short for AI response:', text);
      return;
    }
    
    console.log('🎤 Generating AI response for text:', text);
    setIsProcessing(true);
    
    try {
      // Get the current transcription ID
      const transcriptions = await recordingManager.getSessionTranscriptions();
      if (transcriptions.length === 0) {
        console.error('🎤 No transcriptions found for current session');
        setIsProcessing(false);
        return;
      }
      
      const latestTranscription = transcriptions[transcriptions.length - 1];
      console.log('🎤 Using transcription ID for response:', latestTranscription.id);
      
      // Mark the transcription as final
      await recordingManager.finalizeTranscription(latestTranscription.id);
      
      // Generate the response
      const response = await recordingManager.generateAndSaveResponse(
        latestTranscription.id,
        text
      );
      
      if (response && onAiResponse) {
        console.log('🎤 AI response generated:', response);
        onAiResponse(response);
        
        toast({
          title: "Response Ready",
          description: "AI has responded to your input",
          className: "bg-white/10 text-white backdrop-blur-md border-none",
        });
      }
    } catch (error) {
      console.error('🎤 Error generating AI response:', error);
      toast({
        title: "Response Error",
        description: "Could not generate AI response",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClick = async () => {
    const newState = !isActive;
    console.log(`🎤 Microphone button clicked, setting state to: ${newState}`);
    setIsActive(newState);
    
    if (newState) {
      // Start recording
      console.log('🎤 Attempting to start recording...');
      
      // Start a new session
      await startRecordingSession();
      
      const success = await audioRecorder.startRecording(
        (data) => {
          if (onAudioData) {
            // Calculate average amplitude from audio data for visualization
            const average = data.reduce((sum, value) => sum + value, 0) / data.length;
            const normalizedLevel = Math.min(100, Math.max(0, average / 2.55)); // 0-100 scale
            setAudioLevel(normalizedLevel);
            
            if (Math.random() < 0.02) { // Only log ~2% of audio packets to avoid console spam
              console.log(`🎤 Audio data received: ${data.length} bytes, average amplitude: ${average.toFixed(2)}`);
            }
            onAudioData(data);
          }
        },
        (text) => {
          if (onTranscription && text) {
            // Handle rate limit error marker
            if (text === RATE_LIMIT_ERROR_MARKER) {
              console.warn('🎤 Rate limit error detected in MicrophoneButton');
              toast({
                title: "Rate Limit Exceeded",
                description: "Too many requests to the transcription service. Please wait a moment.",
                variant: "destructive",
              });
              return;
            }
            
            transcriptionCountRef.current += 1;
            console.log(`🎤 Raw transcription #${transcriptionCountRef.current} received: "${text}"`);
            console.log(`🎤 Previous transcription: "${lastTranscriptionRef.current}"`);
            
            // Only pass new text to the parent component
            if (text !== lastTranscriptionRef.current) {
              lastTranscriptionRef.current = text;
              onTranscription(text);
            }
          }
        }
      );
      
      if (!success) {
        console.error('🎤 Failed to start recording');
        toast({
          title: "Recording Failed",
          description: "Could not access microphone",
          variant: "destructive",
        });
        // If recording failed, set back to inactive
        setIsActive(false);
        // Also end the session we just started
        await endRecordingSession();
      } else {
        console.log('🎤 Recording started successfully');
        toast({
          title: "Recording Started",
          description: "Microphone is now active",
          className: "bg-white/10 text-white backdrop-blur-md border-none",
        });
        // Reset last transcription when starting a new recording
        lastTranscriptionRef.current = '';
        transcriptionCountRef.current = 0;
        
        // Set a timer to periodically generate AI responses if we have transcription
        sessionTimerRef.current = setInterval(async () => {
          if (lastTranscriptionRef.current && !isProcessing) {
            console.log('🎤 Session timer triggered, generating AI response');
            await generateAiResponse(lastTranscriptionRef.current);
          }
        }, 15000); // Check every 15 seconds
      }
    } else {
      // Stop recording
      console.log('🎤 Stopping recording...');
      audioRecorder.stopRecording();
      console.log('🎤 Recording stopped');
      
      toast({
        title: "Recording Stopped",
        description: "Microphone is now inactive",
        className: "bg-white/10 text-white backdrop-blur-md border-none",
      });
      
      // Generate final AI response if we have transcription
      if (lastTranscriptionRef.current) {
        await generateAiResponse(lastTranscriptionRef.current);
      }
      
      // End the recording session
      await endRecordingSession();
      
      // Reset last transcription when stopping
      lastTranscriptionRef.current = '';
      transcriptionCountRef.current = 0;
    }
    
    if (onToggle) {
      onToggle(newState);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isActive) {
        console.log('🎤 Component unmounting, stopping recording...');
        audioRecorder.stopRecording();
        endRecordingSession();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
      }
    };
  }, [isActive]);

  return (
    <div className="flex flex-col items-center z-10">
      <button
        onClick={handleClick}
        className={`h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 rounded-full flex items-center justify-center transition-all duration-300 
          ${isActive ? 'bg-white/10' : 'bg-white/10'} text-white backdrop-blur-sm hover:bg-white/20 relative
          ${isProcessing ? 'animate-pulse bg-green-500/20' : ''}`}
        aria-label={isActive ? "Pause recording" : "Start recording"}
        disabled={isProcessing}
      >
        <div className="relative">
          {isActive ? (
            <Pause className="text-[#EFEEE2] w-10 h-10 sm:w-12 sm:h-12" />
          ) : (
            <img src="/bulb.svg" alt="Light bulb" className="w-10 h-10 sm:w-12 sm:h-12" />
          )}
        </div>
      </button>
      
      {/* Audio level meter */}
      {isActive && (
        <div className="mt-4 w-full max-w-xs bg-black/30 rounded-full h-2.5 backdrop-blur-sm">
          <div 
            className="bg-green-500 h-2.5 rounded-full transition-all duration-100"
            style={{ width: `${audioLevel}%` }}
          />
        </div>
      )}
      
      {/* Processing indicator */}
      {isProcessing && (
        <div className="mt-2 text-sm text-white/80">
          Processing...
        </div>
      )}
    </div>
  );
};

export default MicrophoneButton;
