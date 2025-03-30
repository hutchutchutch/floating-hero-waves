
import React, { useState, useEffect } from 'react';
import { Mic, Pause, Sparkle } from 'lucide-react';
import audioRecorder from '../utils/AudioRecorder';

type MicrophoneButtonProps = {
  onToggle?: (isActive: boolean) => void;
  onAudioData?: (data: Uint8Array) => void;
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ onToggle, onAudioData }) => {
  const [isActive, setIsActive] = useState(false);

  const handleClick = async () => {
    const newState = !isActive;
    setIsActive(newState);
    
    if (newState) {
      // Start recording
      const success = await audioRecorder.startRecording((data) => {
        if (onAudioData) {
          onAudioData(data);
        }
      });
      
      if (!success) {
        // If recording failed, set back to inactive
        setIsActive(false);
      }
    } else {
      // Stop recording
      audioRecorder.stopRecording();
    }
    
    if (onToggle) {
      onToggle(newState);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isActive) {
        audioRecorder.stopRecording();
      }
    };
  }, [isActive]);

  return (
    <div className="flex flex-col items-center z-10">
      <button
        onClick={handleClick}
        className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 rounded-full flex items-center justify-center transition-all duration-300 
          bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 relative"
        aria-label={isActive ? "Pause recording" : "Start recording"}
      >
        <div className="relative">
          {isActive ? (
            <Pause className="h-1/2 w-1/2 text-white" />
          ) : (
            <Mic className="h-1/2 w-1/2 text-white" />
          )}
          <Sparkle className="absolute -top-1 -right-1 h-2 w-2 sm:h-2.5 sm:w-2.5 text-white opacity-80" />
        </div>
      </button>
    </div>
  );
};

export default MicrophoneButton;
