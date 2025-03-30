
import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import KnowledgeGraph from './KnowledgeGraph';

interface WrenchIconProps {
  visible: boolean;
}

const WrenchIcon: React.FC<WrenchIconProps> = ({ visible }) => {
  const [opacity, setOpacity] = useState(0);
  
  useEffect(() => {
    if (visible) {
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
  }, [visible]);

  if (!visible) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <div 
          className="absolute top-6 right-6 p-3 rounded-full bg-white/10 backdrop-blur-sm"
          style={{ 
            opacity: opacity,
            transition: 'opacity 100ms linear',
            cursor: 'pointer'
          }}
        >
          <Wrench className="w-6 h-6 text-[#EFEEE2]" />
        </div>
      </SheetTrigger>
      <SheetContent className="w-[85vw] sm:w-[600px] overflow-y-auto">
        <KnowledgeGraph />
      </SheetContent>
    </Sheet>
  );
};

export default WrenchIcon;
