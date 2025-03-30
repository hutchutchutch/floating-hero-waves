
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import * as THREE from 'three';

type ObjectProps = {
  position: [number, number, number];
  color: string;
  shape: 'box' | 'sphere' | 'cone';
  size: number;
  rotationSpeed: [number, number, number];
  floatSpeed: number;
  maxY: number;
};

const FloatingObject: React.FC<ObjectProps> = ({ 
  position, 
  color, 
  shape, 
  size, 
  rotationSpeed, 
  floatSpeed,
  maxY
}) => {
  const mesh = useRef<THREE.Mesh>(null!);
  
  useFrame(() => {
    if (mesh.current) {
      // Rotate the object
      mesh.current.rotation.x += rotationSpeed[0];
      mesh.current.rotation.y += rotationSpeed[1];
      mesh.current.rotation.z += rotationSpeed[2];
      
      // Move upward
      mesh.current.position.y += floatSpeed;
      
      // Reset position when it goes too high
      if (mesh.current.position.y > maxY) {
        mesh.current.position.y = -10;
        mesh.current.position.x = MathUtils.randFloatSpread(20);
        mesh.current.position.z = MathUtils.randFloatSpread(10) - 5;
      }
    }
  });

  let geometry;
  switch (shape) {
    case 'box':
      geometry = <boxGeometry args={[size, size, size]} />;
      break;
    case 'sphere':
      geometry = <sphereGeometry args={[size, 16, 16]} />;
      break;
    case 'cone':
      geometry = <coneGeometry args={[size, size * 2, 16]} />;
      break;
    default:
      geometry = <boxGeometry args={[size, size, size]} />;
  }

  return (
    <mesh ref={mesh} position={position}>
      {geometry}
      <meshStandardMaterial color={color} transparent opacity={0.7} />
    </mesh>
  );
};

const FloatingObjects: React.FC = () => {
  const objects = useMemo(() => {
    const colors = ['#5924ed', '#2b78e4', '#f73585', '#b249f8', '#0f0920'];
    const shapes: ('box' | 'sphere' | 'cone')[] = ['box', 'sphere', 'cone'];
    const items = [];
    
    for (let i = 0; i < 35; i++) {
      items.push({
        position: [
          MathUtils.randFloatSpread(20),  // x
          MathUtils.randFloatSpread(10) - 15,  // y (start below screen)
          MathUtils.randFloatSpread(10) - 5,   // z
        ] as [number, number, number],
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        size: MathUtils.randFloat(0.2, 0.6),
        rotationSpeed: [
          MathUtils.randFloat(0.001, 0.003) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.001, 0.003) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.001, 0.003) * (Math.random() > 0.5 ? 1 : -1),
        ] as [number, number, number],
        floatSpeed: MathUtils.randFloat(0.01, 0.03),
        maxY: 15
      });
    }
    
    return items;
  }, []);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      {objects.map((props, i) => (
        <FloatingObject key={i} {...props} />
      ))}
    </>
  );
};

export default FloatingObjects;
