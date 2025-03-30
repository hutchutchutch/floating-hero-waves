
import React, { useState, useEffect } from 'react';
import { Pause } from 'lucide-react';
import audioRecorder from '../utils/AudioRecorder';

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

  const handleClick = async () => {
    const newState = !isActive;
    setIsActive(newState);
    
    if (newState) {
      // Start recording
      const success = await audioRecorder.startRecording(
        (data) => {
          if (onAudioData) {
            onAudioData(data);
          }
        },
        (text) => {
          if (onTranscription) {
            onTranscription(text);
          }
        }
      );
      
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
            <Pause className="text-white w-10 h-10 sm:w-12 sm:h-12" />
          ) : (
            <img src="/bulb.svg" alt="Light bulb" className="w-10 h-10 sm:w-12 sm:h-12" />
          )}
        </div>
      </button>
    </div>
  );
};

export default MicrophoneButton;
