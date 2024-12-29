import React, { useState } from 'react';
import { Camera, Upload, User, Grid, LogOut } from 'lucide-react';
import { Camera as CameraComponent } from './components/Camera';
import { ImageGrid } from './components/ImageGrid';
import { useInventoryStore } from './store/inventory';
import { Toaster } from 'react-hot-toast';
import { LoadingOverlay } from './components/LoadingOverlay';

function App() {
  const [showCamera, setShowCamera] = useState(false);
  const { fetchItems, addItem, loading } = useInventoryStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const handleCapture = async (imageSrc: string) => {
    setShowCamera(false);
    await addItem(imageSrc);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await addItem(base64String);
      };
      reader.readAsDataURL(file);
      // Reset input to allow selecting the same file again
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-black border-b border-zinc-800 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-white font-semibold text-xl">Inventory</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <Grid size={24} className="text-white" />
            </button>
            <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <User size={24} className="text-white" />
            </button>
            <button className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <LogOut size={24} className="text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-24">
        <ImageGrid />
      </main>

      {/* Action Buttons */}
      <div className="fixed bottom-8 inset-x-0 flex justify-center gap-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg rounded-full p-4 transition-all"
          aria-label="Upload photo"
        >
          <Upload size={24} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />
        
        <button
          onClick={() => setShowCamera(true)}
          className="bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg rounded-full p-4 transition-all"
          aria-label="Take photo"
        >
          <Camera size={24} />
        </button>
      </div>

      {showCamera && (
        <CameraComponent
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
      
      {loading && <LoadingOverlay />}
    </div>
  );
}

export default App;