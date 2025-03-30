
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
  const lastTranscriptionRef = useRef<string>('');
  const { toast } = useToast();
  const transcriptionCountRef = useRef<number>(0);

  const handleClick = async () => {
    const newState = !isActive;
    console.log(`🎤 Microphone button clicked, setting state to: ${newState}`);
    setIsActive(newState);
    
    if (newState) {
      // Start recording
      console.log('🎤 Attempting to start recording...');
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
            transcriptionCountRef.current += 1;
            console.log(`🎤 Raw transcription #${transcriptionCountRef.current} received: "${text}"`);
            console.log(`🎤 Previous transcription: "${lastTranscriptionRef.current}"`);
            
            // Only pass new text to the parent component
            lastTranscriptionRef.current = text;
            onTranscription(text);
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
      } else {
        console.log('🎤 Recording started successfully');
        toast({
          title: "Recording Started",
          description: "Microphone is now active",
        });
        // Reset last transcription when starting a new recording
        lastTranscriptionRef.current = '';
        transcriptionCountRef.current = 0;
      }
    } else {
      // Stop recording
      console.log('🎤 Stopping recording...');
      audioRecorder.stopRecording();
      console.log('🎤 Recording stopped');
      toast({
        title: "Recording Stopped",
        description: "Microphone is now inactive",
      });
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
          ${isActive ? 'bg-white/10' : 'bg-white/10'} text-white backdrop-blur-sm hover:bg-white/20 relative`}
        aria-label={isActive ? "Pause recording" : "Start recording"}
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
    </div>
  );
};

export default MicrophoneButton;
