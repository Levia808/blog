"""Synthetic files only: privacy classification, staging limits and verified URL switches."""
import hashlib
import io
import json
import sys
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import migrate_media_pages as migration


def row(name, size=8, bucket='media', mime='image/webp'):
    return {'bucket_id': bucket, 'name': name, 'size_bytes': size, 'content_type': mime, 'updated_at': 'synthetic-v1'}


def url(key):
    return migration.backup.SOURCE + '/storage/v1/object/public/' + key


class Response(io.BytesIO):
    status = 200

    def __init__(self, data, address, mime='image/webp'):
        super().__init__(data)
        self.address = address
        self.headers = Message()
        self.headers['Content-Type'] = mime

    def geturl(self):
        return self.address


class PagesMigrationTests(unittest.TestCase):
    def test_snapshot_excludes_restricted_shared_and_unknown_objects(self):
        rows = [row(n) for n in ['visible.webp', 'preview-visible.webp', 'shared.webp', 'private.webp', 'preview-private.webp', 'unknown.webp']]
        snapshot = {'tables': {'moments': {'rows': [
            {'visibility': 'public', 'media': [url('media/visible.webp') + '?width=600', url('media/shared.webp')]},
            {'visibility': 'whitelist', 'media': [url('media/private.webp'), url('media/shared.webp')]}
        ]}, 'profiles': {'rows': []}}}
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            report = migration.plan(rows, snapshot, directory)
            self.assertEqual(report['public_candidates'], 2)
            self.assertEqual(set(report['protected']), {'media/private.webp', 'media/preview-private.webp', 'media/shared.webp'})
            self.assertEqual(report['unclassified'], ['media/unknown.webp'])
            self.assertEqual((directory / 'public-candidates.json').stat().st_mode & 0o777, 0o600)

    def setup_files(self, directory, rows, bodies):
        journal = {}
        for item in rows:
            key = item['bucket_id'] + '/' + item['name']
            source = migration.backup.local_path(directory / 'transfer/optimized', item['bucket_id'], item['name'])
            source.write_bytes(bodies[key])
            journal[key] = {'source_url': url(key), 'output_sha256': hashlib.sha256(bodies[key]).hexdigest(),
                            'content_type': item['content_type'], 'source_bytes': item['size_bytes'],
                            'optimization': {'action': 'preserved'}}
        return journal

    def test_staging_does_not_switch_until_every_public_file_is_verified(self):
        rows = [row('a.webp'), row('post.json', bucket='threads-reposts', mime='application/json')]
        bodies = {'media/a.webp': b'synthetic-image', 'threads-reposts/post.json': json.dumps({'media': [url('media/a.webp')]}).encode()}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); directory = root / 'private'; checkout = root / 'checkout'; checkout.mkdir()
            (checkout / 'hugo.yaml').write_text('baseURL: https://blog.test')
            journal = self.setup_files(directory, rows, bodies)
            with patch.object(migration.backup, 'migrate', return_value=journal):
                manifest = migration.prepare(rows, directory, checkout)
                self.assertFalse((directory / 'switch-pages.sql').exists())
                for record in manifest['records']:
                    self.assertTrue((checkout / 'static' / record['relative']).is_file())
                post = next(r for r in manifest['records'] if r['key'].endswith('.json'))
                self.assertNotIn(migration.backup.SOURCE, Path(post['file']).read_text())
                migration.prepare(rows, directory, checkout)  # A complete, identical resume is safe.
                original = next(r for r in manifest['records'] if r['key'] == 'media/a.webp')
                def remote(request, **_):
                    record = next(r for r in manifest['records'] if r['verified_url'] == request.full_url)
                    return Response(Path(record['file']).read_bytes(), request.full_url, record['content_type'])
                with patch.object(migration.urllib.request, 'urlopen', side_effect=remote):
                    self.assertEqual(migration.verify(directory), 2)
                self.assertIn('COMMIT;', (directory / 'switch-pages.sql').read_text())
                self.assertIn(migration.DEFAULT_ORIGIN, (directory / 'rollback-pages.sql').read_text())
                with patch.object(migration.urllib.request, 'urlopen', return_value=Response(b'wrong', original['verified_url'])):
                    with self.assertRaisesRegex(ValueError, 'checksum'):
                        migration.verify(directory)
                self.assertFalse((directory / 'switch-pages.sql').exists())
                self.assertTrue((directory / 'rollback-pages.sql').exists())
                (checkout / 'static' / original['relative']).write_bytes(b'other-user-content')
                with self.assertRaisesRegex(ValueError, 'overwrite'):
                    migration.prepare(rows, directory, checkout)
                with self.assertRaisesRegex(ValueError, 'incomplete'):
                    migration.verify(directory)

    def test_large_files_bad_paths_and_private_json_do_not_stage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); checkout = root / 'checkout'; checkout.mkdir(); (checkout / 'hugo.yaml').touch()
            with self.assertRaisesRegex(ValueError, 'outside the release checkout'):
                migration.prepare([row('a.webp')], checkout / 'private', checkout)
            with self.assertRaisesRegex(ValueError, 'plain HTTPS origin'):
                migration.prepare([row('a.webp')], root / 'private', checkout, 'https://user:secret@media.test')
            for name in ['../escape.webp', 'a?b.webp']:
                with self.assertRaises(ValueError):
                    migration.prepare([row(name)], root / 'private', checkout)
            rows = [row('a.webp')]; directory = root / 'private'
            journal = self.setup_files(directory, rows, {'media/a.webp': b'large-synthetic'})
            with patch.object(migration.backup, 'migrate', return_value=journal), patch.object(migration, 'MAX_FILE', 5):
                with self.assertRaisesRegex(ValueError, '25 MiB'):
                    migration.prepare(rows, directory, checkout)
            self.assertFalse((checkout / 'static').exists())
            with patch.object(migration.backup, 'migrate', return_value=journal), patch.object(migration, 'MAX_IMPORT', 5):
                with self.assertRaisesRegex(ValueError, '800 MiB'):
                    migration.prepare(rows, directory, checkout)
            self.assertFalse((checkout / 'static').exists())
            rows = [row('post.json', bucket='threads-reposts', mime='application/json')]
            directory = root / 'json-private'
            journal = self.setup_files(directory, rows, {'threads-reposts/post.json': json.dumps({'media': [url('media/private.webp')]}).encode()})
            with patch.object(migration.backup, 'migrate', return_value=journal):
                with self.assertRaisesRegex(ValueError, 'outside the reviewed'):
                    migration.prepare(rows, directory, checkout)
            self.assertFalse((checkout / 'static').exists())

    def test_compressed_file_extension_and_html_false_positive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); checkout = root / 'checkout'; checkout.mkdir(); (checkout / 'hugo.yaml').touch()
            rows = [row('photo.jpg', mime='image/jpeg')]; directory = root / 'private'
            journal = self.setup_files(directory, rows, {'media/photo.jpg': b'synthetic-webp'})
            journal['media/photo.jpg'].update(content_type='image/webp', optimization={'action': 'compressed'})
            with patch.object(migration.backup, 'migrate', return_value=journal):
                manifest = migration.prepare(rows, directory, checkout)
            record = manifest['records'][0]
            self.assertTrue(record['relative'].endswith('photo.jpg.webp'))
            with patch.object(migration.urllib.request, 'urlopen', return_value=Response(b'synthetic-webp', record['verified_url'], 'text/html')):
                with self.assertRaisesRegex(ValueError, 'MIME'):
                    migration.verify(directory)
            self.assertFalse((directory / 'switch-pages.sql').exists())


if __name__ == '__main__':
    unittest.main()
