
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
import visitorSessionManager from '@/utils/VisitorSessionManager';

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
      toast({
        title: "Audio Collection Started",
        description: "Speak clearly into your microphone.",
        duration: 3000,
      });
    }
  };

  const handleAudioData = (data: Uint8Array) => {
    setAudioData(new Uint8Array(data));
  };

  const handleTranscription = (text: string) => {
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
    
    if (response.audio_url) {
      if (audioRef.current) {
        audioRef.current.pause();
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

  useEffect(() => {
    const initVisitorTracking = async () => {
      try {
        const visitorId = await visitorSessionManager.initialize();
        console.log('Visitor session initialized with ID:', visitorId);
      } catch (error) {
        console.error('Error initializing visitor session:', error);
      }
    };

    initVisitorTracking();
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
      
      {/* Position the VoiceWaveform above the microphone button but below the transcription */}
      <div className="absolute inset-x-0 bottom-40 z-10">
        <VoiceWaveform isActive={microphoneActive} audioData={audioData} />
      </div>
      
      <TextTranscription isActive={microphoneActive} text={transcribedText} />
      
      {aiResponse && (
        <div className="absolute left-0 right-0 top-16 overflow-y-auto max-h-60 flex flex-col items-center">
          <div className="max-w-2xl w-full px-4 mb-4">
            <div 
              className={`glass-morphism text-white rounded-xl px-5 py-4 max-w-[90%] mr-auto animate-slide-up whitespace-pre-wrap break-words ${isAudioPlaying ? 'border-white/30 shadow-lg shadow-black/20 animate-pulse' : ''}`}
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
