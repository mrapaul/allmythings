import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface InventoryItem {
  id: string;
  name: string;
  imageUrl: string;
  detectedObjects: string[];
  createdAt: string;
}

interface InventoryState {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  addItem: (imageUrl: string, detectedObjects: string[]) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set) => ({
  items: [],
  loading: false,
  error: null,
  
  fetchItems: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      set({ items: data, error: null });
    } catch (error) {
      set({ error: (error as Error).message });
    } finally {
      set({ loading: false });
    }
  },
  
  addItem: async (imageUrl: string, detectedObjects: string[]) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .insert([
          {
            image_url: imageUrl,
            detected_objects: detectedObjects,
          },
        ]);
        
      if (error) throw error;
      
      // Refresh items after adding
      const fetchItems = useInventoryStore.getState().fetchItems;
      await fetchItems();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },
}));