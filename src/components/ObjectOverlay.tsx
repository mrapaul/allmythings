import React from 'react';
import type { DetectedObject } from '../lib/gemini/types';

interface ObjectOverlayProps {
  object: DetectedObject;
}

export const ObjectOverlay: React.FC<ObjectOverlayProps> = ({ object }) => {
  const { boundingBox, name, confidence, category } = object;
  const { x, y, width, height } = boundingBox;

  return (
    <div
      className="absolute border-2 border-blue-400 bg-blue-400/10 backdrop-blur-sm"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
      }}
    >
      <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap backdrop-blur-sm">
        {name} ({Math.round(confidence * 100)}%)
        {category && <span className="ml-1 opacity-75">• {category}</span>}
      </div>
    </div>
  );
};