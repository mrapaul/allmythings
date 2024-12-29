import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { analyzeSpatialImage } from '../lib/gemini/client';
import type { DetectedObject, SpatialAnalysisResult } from '../lib/gemini/types';
import toast from 'react-hot-toast';

export interface InventoryItem {
  id: string;
  name: string;
  imageUrl: string;
  detectedObjects: DetectedObject[];
  sceneDescription?: string;
  relationships?: string[];
  createdAt: string;
  notes?: string;
  location?: string;
}

interface InventoryState {
  items: InventoryItem[];
  loading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  addItem: (imageUrl: string) => Promise<void>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
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
      toast.error('Failed to fetch items');
    } finally {
      set({ loading: false });
    }
  },
  
  addItem: async (imageUrl: string) => {
    set({ loading: true });
    try {
      // Analyze image using Gemini
      const analysis: SpatialAnalysisResult = await analyzeSpatialImage(imageUrl);
      
      const { error } = await supabase
        .from('inventory_items')
        .insert([
          {
            image_url: imageUrl,
            detected_objects: analysis.objects,
            scene_description: analysis.sceneDescription,
            relationships: analysis.relationships,
          },
        ]);
        
      if (error) throw error;
      
      toast.success('Item added successfully');
      await get().fetchItems();
    } catch (error) {
      set({ error: (error as Error).message });
      toast.error('Failed to add item');
    } finally {
      set({ loading: false });
    }
  },

  updateItem: async (id: string, updates: Partial<InventoryItem>) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Item updated successfully');
      await get().fetchItems();
    } catch (error) {
      toast.error('Failed to update item');
      set({ error: (error as Error).message });
    }
  },

  deleteItem: async (id: string) => {
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Item deleted successfully');
      await get().fetchItems();
    } catch (error) {
      toast.error('Failed to delete item');
      set({ error: (error as Error).message });
    }
  },
}));