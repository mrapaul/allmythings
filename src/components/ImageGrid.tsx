import React, { useState } from 'react';
import { useInventoryStore } from '../store/inventory';
import { Edit2, Trash2, Eye } from 'lucide-react';
import { ItemModal } from './ItemModal';
import { ObjectOverlay } from './ObjectOverlay';
import type { InventoryItem } from '../store/inventory';

export const ImageGrid: React.FC = () => {
  const { items, loading, deleteItem } = useInventoryStore();
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showOverlay, setShowOverlay] = useState<string | null>(null);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-0.5 bg-zinc-900">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative aspect-square overflow-hidden group"
          >
            <img
              src={item.imageUrl}
              alt={item.name || 'Inventory item'}
              className="w-full h-full object-cover"
            />
            
            {showOverlay === item.id && item.detectedObjects?.map((obj, index) => (
              <ObjectOverlay key={index} object={obj} />
            ))}

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3">
                {item.sceneDescription && (
                  <p className="text-sm text-white mb-2 line-clamp-2">
                    {item.sceneDescription}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowOverlay(showOverlay === item.id ? null : item.id)}
                    className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur-sm"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => setSelectedItem(item)}
                    className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur-sm"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="p-2 rounded-full bg-black/50 hover:bg-red-500/80 text-white transition-colors backdrop-blur-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}