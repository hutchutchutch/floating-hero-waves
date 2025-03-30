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
  const hasStartedSessionRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);

  const startRecordingSession = async () => {
    console.log('🎤 Starting new recording session');
    
    if (hasStartedSessionRef.current) {
      console.log('🎤 Session already started, skipping');
      return sessionIdRef.current;
    }
    
    if (sessionIdRef.current) {
      console.log('🎤 Ending previous session before starting new one');
      await recordingManager.endSession();
      sessionIdRef.current = null;
    }
    
    hasStartedSessionRef.current = true;
    const sessionId = await recordingManager.startNewSession();
    
    if (sessionId) {
      console.log('🎤 New session started with ID:', sessionId);
      sessionIdRef.current = sessionId;
      return sessionId;
    } else {
      console.error('🎤 Failed to start new recording session');
      hasStartedSessionRef.current = false;
      sessionIdRef.current = null;
      toast({
        title: "Session Error",
        description: "Could not start a new recording session",
        variant: "destructive",
      });
      return null;
    }
  };

  const endRecordingSession = async () => {
    console.log('🎤 Ending current recording session');
    await recordingManager.endSession();
    hasStartedSessionRef.current = false;
    sessionIdRef.current = null;
    
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  };

  const generateAiResponse = async (text: string) => {
    if (!text || text.trim().length < 5) {
      console.log('🎤 Text too short for AI response:', text);
      return;
    }
    
    console.log('🎤 Generating AI response for text:', text);
    setIsProcessing(true);
    
    try {
      if (!sessionIdRef.current) {
        console.log('🎤 No session ID, attempting to start a new session');
        const sessionId = await startRecordingSession();
        if (!sessionId) {
          console.error('🎤 Failed to create session for AI response');
          setIsProcessing(false);
          return;
        }
      }
      
      const transcriptions = await recordingManager.getSessionTranscriptions();
      
      console.log('🎤 Found transcriptions:', transcriptions.length);
      
      if (transcriptions.length === 0) {
        console.log('🎤 No transcriptions found, saving transcription first');
        
        const savedTranscription = await recordingManager.saveTranscription(text, 5.0);
        
        if (!savedTranscription) {
          console.error('🎤 Failed to save transcription');
          setIsProcessing(false);
          return;
        }
        
        console.log('🎤 Created new transcription with ID:', savedTranscription.id);
        
        await recordingManager.finalizeTranscription(savedTranscription.id);
        
        const response = await recordingManager.generateAndSaveResponse(
          savedTranscription.id,
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
        
        setIsProcessing(false);
        return;
      }
      
      const latestTranscription = transcriptions[transcriptions.length - 1];
      console.log('🎤 Using transcription ID for response:', latestTranscription.id);
      
      await recordingManager.finalizeTranscription(latestTranscription.id);
      
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
      } else {
        console.error('🎤 Failed to generate AI response or no callback provided');
        toast({
          title: "Response Error",
          description: "Could not generate AI response",
          variant: "destructive",
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
      console.log('🎤 Attempting to start recording...');
      
      const sessionId = await startRecordingSession();
      if (!sessionId) {
        console.error('🎤 Failed to start session, cannot proceed with recording');
        setIsActive(false);
        return;
      }
      
      const success = await audioRecorder.startRecording(
        (data) => {
          if (onAudioData) {
            const average = data.reduce((sum, value) => sum + value, 0) / data.length;
            const normalizedLevel = Math.min(100, Math.max(0, average / 2.55));
            setAudioLevel(normalizedLevel);
            
            if (Math.random() < 0.02) {
              console.log(`🎤 Audio data received: ${data.length} bytes, average amplitude: ${average.toFixed(2)}`);
            }
            onAudioData(data);
          }
        },
        (text) => {
          if (onTranscription && text) {
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
        setIsActive(false);
        await endRecordingSession();
      } else {
        console.log('🎤 Recording started successfully');
        toast({
          title: "Recording Started",
          description: "Microphone is now active",
          className: "bg-white/10 text-white backdrop-blur-md border-none",
        });
        lastTranscriptionRef.current = '';
        transcriptionCountRef.current = 0;
        
        sessionTimerRef.current = setInterval(async () => {
          if (lastTranscriptionRef.current && !isProcessing) {
            console.log('🎤 Session timer triggered, generating AI response');
            await generateAiResponse(lastTranscriptionRef.current);
          }
        }, 15000);
      }
    } else {
      console.log('🎤 Stopping recording...');
      audioRecorder.stopRecording();
      console.log('🎤 Recording stopped');
      
      toast({
        title: "Recording Stopped",
        description: "Microphone is now inactive",
        className: "bg-white/10 text-white backdrop-blur-md border-none",
      });
      
      if (lastTranscriptionRef.current) {
        await generateAiResponse(lastTranscriptionRef.current);
      }
      
      await endRecordingSession();
      
      lastTranscriptionRef.current = '';
      transcriptionCountRef.current = 0;
    }
    
    if (onToggle) {
      onToggle(newState);
    }
  };

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
          ${isActive ? 'bg-white/10 shadow-lg shadow-purple-500/20' : 'bg-white/10'} text-white backdrop-blur-sm hover:bg-white/20 relative
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
        
        {isActive && (
          <div className="absolute inset-0 rounded-full border-2 border-purple-500/40 animate-[pulse_2s_ease-in-out_infinite]"></div>
        )}
      </button>
      
      {isActive && (
        <div className="mt-4 text-white/80 text-sm font-light animate-pulse">
          Listening...
        </div>
      )}
      
      {isProcessing && (
        <div className="mt-2 text-sm text-white/80">
          Processing...
        </div>
      )}
    </div>
  );
};

export default MicrophoneButton;
