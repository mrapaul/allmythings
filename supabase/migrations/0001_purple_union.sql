/*
  # Create inventory items table

  1. New Tables
    - `inventory_items`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text)
      - `image_url` (text)
      - `detected_objects` (text array)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `inventory_items` table
    - Add policies for authenticated users to manage their own items
*/

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text,
  image_url text NOT NULL,
  detected_objects text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own items
CREATE POLICY "Users can read own items"
  ON inventory_items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to insert their own items
CREATE POLICY "Users can insert own items"
  ON inventory_items
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own items
CREATE POLICY "Users can update own items"
  ON inventory_items
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own items
CREATE POLICY "Users can delete own items"
  ON inventory_items
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);