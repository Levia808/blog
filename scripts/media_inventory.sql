-- Read-only: export the result as CSV/JSON before running migrate_media_r2.py.
SELECT bucket_id, name,
       (metadata->>'size')::bigint AS size_bytes,
       metadata->>'mimetype' AS content_type,
       updated_at
FROM storage.objects
WHERE bucket_id IN ('media', 'avatars', 'threads-reposts', 'user-audio')
ORDER BY bucket_id, name;
