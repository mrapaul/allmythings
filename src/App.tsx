import React, { useState, useEffect } from 'react';
import { Camera, Upload, User, List } from 'lucide-react';
import { Camera as CameraComponent } from './components/Camera';
import { ImageGrid } from './components/ImageGrid';
import { useInventoryStore } from './store/inventory';

function App() {
  const [showCamera, setShowCamera] = useState(false);
  const { fetchItems, addItem } = useInventoryStore();
  
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCapture = async (imageSrc: string) => {
    setShowCamera(false);
    // TODO: Integrate with AI service for object detection
    await addItem(imageSrc, ['Detected Object 1', 'Detected Object 2']);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        // TODO: Integrate with AI service for object detection
        await addItem(base64String, ['Detected Object 1', 'Detected Object 2']);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button className="p-2 hover:bg-gray-100 rounded-full">
            <User size={24} />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-full">
            <List size={24} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-24">
        <ImageGrid />
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 left-8">
        <label className="inline-flex bg-blue-600 text-white shadow-lg rounded-full p-4 cursor-pointer hover:bg-blue-700 hover:shadow-xl transition-all">
          <Upload size={24} />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      <button
        onClick={() => setShowCamera(true)}
        className="fixed bottom-8 right-8 bg-blue-600 text-white shadow-lg rounded-full p-4 hover:bg-blue-700 hover:shadow-xl transition-all"
      >
        <Camera size={24} />
      </button>

      {showCamera && (
        <CameraComponent
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

export default App;