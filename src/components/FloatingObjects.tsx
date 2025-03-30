
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import * as THREE from 'three';
import { useGLTF, SpotLight } from '@react-three/drei';

type ObjectProps = {
  position: [number, number, number];
  color: string;
  scale: number;
  rotationSpeed: [number, number, number];
  floatSpeed: number;
  maxY: number;
};

const FloatingObject: React.FC<ObjectProps> = ({ 
  position, 
  color, 
  scale, 
  rotationSpeed, 
  floatSpeed,
  maxY
}) => {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF('/pineapple.glb');
  
  // Create a clone of the scene to avoid sharing materials across instances
  const pineappleScene = useMemo(() => {
    const clonedScene = scene.clone();
    
    // Apply color to all meshes in the scene
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material = new THREE.MeshStandardMaterial({ 
          color: color,
          transparent: true,
          opacity: 0.7
        });
      }
    });
    
    return clonedScene;
  }, [scene, color]);
  
  useFrame(() => {
    if (group.current) {
      // Rotate the object (slower rotation)
      group.current.rotation.x += rotationSpeed[0];
      group.current.rotation.y += rotationSpeed[1];
      group.current.rotation.z += rotationSpeed[2];
      
      // Move upward (slower floating)
      group.current.position.y += floatSpeed;
      
      // Reset position when it goes too high, ensuring no pineapples touch the camera (z > 0.5)
      if (group.current.position.y > maxY) {
        group.current.position.y = -10;
        group.current.position.x = MathUtils.randFloatSpread(6);
        group.current.position.z = -MathUtils.randFloat(0.5, 3); // Always in front of camera but not touching
      }
    }
  });

  return (
    <group ref={group} position={position} scale={[scale, scale, scale]}>
      <primitive object={pineappleScene} />
    </group>
  );
};

// Spotlight component positioned just above the camera
const MainSpotlight = () => {
  return (
    <SpotLight
      position={[0, 0.5, 0]} // Just above the camera
      angle={0.6}
      penumbra={0.5}
      intensity={5} // Increased intensity even more
      color="#FEF7CD"
      castShadow
      attenuation={5}
      anglePower={5}
    />
  );
};

const FloatingObjects: React.FC = () => {
  const objects = useMemo(() => {
    const colors = ['#5924ed', '#2b78e4', '#f73585', '#b249f8', '#0f0920'];
    const items = [];
    
    for (let i = 0; i < 18; i++) { // Increased number of pineapples
      items.push({
        position: [
          MathUtils.randFloatSpread(6),  // x (narrower spread)
          MathUtils.randFloatSpread(10) - 15,  // y (start below screen)
          -MathUtils.randFloat(0.5, 3),   // z (in front of camera, not touching)
        ] as [number, number, number],
        color: colors[Math.floor(Math.random() * colors.length)],
        scale: MathUtils.randFloat(1.2, 1.8),  // Even larger scale
        rotationSpeed: [
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
        ] as [number, number, number],
        floatSpeed: MathUtils.randFloat(0.002, 0.005), // Even slower
        maxY: 15
      });
    }
    
    return items;
  }, []);

  // Preload the pineapple model
  useGLTF.preload('/pineapple.glb');

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <MainSpotlight />
      {objects.map((props, i) => (
        <FloatingObject key={i} {...props} />
      ))}
    </>
  );
};

export default FloatingObjects;
