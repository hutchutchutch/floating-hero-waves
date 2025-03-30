
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
      {transcriptionLines.map((line, index) => {
        // Calculate opacity based on position - newer lines are more opaque
        const opacity = ((transcriptionLines.length - index) / transcriptionLines.length) * 0.9;
        // Calculate y position for animation - newer lines start lower
        const translateY = index * 10;
        
        return (
          <div 
            key={index} 
            className="text-white text-center px-4 py-1 mb-2 max-w-md animate-fade-in"
            style={{ 
              opacity, 
              transform: `translateY(${translateY}px)`,
              transition: 'opacity 0.5s, transform 1s',
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

export default TextTranscription;
