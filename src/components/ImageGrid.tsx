import React from 'react';
import { useInventoryStore } from '../store/inventory';

export const ImageGrid: React.FC = () => {
  const { items, loading } = useInventoryStore();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="relative aspect-square rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow"
        >
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <div className="flex flex-wrap gap-1">
              {item.detectedObjects.map((obj, index) => (
                <span
                  key={index}
                  className="text-xs bg-white/20 text-white px-2 py-1 rounded-full"
                >
                  {obj}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};