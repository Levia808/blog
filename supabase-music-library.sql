-- Music library for self-uploaded audio files
-- Run this in Supabase SQL Editor

-- Table for user music library
CREATE TABLE IF NOT EXISTS music_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  duration INTEGER, -- seconds
  cover_url TEXT,
  audio_path TEXT NOT NULL, -- Supabase storage path
  audio_url TEXT NOT NULL, -- Public URL
  file_size BIGINT,
  mime_type TEXT,
  source TEXT DEFAULT 'upload' CHECK (source IN ('upload', 'audius', 'archive', 'jamendo')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_music_library_user ON music_library(user_id);
CREATE INDEX IF NOT EXISTS idx_music_library_created ON music_library(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_music_library_source ON music_library(source);

-- RLS policies
ALTER TABLE music_library ENABLE ROW LEVEL SECURITY;

-- Users can read their own music
CREATE POLICY music_library_select ON music_library
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own music
CREATE POLICY music_library_insert ON music_library
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own music
CREATE POLICY music_library_update ON music_library
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own music
CREATE POLICY music_library_delete ON music_library
  FOR DELETE
  USING (auth.uid() = user_id);

-- Storage bucket for user audio (if not exists)
-- Run in Supabase dashboard or via SQL if you have privileges:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('user-audio', 'user-audio', false) ON CONFLICT DO NOTHING;

-- Storage policies for user-audio bucket
-- Users can upload to their own folder
CREATE POLICY "Users can upload audio to own folder" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'user-audio' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own audio
CREATE POLICY "Users can read own audio" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'user-audio' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own audio
CREATE POLICY "Users can delete own audio" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'user-audio' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Function to get user's music catalog
CREATE OR REPLACE FUNCTION get_user_music_catalog(p_user_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_catalog JSONB;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'version', 1,
    'generatedAt', NOW(),
    'userId', v_user_id,
    'tracks', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id::text,
        'title', title,
        'artist', artist,
        'album', album,
        'duration', duration,
        'cover', cover_url,
        'matches', jsonb_build_array(
          jsonb_build_object(
            'provider', source,
            'providerTrackId', id::text,
            'title', title,
            'artist', artist,
            'album', album,
            'duration', duration,
            'cover', cover_url,
            'playbackMode', 'direct',
            'streamUrl', audio_url,
            'sourceUrl', audio_url,
            'attribution', CASE
              WHEN source = 'upload' THEN 'Uploaded by user'
              ELSE 'From ' || source
            END,
            'licenseInfo', COALESCE((metadata->>'license')::text, 'Personal use'),
            'status', 'playable',
            'confidence', 1.0,
            'checkedAt', updated_at
          )
        ),
        'bestMatch', 0,
        'originalSource', source,
        'originalId', id::text
      ) ORDER BY created_at DESC
    ), '[]'::jsonb)
  ) INTO v_catalog
  FROM music_library
  WHERE user_id = v_user_id;

  RETURN v_catalog;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_music_catalog IS 'Get user music catalog in float-player compatible format';
