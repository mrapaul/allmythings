import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useInventoryStore } from '../store/inventory';
import type { InventoryItem } from '../store/inventory';

interface ItemModalProps {
  item: InventoryItem;
  onClose: () => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({ item, onClose }) => {
  const { updateItem } = useInventoryStore();
  const [name, setName] = useState(item.name || '');
  const [location, setLocation] = useState(item.location || '');
  const [notes, setNotes] = useState(item.notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateItem(item.id, { name, location, notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-md text-white">
        <div className="flex justify-between items-center p-4 border-b border-zinc-800">
          <h2 className="text-xl font-semibold">Edit Item</h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Item name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Living Room, Kitchen"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Add any additional notes..."
              />
            </div>

            {item.sceneDescription && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  AI Scene Description
                </label>
                <p className="text-sm text-zinc-400 bg-zinc-800/50 p-3 rounded-lg">
                  {item.sceneDescription}
                </p>
              </div>
            )}

            {item.relationships && item.relationships.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Spatial Relationships
                </label>
                <ul className="text-sm text-zinc-400 bg-zinc-800/50 p-3 rounded-lg space-y-1">
                  {item.relationships.map((rel, index) => (
                    <li key={index}>• {rel}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};