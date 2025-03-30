
import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import KnowledgeGraph from './KnowledgeGraph';

interface WrenchIconProps {
  visible: boolean;
}

const WrenchIcon: React.FC<WrenchIconProps> = ({ visible }) => {
  const [opacity, setOpacity] = useState(0);
  const [hasEverRecorded, setHasEverRecorded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    // Check if user has ever recorded
    const storedValue = localStorage.getItem('hasEverRecorded');
    if (storedValue === 'true') {
      setHasEverRecorded(true);
    }
    
    // If visible is true, we're recording, so set hasEverRecorded to true
    if (visible) {
      setHasEverRecorded(true);
      localStorage.setItem('hasEverRecorded', 'true');
    }
  }, [visible]);
  
  useEffect(() => {
    if (visible || hasEverRecorded) {
      // Add a delay before starting the fade in
      const timeout = setTimeout(() => {
        // Gradually increase opacity over time
        const interval = setInterval(() => {
          setOpacity(prevOpacity => {
            const newOpacity = prevOpacity + 0.02;
            if (newOpacity >= 1) {
              clearInterval(interval);
              return 1;
            }
            return newOpacity;
          });
        }, 50); // Update every 50ms for a smooth 2.5s fade-in

        return () => {
          clearInterval(interval);
        };
      }, 1000); // Start fade-in 1 second after becoming visible
      
      return () => clearTimeout(timeout);
    } else {
      setOpacity(0);
    }
  }, [visible, hasEverRecorded]);

  // Only return null if both visible is false AND hasEverRecorded is false
  if (!visible && !hasEverRecorded) return null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    console.log('Sheet open state changed:', open);
  };

  const handleWrenchClick = () => {
    console.log('Wrench icon clicked');
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <div 
          className="absolute top-6 right-6 p-3 rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors cursor-pointer"
          style={{ 
            opacity: opacity,
            transition: 'opacity 100ms linear',
            zIndex: 50
          }}
          onClick={handleWrenchClick}
          aria-label="Open Knowledge Graph"
        >
          <Wrench className="w-6 h-6 text-[#EFEEE2]" />
        </div>
      </SheetTrigger>
      <SheetContent className="w-[85vw] sm:w-[600px] overflow-y-auto bg-black/90 border-white/10">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-xl text-[#EFEEE2]">Happy and Fulfilling Life Knowledge Graph</SheetTitle>
          <SheetDescription className="text-[#EFEEE2]/70">
            This graph visualizes important concepts from your conversations
          </SheetDescription>
        </SheetHeader>
        <KnowledgeGraph />
      </SheetContent>
    </Sheet>
  );
};

export default WrenchIcon;
