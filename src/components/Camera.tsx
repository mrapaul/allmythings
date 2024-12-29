import React, { useCallback, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera as CameraIcon, X, RotateCcw } from 'lucide-react';

interface CameraProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      onCapture(imageSrc);
    }
  }, [onCapture]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-4 right-4 z-10 flex gap-4">
        <button
          onClick={toggleCamera}
          className="bg-zinc-800/80 text-white p-3 rounded-full backdrop-blur-sm"
        >
          <RotateCcw size={24} />
        </button>
        <button
          onClick={onClose}
          className="bg-zinc-800/80 text-white p-3 rounded-full backdrop-blur-sm"
        >
          <X size={24} />
        </button>
      </div>
      
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        videoConstraints={{
          facingMode,
          aspectRatio: 1,
        }}
        className="w-full h-full object-cover"
      />
      
      <button
        onClick={capture}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white rounded-full p-4 shadow-lg"
      >
        <CameraIcon size={32} className="text-black" />
      </button>
    </div>
  );
};