/*
  # Recreate inventory items table with updated structure

  1. Changes
    - Drop existing table
    - Create new table with proper column types
    - Re-enable RLS policies
  
  2. Structure
    - detected_objects as JSONB for spatial data
    - scene_description for AI analysis
    - relationships array for spatial relationships
    - Standard metadata fields
*/

-- Drop existing table
DROP TABLE IF EXISTS inventory_items;

-- Create new table with updated structure
CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text,
  image_url text NOT NULL,
  detected_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  scene_description text,
  relationships text[],
  notes text,
  location text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies
CREATE POLICY "Users can read own items"
  ON inventory_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON inventory_items
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON inventory_items
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON inventory_items
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);