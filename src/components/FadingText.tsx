
import React, { useState, useEffect } from 'react';

interface FadingTextProps {
  text: string;
  minInterval?: number; // minimum time between fades in ms
  invisibleDuration?: number; // how long text should stay invisible in ms
}

const FadingText: React.FC<FadingTextProps> = ({ 
  text, 
  minInterval = 21000, // increased from 7000 to 21000 (3x slower)
  invisibleDuration = 15000 // increased from 5000 to 15000 (3x slower)
}) => {
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  
  useEffect(() => {
    const scheduleNextFade = () => {
      // Random interval between minInterval and minInterval + 15000ms (3x the original 5000ms)
      const nextFadeTime = minInterval + Math.random() * 15000;
      
      return setTimeout(() => {
        // Start fade out
        setOpacity(0);
        
        // After fade out completes, toggle visibility
        setTimeout(() => {
          setVisible(false);
          
          // Wait for invisibleDuration before starting to fade back in
          setTimeout(() => {
            setVisible(true);
            
            // Start fade in
            setTimeout(() => {
              setOpacity(1);
              
              // Schedule next fade after this one completes
              timeoutId = scheduleNextFade();
            }, 100);
          }, invisibleDuration);
        }, 1500); // Increased from 500ms to 1500ms (3x slower)
      }, nextFadeTime);
    };
    
    let timeoutId = scheduleNextFade();
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [minInterval, invisibleDuration]);
  
  // Don't render anything when not visible
  if (!visible) return null;
  
  return (
    <p 
      className="text-white text-xl mt-4"
      style={{ 
        opacity: opacity,
        transition: 'opacity 1.5s ease-in-out' // Increased from 0.5s to 1.5s (3x slower)
      }}
    >
      {text}
    </p>
  );
};

export default FadingText;
