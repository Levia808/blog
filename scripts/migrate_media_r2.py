#!/usr/bin/env python3
"""Back up, optimize and copy a reviewed Supabase inventory to R2. Never deletes source objects."""
import argparse
import csv
import hashlib
import json
import mimetypes
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from media_optimize import VIDEO_EXTS, optimize

SOURCE = 'https://iyquixzprfwkglaqptxj.supabase.co'
BUCKETS = {'media', 'avatars', 'threads-reposts', 'user-audio'}


class NoUploadRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        raise ValueError('Media upload redirects are not allowed')


upload_opener = urllib.request.build_opener(NoUploadRedirect())


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def local_path(root, bucket, name):
    if bucket not in BUCKETS or not name or any(p in {'', '.', '..'} for p in name.split('/')) or re.search(r'[\x00-\x1f\\]', name):
        raise ValueError('Invalid inventory object path')
    path = root / bucket / name
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Object path escapes backup directory')
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def download(url, path, expected_size=None):
    temporary = path.with_name(path.name + '.part')
    try:
        with urllib.request.urlopen(url, timeout=30) as response, temporary.open('xb') as output:
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 100 * 1024 * 1024:
                    raise ValueError('Object exceeds the 100 MiB migration limit')
                output.write(chunk)
        if expected_size is not None and size != expected_size:
            raise ValueError('Downloaded size does not match the reviewed inventory')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def migrate(rows, directory, origin=None, token=None):
    if origin:
        parsed = urllib.parse.urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.path not in {'', '/'} or parsed.query or parsed.fragment or not token:
            raise ValueError('Upload requires a plain HTTPS origin and a service token')
        origin = origin.rstrip('/')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    # A failed retry must not leave an earlier forward switch ready to run.
    (directory / 'switch-media.sql').unlink(missing_ok=True)
    journal_path = directory / 'manifest.json'
    journal = json.loads(journal_path.read_text()) if journal_path.exists() else {}
    rows = sorted(rows, key=lambda row: row['bucket_id'] == 'threads-reposts' and row['name'].endswith('.json'))
    names = {row['bucket_id'] + '/' + row['name'] for row in rows}
    if len(names) != len(rows):
        raise ValueError('Duplicate inventory object')
    for row in rows:
        local_path(directory / 'backup', row['bucket_id'], row['name'])
        if not 0 < int(row['size_bytes']) <= 100 * 1024 * 1024:
            raise ValueError('Inventory object must be between 1 byte and 100 MiB')
    for row in rows:
        bucket, name = row['bucket_id'], row['name']
        key = bucket + '/' + name
        encoded = bucket + '/' + urllib.parse.quote(name, safe='/')
        source_url = SOURCE + '/storage/v1/object/public/' + encoded
        backup = local_path(directory / 'backup', bucket, name)
        previous = journal.get(key, {})
        if origin:
            if previous.get('destination_origin', origin) != origin or (previous.get('verified_url') and not previous['verified_url'].startswith(origin + '/object/public/')):
                raise ValueError('Destination changed; use a new migration directory')
            previous.pop('verified_url', None)
            previous['destination_origin'] = origin
            journal[key] = previous
            save_journal(journal_path, journal)
        if backup.exists():
            if not previous.get('backup_sha256') or digest(backup) != previous['backup_sha256']:
                raise ValueError('Unverified existing backup: ' + key)
            if str(previous.get('source_updated_at', '')) != str(row.get('updated_at', '')) or backup.stat().st_size != int(row['size_bytes']):
                raise ValueError('Source inventory changed; use a new backup directory: ' + key)
        else:
            download(source_url, backup, int(row['size_bytes']))
        record = { 'source_url': source_url, 'source_updated_at': row.get('updated_at', ''),
                   'backup_sha256': digest(backup), 'source_bytes': backup.stat().st_size }
        journal[key] = {**previous, **record}
        save_journal(journal_path, journal)
        output = local_path(directory / 'optimized', bucket, name)
        if output.exists():
            if previous.get('output_sha256') != digest(output):
                raise ValueError('Unverified existing output: ' + key)
            result = previous['optimization']
        elif backup.suffix.lower() in VIDEO_EXTS | {'.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.jxl', '.gif'}:
            result = optimize(backup, output)
        else:
            import shutil
            shutil.copy2(backup, output)
            result = {'action': 'preserved', 'reason': 'Non-image/video object'}
        if origin and bucket == 'threads-reposts' and backup.suffix.lower() == '.json':
            def rewrite(value):
                if isinstance(value, dict):
                    return {k: rewrite(v) for k, v in value.items()}
                if isinstance(value, list):
                    return [rewrite(v) for v in value]
                if isinstance(value, str):
                    for prefix in ('/storage/v1/object/public/', '/storage/v1/render/image/public/'):
                        if value.startswith(SOURCE + prefix):
                            parsed = urllib.parse.urlsplit(value)
                            object_name = urllib.parse.unquote(parsed.path.split(prefix, 1)[1])
                            if object_name not in names:
                                raise ValueError('JSON references an object missing from the inventory: ' + object_name)
                            return origin + '/object/public/' + urllib.parse.quote(object_name, safe='/') + ('?' + parsed.query if parsed.query else '')
                return value
            output.write_text(json.dumps(rewrite(json.loads(backup.read_text())), ensure_ascii=False))
            result = {'action': 'references-updated', 'reason': 'Threads JSON points to migrated R2 objects'}
        content_type = row.get('content_type') or mimetypes.guess_type(name)[0] or 'application/octet-stream'
        if result['action'] == 'compressed':
            content_type = 'video/mp4' if backup.suffix.lower() in VIDEO_EXTS else 'image/webp'
        journal[key].update(output_sha256=digest(output), output_bytes=output.stat().st_size,
                            content_type=content_type, optimization=result)
        save_journal(journal_path, journal)
        if origin:
            request = urllib.request.Request(origin + '/object/' + encoded, data=output.read_bytes(), method='PUT', headers={
                'X-Blog-Internal-Token': token, 'Content-Type': content_type, 'X-Upsert': 'false'
            })
            try:
                with upload_opener.open(request, timeout=60) as response:
                    if response.status != 200:
                        raise ValueError('Unexpected upload response')
            except urllib.error.HTTPError as error:
                if error.code != 409:
                    raise
            verify = local_path(directory / 'verify', bucket, name)
            download(origin + '/object/public/' + encoded, verify, output.stat().st_size)
            if digest(verify) != digest(output):
                raise ValueError('R2 round-trip checksum mismatch: ' + key)
            verify.unlink()
            journal[key]['verified_url'] = origin + '/object/public/' + encoded
            save_journal(journal_path, journal)
        print(key, result['action'], backup.stat().st_size, '->', output.stat().st_size, flush=True)
    if origin:
        write_switch_sql(directory / 'switch-media.sql', rows, journal)
        write_switch_sql(directory / 'rollback-media.sql', rows, journal, reverse=True)
    return journal


