
import React, { useEffect, useState } from 'react';

interface TextTranscriptionProps {
  isActive: boolean;
  text: string;
}

const TextTranscription: React.FC<TextTranscriptionProps> = ({ isActive, text }) => {
  const [transcriptionLines, setTranscriptionLines] = useState<string[]>([]);
  
  // When new text comes in, add it to our lines
  useEffect(() => {
    if (text && isActive) {
      // Split by periods or natural pauses to create lines
      const newLines = text.split(/(?<=[.!?])\s+/);
      setTranscriptionLines(prev => {
        // Combine with previous lines, but limit to last 5 lines to avoid overcrowding
        const combined = [...prev, ...newLines];
        return combined.slice(Math.max(0, combined.length - 5));
      });
    }

    // Clear text when microphone is turned off
    if (!isActive) {
      setTranscriptionLines([]);
    }
  }, [text, isActive]);

  if (!isActive || transcriptionLines.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-0 right-0 bottom-16 overflow-hidden h-60 flex flex-col-reverse items-center">
      <div className="max-w-2xl w-full px-4 space-y-3">
        {transcriptionLines.map((line, index) => {
          if (!line.trim()) return null;
          
          return (
            <div 
              key={index} 
              className="bg-white/10 backdrop-blur-md text-white rounded-lg px-4 py-2 max-w-[85%] ml-auto animate-slide-up"
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TextTranscription;
