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
      console.log('🔍 TextTranscription - Text length:', text.length);
      console.log('🔍 TextTranscription - Text word count:', text.split(' ').length);
      
      // Debug if we're getting "Thank you." by default
      if (text === "Thank you.") {
        console.warn('🔍 TextTranscription - Detected "Thank you." message - this may be a default response');
      }
      
      setCombinedText(prev => {
        // Check if this is just a repetition of what we already have
        if (text === prev) {
          console.log('🔍 TextTranscription - Received duplicate text, ignoring');
          return prev;
        }
        
        // Check if the new text contains the previous text as a prefix
        // This indicates a streaming update where we're getting an expanded version
        if (prev && text.startsWith(prev)) {
          console.log('🔍 TextTranscription - Detected streaming update, replacing with new text');
          return text;
        }
        
        // Check if we have a partial overlap where some of the previous text
        // is repeated at the beginning of the new text
        const words = prev.split(' ');
        if (words.length > 3) {
          // Try to find partial overlaps with the last few words
          for (let i = Math.min(5, words.length - 1); i >= 1; i--) {
            const tailPhrase = words.slice(words.length - i).join(' ');
            if (text.startsWith(tailPhrase)) {
              console.log(`🔍 TextTranscription - Found partial overlap: "${tailPhrase}"`);
              return prev + text.substring(tailPhrase.length);
            }
          }
        }
        
        // Otherwise append the new text with a space
        const combined = prev ? `${prev} ${text}` : text;
        console.log('🔍 TextTranscription - Updated accumulated text:', combined);
        return combined;
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
          className="bg-white/10 backdrop-blur-md text-white rounded-lg px-4 py-3 max-w-[85%] ml-auto animate-slide-up whitespace-pre-wrap break-words"
        >
          {combinedText}
        </div>
      </div>
    </div>
  );
};

export default TextTranscription;