def save_journal(path, journal):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(journal, ensure_ascii=False, indent=2))
    temporary.replace(path)


def write_switch_sql(path, rows, journal, reverse=False):
    """Generate a reviewable transaction only after every listed upload is verified."""
    selected = [journal[row['bucket_id'] + '/' + row['name']] for row in rows]
    if not selected or any(not record.get('verified_url') for record in selected):
        raise ValueError('Every object must pass round-trip verification before switching URLs')
    if reverse:
        selected = [{ 'source_url': record['verified_url'], 'verified_url': record['source_url'],
                      'output_bytes': record['source_bytes'], 'content_type': row.get('content_type') or mimetypes.guess_type(row['name'])[0] or 'application/octet-stream' }
                    for row, record in zip(rows, selected)]
    quote = lambda value: "'" + str(value).replace("'", "''") + "'"
    values = ',\n'.join('(' + ','.join([quote(record['source_url']), quote(record['verified_url']),
                                     str(record['output_bytes']), quote(record['content_type'])]) + ')'
                         for record in selected)
    path.write_text("""-- REVIEW BEFORE RUNNING. Back up database rows before applying this transaction.
-- This does not delete any Supabase objects. Retain backups and inspect remaining references.
BEGIN;
CREATE TEMP TABLE media_url_map (old_url text, new_url text, bytes bigint, mime text) ON COMMIT DROP;
INSERT INTO media_url_map VALUES
""" + values + ";\n" + """
CREATE OR REPLACE FUNCTION pg_temp.rewrite_media_urls(value text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM media_url_map ORDER BY length(old_url) DESC LOOP
    value := replace(value, item.old_url, item.new_url);
    value := replace(value, replace(item.old_url, '/object/public/', '/render/image/public/'), item.new_url);
  END LOOP;
  RETURN value;
END;
$$;
UPDATE public.media_assets a SET public_url = m.new_url, size_bytes = m.bytes, mime_type = m.mime
FROM media_url_map m WHERE a.public_url = m.old_url OR split_part(a.public_url, '?', 1) = m.old_url;
UPDATE public.profiles SET avatar_url = pg_temp.rewrite_media_urls(avatar_url)
WHERE avatar_url IS DISTINCT FROM pg_temp.rewrite_media_urls(avatar_url);
UPDATE public.moments SET media = pg_temp.rewrite_media_urls(media::text)::jsonb,
  content = pg_temp.rewrite_media_urls(content)
WHERE media::text IS DISTINCT FROM pg_temp.rewrite_media_urls(media::text)
   OR content IS DISTINCT FROM pg_temp.rewrite_media_urls(content);
UPDATE public.content_items SET metadata = pg_temp.rewrite_media_urls(metadata::text)::jsonb
WHERE metadata::text IS DISTINCT FROM pg_temp.rewrite_media_urls(metadata::text);
-- Historical versions, repository Markdown/YAML and pending offline tasks require a reference audit.
COMMIT;
""")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path, help='Reviewed SQL inventory export (JSON array or CSV)')
    parser.add_argument('directory', type=Path, help='Private local backup and optimization directory')
    parser.add_argument('--upload', action='store_true', help='Copy to BLOG_MEDIA_ORIGIN and verify by SHA-256')
    args = parser.parse_args()
    with args.inventory.open() as source:
        rows = list(csv.DictReader(source)) if args.inventory.suffix == '.csv' else json.load(source)
    origin = os.environ.get('BLOG_MEDIA_ORIGIN', '').rstrip('/') if args.upload else None
    token = os.environ.get('BLOG_MEDIA_TOKEN') if args.upload else None
    if args.upload and (not origin or not origin.startswith('https://') or not token):
        parser.error('--upload requires HTTPS BLOG_MEDIA_ORIGIN and secret BLOG_MEDIA_TOKEN environment variables')
    migrate(rows, args.directory, origin, token)


if __name__ == '__main__':
    main()
