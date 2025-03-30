
import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

type MicrophoneButtonProps = {
  onToggle?: (isActive: boolean) => void;
};

const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({ onToggle }) => {
  const [isActive, setIsActive] = useState(false);

  const handleClick = () => {
    const newState = !isActive;
    setIsActive(newState);
    if (onToggle) {
      onToggle(newState);
    }
  };

  return (
    <div className="flex flex-col items-center z-10">
      <button
        onClick={handleClick}
        className={`h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 lg:h-32 lg:w-32 rounded-full flex items-center justify-center transition-all duration-300 
          ${isActive 
            ? 'bg-cosmic-pink text-white shadow-lg shadow-cosmic-pink/30' 
            : 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'
          } animate-[vibrate_3s_ease-in-out_infinite]`}
        aria-label={isActive ? "Turn microphone off" : "Turn microphone on"}
      >
        {isActive ? (
          <MicOff className="h-1/2 w-1/2" />
        ) : (
          <Mic className="h-1/2 w-1/2" />
        )}
      </button>
      <span className="mt-4 text-white/80 text-lg font-light">what's up?</span>
    </div>
  );
};

export default MicrophoneButton;
