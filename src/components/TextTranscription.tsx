
import React, { useEffect, useState } from 'react';

interface TextTranscriptionProps {
  isActive: boolean;
  text: string;
}

const TextTranscription: React.FC<TextTranscriptionProps> = ({ isActive, text }) => {
  const [allText, setAllText] = useState<string>('');
  const [transcriptionLines, setTranscriptionLines] = useState<string[]>([]);
  
  // Accumulate text during a recording session
  useEffect(() => {
    if (text && isActive) {
      console.log('🔍 TextTranscription - Received new transcription text:', text);
      console.log('🔍 TextTranscription - Text length:', text.length);
      console.log('🔍 TextTranscription - Text word count:', text.split(' ').length);
      console.log('🔍 TextTranscription - Current accumulated text:', allText);
      
      // Debug if we're getting "Thank you." by default
      if (text === "Thank you.") {
        console.warn('🔍 TextTranscription - Detected "Thank you." message - this may be a default response');
      }
      
      // Check if text is just a partial sentence or word
      if (text.length < 10) {
        console.log('🔍 TextTranscription - Received short text, might be partial:', text);
      }
      
      setAllText(prev => {
        const combined = prev ? `${prev} ${text}` : text;
        console.log('🔍 TextTranscription - Updated accumulated text:', combined);
        console.log('🔍 TextTranscription - Updated text length:', combined.length);
        console.log('🔍 TextTranscription - Updated word count:', combined.split(' ').length);
        return combined;
      });
    }

    // Clear text when microphone is turned off
    if (!isActive) {
      console.log('🔍 TextTranscription - Microphone inactive, clearing transcription text');
      setAllText('');
      setTranscriptionLines([]);
    }
  }, [text, isActive]);

  // Process accumulated text into lines whenever it changes
  useEffect(() => {
    if (allText) {
      console.log('🔍 TextTranscription - Processing accumulated text:', allText);
      
      // Split by periods or natural pauses to create lines
      const sentences = allText.split(/(?<=[.!?])\s+/);
      console.log('🔍 TextTranscription - Split accumulated text into sentences:', sentences);
      
      if (sentences.length === 1 && !sentences[0].match(/[.!?]$/)) {
        // If we just have one incomplete sentence, show it as is
        setTranscriptionLines([sentences[0]]);
        console.log('🔍 TextTranscription - Setting single incomplete sentence:', sentences[0]);
      } else {
        // Filter out any empty lines and limit to the last 5 meaningful sentences
        const filteredLines = sentences.filter(line => line.trim().length > 0);
        const lastLines = filteredLines.slice(Math.max(0, filteredLines.length - 5));
        console.log('🔍 TextTranscription - Final transcription lines to display:', lastLines);
        setTranscriptionLines(lastLines);
      }
    }
  }, [allText]);

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
