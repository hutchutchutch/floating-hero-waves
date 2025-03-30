
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloatingObjects from './FloatingObjects';
import MicrophoneButton from './MicrophoneButton';
import FadingText from './FadingText';
import TextTranscription from './TextTranscription';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { useToast } from "@/components/ui/use-toast";
import VoiceWaveform from './VoiceWaveform';
import WrenchIcon from './WrenchIcon';
import { ResponseResult } from '@/utils/RecordingManager';

const HeroSection: React.FC = () => {
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [showGoAhead, setShowGoAhead] = useState(false);
  const [hasTranscribedContent, setHasTranscribedContent] = useState(false);
  const [aiResponse, setAiResponse] = useState<ResponseResult | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    setMicrophoneActive(isActive);
    
    if (!isActive) {
      setTranscribedText('');
      setHasTranscribedContent(false);
    } else {
      // Show audio collection started toast
      toast({
        title: "Audio Collection Started",
        description: "Speak clearly into your microphone.",
        duration: 3000,
      });
    }
  };

  const handleAudioData = (data: Uint8Array) => {
    // Log audio data size without spamming the console
    if (Math.random() < 0.02) { // Only log ~2% of audio packets
      console.log(`Audio data received: ${data.length} bytes, max amplitude: ${Math.max(...data)}`);
    }
    setAudioData(new Uint8Array(data));
  };

  const handleTranscription = (text: string) => {
    // Special case for rate limit errors
    if (text === "__RATE_LIMIT_ERROR__") {
      console.warn("Rate limit exceeded for transcription API");
      toast({
        title: "Rate Limit Exceeded",
        description: "Too many requests to the transcription service. Pausing briefly.",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    
    if (text.trim()) {
      console.log('New transcription chunk received in HeroSection:', text);
      setTranscribedText(text);
      // If we have any meaningful transcription content, show the wrench icon
      if (text.length > 3) {
        console.log('Setting hasTranscribedContent to true because we received text:', text);
        setHasTranscribedContent(true);
      }
    } else {
      console.log('Empty transcription received');
    }
  };

  const handleAiResponse = (response: ResponseResult) => {
    console.log('AI response received:', response);
    setAiResponse(response);
    
    // Play audio if available
    if (response.audio_url) {
      if (audioRef.current) {
        audioRef.current.pause(); // Stop any currently playing audio
        audioRef.current.src = response.audio_url;
        
        console.log('Playing audio from URL:', response.audio_url);
        
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
          toast({
            title: "Audio Playback Error",
            description: "Could not play the AI voice response",
            variant: "destructive",
          });
        });
        
        setIsAudioPlaying(true);
      } else {
        console.error('Audio element reference not available');
      }
    } else {
      console.log('No audio URL provided in the response');
    }
    
    toast({
      title: "AI Response",
      description: "AI has processed your input and generated a response",
      duration: 3000,
    });
  };

  // Handle audio playback events
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      audioRef.current.onplay = () => {
        console.log('Audio started playing');
        setIsAudioPlaying(true);
      };
      
      audioRef.current.onended = () => {
        console.log('Audio finished playing');
        setIsAudioPlaying(false);
      };
      
      audioRef.current.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsAudioPlaying(false);
        toast({
          title: "Audio Error",
          description: "Failed to play the audio response",
          variant: "destructive",
        });
      };
      
      // Add loadeddata event to verify the audio is loaded
      audioRef.current.onloadeddata = () => {
        console.log('Audio data loaded successfully');
      };
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGoAhead(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#221F26]">
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 1.5], fov: 50 }}>
          <Suspense fallback={null}>
            <FloatingObjects />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Suspense>
        </Canvas>
      </div>
      
      {/* Audio waveform visualization */}
      <VoiceWaveform isActive={microphoneActive} audioData={audioData} />
      
      {/* Display transcribed text as a single message */}
      <TextTranscription isActive={microphoneActive} text={transcribedText} />
      
      {/* Display AI response */}
      {aiResponse && (
        <div className="absolute left-0 right-0 top-16 overflow-y-auto max-h-60 flex flex-col items-center">
          <div className="max-w-2xl w-full px-4 mb-4">
            <div 
              className={`bg-green-500/20 backdrop-blur-md text-white rounded-xl px-5 py-4 max-w-[90%] mr-auto animate-slide-up whitespace-pre-wrap break-words border border-green-500/30 ${isAudioPlaying ? 'border-green-400/70 shadow-lg shadow-green-500/20 animate-pulse' : ''}`}
            >
              {aiResponse.content}
              {aiResponse.audio_url && isAudioPlaying && (
                <div className="mt-2 text-xs text-white/70 animate-pulse">
                  ♪ Playing audio response...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Wrench icon that appears after first transcription */}
      <WrenchIcon visible={hasTranscribedContent} />
      
      <div className="relative h-full w-full flex flex-col items-center justify-center z-10">
        <div className="flex flex-col items-center">
          <MicrophoneButton 
            onToggle={handleMicToggle} 
            onAudioData={handleAudioData} 
            onTranscription={handleTranscription}
            onAiResponse={handleAiResponse}
          />
          {showGoAhead && (
            <div className="h-4 mt-4 transition-opacity duration-[2000ms] ease-in-out animate-fade-in">
              <TextShimmer
                className="text-xs font-medium [--base-color:rgba(239,238,226,0.1)] [--base-gradient-color:#efeee2]"
                duration={3}
              >
                Go ahead
              </TextShimmer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
