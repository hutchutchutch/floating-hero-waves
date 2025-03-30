
import React, { useEffect, useState } from 'react';

interface TextTranscriptionProps {
  isActive: boolean;
  text: string;
}

const TextTranscription: React.FC<TextTranscriptionProps> = ({ isActive, text }) => {
  const [combinedText, setCombinedText] = useState<string>('');
  
  // Accumulate text during a recording session
  useEffect(() => {
    if (text && isActive) {
      console.log('🔍 TextTranscription - Received new transcription text:', text);
      
      setCombinedText(prev => {
        // Check if this is just a repetition of what we already have
        if (text === prev) {
          console.log('🔍 TextTranscription - Received duplicate text, ignoring');
          return prev;
        }
        
        // If the previous text is empty, just use the new text
        if (!prev) {
          console.log('🔍 TextTranscription - First text segment received');
          return text;
        }
        
        // If the new text fully contains the previous text, it's a complete update
        if (text.includes(prev)) {
          console.log('🔍 TextTranscription - Complete update detected');
          return text;
        }
        
        // Instead of looking for the last few words, try to find the longest common prefix
        // This handles cases where the streaming API returns overlapping chunks
        let commonIndex = 0;
        const minLength = Math.min(prev.length, text.length);
        
        // Find where the new text starts to differ
        for (let i = 0; i < minLength; i++) {
          if (text[i] === prev[i]) {
            commonIndex = i + 1;
          } else {
            break;
          }
        }
        
        // If there's a significant overlap (more than 5 characters)
        if (commonIndex > 5) {
          console.log(`🔍 TextTranscription - Found overlap of ${commonIndex} characters`);
          // Only append the non-overlapping part
          return prev + text.substring(commonIndex);
        }
        
        // If no significant overlap and not a complete update, 
        // append with a space to avoid words running together
        console.log('🔍 TextTranscription - No significant overlap, appending with space');
        return `${prev} ${text}`;
      });
    }

    // Clear text when microphone is turned off
    if (!isActive) {
      console.log('🔍 TextTranscription - Microphone inactive, clearing transcription text');
      setCombinedText('');
    }
  }, [text, isActive]);

  if (!isActive || !combinedText.trim()) {
    return null;
  }

  return (
    <div className="absolute left-0 right-0 bottom-16 overflow-y-auto max-h-60 flex flex-col-reverse items-center">
      <div className="max-w-2xl w-full px-4 mb-4">
        <div 
          className="bg-black/40 backdrop-blur-lg text-white rounded-xl px-5 py-4 max-w-[90%] ml-auto animate-slide-up whitespace-pre-wrap break-words border border-white/10 shadow-lg"
        >
          {combinedText}
        </div>
      </div>
    </div>
  );
};

export default TextTranscription;
