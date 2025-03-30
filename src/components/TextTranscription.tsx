
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
        
        // If previous text contains the new text, it might be a regression
        // This happens when a longer transcription was received and then a shorter one
        if (prev.includes(text) && prev.length > text.length) {
          console.log('🔍 TextTranscription - New text is subset of previous, keeping previous');
          return prev;
        }
        
        // Advanced overlap detection
        let longestOverlapLength = 0;
        const minLength = Math.min(prev.length, text.length);
        
        // Check for overlap at the end of prev with the start of text
        for (let overlapLength = Math.min(100, minLength); overlapLength >= 5; overlapLength--) {
          const prevEnd = prev.slice(-overlapLength);
          const textStart = text.slice(0, overlapLength);
          
          if (prevEnd === textStart) {
            longestOverlapLength = overlapLength;
            console.log(`🔍 TextTranscription - Found overlap of ${longestOverlapLength} characters`);
            break;
          }
        }
        
        if (longestOverlapLength > 0) {
          // If we found an overlap, join them together at the overlap point
          return prev + text.substring(longestOverlapLength);
        }
        
        // If the previous content splits by sentence, check if the new text
        // starts with any of those sentences and build from there
        const sentences = prev.split(/[.!?]+\s*/g).filter(s => s.length > 10);
        for (const sentence of sentences) {
          if (text.startsWith(sentence)) {
            console.log('🔍 TextTranscription - New transcription starts with existing sentence');
            return text;
          }
        }
        
        // No specific pattern detected, append with a space
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
          className="bg-white/10 backdrop-blur-md text-white rounded-xl px-5 py-4 max-w-[90%] ml-auto animate-slide-up whitespace-pre-wrap break-words border border-white/20"
        >
          {combinedText}
        </div>
      </div>
    </div>
  );
};

export default TextTranscription;
