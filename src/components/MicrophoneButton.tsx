
import React, { useState, useEffect, useRef } from 'react';
import { Pause } from 'lucide-react';
import audioRecorder from '../utils/AudioRecorder';
import { useToast } from "@/components/ui/use-toast";

type MicrophoneButtonProps = {
  onToggle?: (isActive: boolean) => void;
  onAudioData?: (data: Uint8Array) => void;
  onTranscription?: (text: string) => void;
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ 
  onToggle, 
  onAudioData,
  onTranscription 
}) => {
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const animationRef = useRef<number | null>(null);
  const { toast } = useToast();

  const handleClick = async () => {
    const newState = !isActive;
    console.log(`Microphone button clicked, setting state to: ${newState}`);
    setIsActive(newState);
    
    if (newState) {
      // Start recording
      console.log('Attempting to start recording...');
      const success = await audioRecorder.startRecording(
        (data) => {
          if (onAudioData) {
            // Calculate average amplitude from audio data for visualization
            const average = data.reduce((sum, value) => sum + value, 0) / data.length;
            const normalizedLevel = Math.min(100, Math.max(0, average / 2.55)); // 0-100 scale
            setAudioLevel(normalizedLevel);
            
            console.log(`Audio data received: ${data.length} bytes, average amplitude: ${average.toFixed(2)}`);
            onAudioData(data);
          }
        },
        (text) => {
          if (onTranscription) {
            console.log(`Transcription received: "${text}"`);
            onTranscription(text);
            
            // We no longer show toast for transcriptions
          }
        }
      );
      
      if (!success) {
        console.error('Failed to start recording');
        toast({
          title: "Recording Failed",
          description: "Could not access microphone",
          variant: "destructive",
        });
        // If recording failed, set back to inactive
        setIsActive(false);
      } else {
        console.log('Recording started successfully');
        toast({
          title: "Recording Started",
          description: "Microphone is now active",
        });
      }
    } else {
      // Stop recording
      console.log('Stopping recording...');
      audioRecorder.stopRecording();
      console.log('Recording stopped');
      toast({
        title: "Recording Stopped",
        description: "Microphone is now inactive",
      });
    }
    
    if (onToggle) {
      onToggle(newState);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isActive) {
        console.log('Component unmounting, stopping recording...');
        audioRecorder.stopRecording();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive]);

  return (
    <div className="flex flex-col items-center z-10">
      <button
        onClick={handleClick}
        className={`h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 rounded-full flex items-center justify-center transition-all duration-300 
          ${isActive ? 'bg-red-500/60' : 'bg-white/10'} text-white backdrop-blur-sm hover:bg-white/20 relative`}
        aria-label={isActive ? "Pause recording" : "Start recording"}
      >
        <div className="relative">
          {isActive ? (
            <Pause className="text-white w-10 h-10 sm:w-12 sm:h-12" />
          ) : (
            <img src="/bulb.svg" alt="Light bulb" className="w-10 h-10 sm:w-12 sm:h-12" />
          )}
        </div>
        
        {/* Audio level indicator rings */}
        {isActive && (
          <>
            <div 
              className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping"
              style={{ 
                transform: `scale(${1 + (audioLevel / 100)})`,
                opacity: audioLevel / 200 + 0.3,
                animationDuration: `${0.8 - (audioLevel / 200)}s`
              }}
            />
            <div className="absolute top-2 -right-2 bg-green-500 h-3 w-3 rounded-full animate-pulse" />
          </>
        )}
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
    </div>
  );
};

export default MicrophoneButton;
