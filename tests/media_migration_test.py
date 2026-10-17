"""Offline migration contract tests; every remote response is synthetic."""
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import migrate_media_r2 as migration


class Response(io.BytesIO):
    status = 200


class MigrationTests(unittest.TestCase):
    def test_backups_json_urls_checksums_resume_and_switch_transaction(self):
        objects = {'media/user/font.woff2': b'synthetic-font',
                   'threads-reposts/post.json': json.dumps({'media': [migration.SOURCE + '/storage/v1/object/public/media/user/font.woff2']}).encode()}
        uploaded = {}
        calls = []
        origin = 'https://media.test'
        def remote(request, **_):
            url = request if isinstance(request, str) else request.full_url
            method = 'GET' if isinstance(request, str) else request.method
            calls.append(method)
            if url.startswith(migration.SOURCE):
                return Response(objects[urllib.parse.unquote(url.split('/object/public/', 1)[1])])
            if method == 'PUT':
                self.assertEqual(request.get_header('X-blog-internal-token'), 'synthetic-secret')
                uploaded[urllib.parse.unquote(url.split('/object/', 1)[1])] = request.data
                return Response(b'{}')
            return Response(uploaded[urllib.parse.unquote(url.split('/object/public/', 1)[1])])
        rows = [{'bucket_id': key.split('/', 1)[0], 'name': key.split('/', 1)[1], 'size_bytes': len(value),
                 'content_type': 'application/json' if key.endswith('.json') else 'font/woff2', 'updated_at': 'synthetic-v1'}
                for key, value in reversed(list(objects.items()))]
        with tempfile.TemporaryDirectory() as folder, patch.object(migration.urllib.request, 'urlopen', remote), patch.object(migration.upload_opener, 'open', remote):
            directory = Path(folder) / 'migration'
            manifest = migration.migrate(rows, directory, origin, 'synthetic-secret')
            self.assertEqual((directory / 'backup/threads-reposts/post.json').read_bytes(), objects['threads-reposts/post.json'])
            self.assertIn(origin.encode(), uploaded['threads-reposts/post.json'])
            self.assertNotIn(migration.SOURCE.encode(), uploaded['threads-reposts/post.json'])
            self.assertEqual(manifest['media/user/font.woff2']['backup_sha256'], hashlib.sha256(objects['media/user/font.woff2']).hexdigest())
            self.assertIn('COMMIT;', (directory / 'switch-media.sql').read_text())
            self.assertIn(origin, (directory / 'rollback-media.sql').read_text())
            self.assertIn('IS DISTINCT FROM', (directory / 'rollback-media.sql').read_text())
            self.assertNotIn('synthetic-secret', (directory / 'manifest.json').read_text())
            migration.migrate(rows, directory, origin, 'synthetic-secret')
            self.assertNotIn('DELETE', calls)
            with patch.object(migration.upload_opener, 'open', side_effect=RuntimeError('synthetic outage')):
                with self.assertRaisesRegex(RuntimeError, 'synthetic outage'):
                    migration.migrate(rows, directory, origin, 'synthetic-secret')
            self.assertFalse((directory / 'switch-media.sql').exists())
            self.assertTrue((directory / 'rollback-media.sql').exists(), 'Retain rollback from the last successful run')
            self.assertNotIn('verified_url', json.loads((directory / 'manifest.json').read_text())['media/user/font.woff2'])
            with self.assertRaisesRegex(ValueError, 'Destination changed'):
                migration.migrate(rows, directory, 'https://other.test', 'synthetic-secret')
            (directory / 'backup/media/user/font.woff2').write_bytes(b'corrupted')
            with self.assertRaisesRegex(ValueError, 'Unverified existing backup'):
                migration.migrate(rows, directory, origin, 'synthetic-secret')

    def test_paths_and_incomplete_inventory_cannot_switch(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                migration.local_path(Path(folder), 'media', '../escape')
            with self.assertRaises(ValueError):
                migration.write_switch_sql(Path(folder) / 'switch.sql', [{'bucket_id': 'media', 'name': 'x'}], {'media/x': {}})
            self.assertFalse((Path(folder) / 'switch.sql').exists())

    def test_invalid_inventory_and_origin_fail_before_network_access(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(migration.urllib.request, 'urlopen') as network:
            rows = [{'bucket_id': 'media', 'name': 'ok', 'size_bytes': 1},
                    {'bucket_id': 'media', 'name': '../escape', 'size_bytes': 1}]
            with self.assertRaisesRegex(ValueError, 'Invalid inventory'):
                migration.migrate(rows, Path(folder))
            for origin in ('http://media.test', 'https://user:secret@media.test', 'https://media.test/path', 'https://media.test?x=1'):
                with self.assertRaisesRegex(ValueError, 'plain HTTPS origin'):
                    migration.migrate(rows[:1], Path(folder), origin, 'synthetic-secret')
            network.assert_not_called()

    def test_authenticated_upload_redirects_are_rejected(self):
        request = migration.urllib.request.Request('https://media.test/object/media/x', data=b'test',
                    headers={'X-Blog-Internal-Token': 'synthetic-secret'}, method='PUT')
        with self.assertRaisesRegex(ValueError, 'redirects are not allowed'):
            migration.NoUploadRedirect().redirect_request(request, None, 307, 'redirect', {}, 'https://other.test/object/media/x')


if __name__ == '__main__':
    unittest.main()
