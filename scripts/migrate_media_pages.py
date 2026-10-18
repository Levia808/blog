#!/usr/bin/env python3
"""Plan and stage a reviewed public-media migration. Never pushes, runs SQL or deletes source files."""
import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

import migrate_media_r2 as backup

MAX_FILE = 25 * 1024 * 1024
MAX_IMPORT = 800 * 1024 * 1024  # Leave room below GitHub Pages' 1 GB published-site limit.
DEFAULT_ORIGIN = 'https://blog-go3.pages.dev'
URL_PATTERN = re.compile(re.escape(backup.SOURCE) + r'/storage/v1/(?:object|render/image)/public/([^\s\"\'<>]+)')


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    backup.save_journal(path, value)
    path.chmod(0o600)


def validate(rows, root):
    seen = set()
    for row in rows:
        key = row['bucket_id'] + '/' + row['name']
        backup.local_path(root, row['bucket_id'], row['name'])
        if key in seen or re.search(r'[?#]', row['name']):
            raise ValueError('Duplicate or unsupported object path')
        seen.add(key)
        if not 0 < int(row['size_bytes']) <= 100 * 1024 * 1024:
            raise ValueError('Invalid source size')
    return seen


def references(value, names):
    if isinstance(value, dict):
        return set().union(*(references(v, names) for v in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(references(v, names) for v in value)) if value else set()
    if not isinstance(value, str):
        return set()
    result = set()
    for match in URL_PATTERN.finditer(value):
        key = urllib.parse.unquote(urllib.parse.urlsplit('https://source/' + match[1]).path.lstrip('/'))
        if key not in names:
            key = key.rstrip('.,;)]}')
        if key in names:
            result.add(key)
    return result


def plan(rows, snapshot, directory):
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    names = validate(rows, directory / 'path-check')
    public, protected = set(), set()
    tables = snapshot['tables']
    for moment in tables['moments']['rows']:
        target = public if moment.get('visibility') == 'public' and not moment.get('hidden_from') else protected
        target.update(references([moment.get('media'), moment.get('content')], names))
    for profile in tables['profiles']['rows']:
        public.update(references(profile.get('avatar_url'), names))
    # A preview inherits its original's protection, including shared public/restricted objects.
    for key in names:
        parent, _, name = key.rpartition('/')
        if name.startswith('preview-'):
            original = parent + '/' + name[len('preview-'):]
            if original in protected:
                protected.add(key)
            elif original in public:
                public.add(key)
    eligible = public - protected
    candidates = [row for row in rows if row['bucket_id'] + '/' + row['name'] in eligible]
    report = {
        'objects': len(rows), 'source_bytes': sum(int(r['size_bytes']) for r in rows),
        'public_candidates': len(candidates), 'candidate_bytes': sum(int(r['size_bytes']) for r in candidates),
        'protected': sorted(protected), 'unclassified': sorted(names - public - protected),
        'oversize_source_objects': [r['bucket_id'] + '/' + r['name'] for r in rows if int(r['size_bytes']) > MAX_FILE],
        'limits': {'file_bytes': MAX_FILE, 'import_bytes': MAX_IMPORT},
        'snapshot_captured_at': snapshot.get('captured_at'),
        'note': 'Metadata snapshot only. Review candidates before publishing; do not publish this private report.'
    }
    save(directory / 'plan.json', report)
    save(directory / 'public-candidates.json', candidates)
    return report


def origin_url(origin):
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Pages requires a plain HTTPS origin')
    return origin.rstrip('/')


def prepare(rows, directory, checkout, origin=DEFAULT_ORIGIN):
    origin = origin_url(origin)
    if directory.resolve().is_relative_to(checkout.resolve()):
        raise ValueError('Keep private backups outside the release checkout')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    (directory / 'switch-pages.sql').unlink(missing_ok=True)
    names = validate(rows, directory / 'path-check')
    if not names:
        raise ValueError('No reviewed public candidates')
    if not (checkout / 'hugo.yaml').is_file():
        raise ValueError('Use a separate Hugo release checkout')
    if not (checkout / 'static').resolve().is_relative_to(checkout.resolve()):
        raise ValueError('Static directory escapes the checkout')
    manifest_path = directory / 'pages-manifest.json'
    inventory_hash = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())
        if previous['origin'] != origin or previous['inventory_sha256'] != inventory_hash:
            raise ValueError('Inventory or destination changed; use a new migration directory')
    save(manifest_path, {'origin': origin, 'inventory_sha256': inventory_hash, 'state': 'preparing'})
    allowed = {'.webp', '.jpg', '.jpeg', '.png', '.avif', '.heic', '.heif', '.jxl', '.gif', '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'}
    for row in rows:
        if Path(row['name']).suffix.lower() not in allowed and not (row['bucket_id'] == 'threads-reposts' and row['name'].endswith('.json')):
            raise ValueError('Unsupported public media type')
    journal = backup.migrate(rows, directory / 'transfer')
    records = []
    for row in rows:
        key = row['bucket_id'] + '/' + row['name']
        record = journal[key]
        source = backup.local_path(directory / 'transfer/optimized', row['bucket_id'], row['name'])
        if backup.digest(source) != record['output_sha256']:
            raise ValueError('Optimized checksum mismatch')
        name = row['name']
        mime = record['content_type']
        if record['optimization']['action'] == 'compressed':
            suffix = '.mp4' if mime == 'video/mp4' else '.webp'
            if not name.lower().endswith(suffix):
                name += suffix
        relative = 'media/' + row['bucket_id'] + '/import-' + inventory_hash[:16] + '/' + name
        records.append({**record, 'key': key, 'relative': relative, 'file': str(source.resolve()),
                        'verified_url': origin + '/' + urllib.parse.quote(relative, safe='/')})
    mapping = {record['key']: record['verified_url'] for record in records}

    def rewrite(value):
        if isinstance(value, dict):
            return {k: rewrite(v) for k, v in value.items()}
        if isinstance(value, list):
            return [rewrite(v) for v in value]
        if isinstance(value, str):
            for prefix in ('/storage/v1/object/public/', '/storage/v1/render/image/public/'):
                if value.startswith(backup.SOURCE + prefix):
                    parsed = urllib.parse.urlsplit(value)
                    key = urllib.parse.unquote(parsed.path.split(prefix, 1)[1])
                    if key not in mapping:
                        raise ValueError('JSON references an object outside the reviewed public inventory')
                    return mapping[key] + ('?' + parsed.query if parsed.query else '')
        return value

    total, destinations = 0, set()
    for record in records:
        source = Path(record['file'])
        if record['key'].startswith('threads-reposts/') and source.suffix == '.json':
            source = backup.local_path(directory / 'pages-json', 'threads-reposts', record['key'].split('/', 1)[1])
            save(source, rewrite(json.loads(Path(record['file']).read_text())))
            record['file'] = str(source.resolve())
        record.update(output_sha256=backup.digest(source), output_bytes=source.stat().st_size)
        if not 0 < record['output_bytes'] <= MAX_FILE:
            raise ValueError('An optimized object exceeds the Pages 25 MiB limit')
        total += record['output_bytes']
        destination = checkout / 'static' / record['relative']
        if not destination.resolve().is_relative_to((checkout / 'static').resolve()) or record['relative'] in destinations:
            raise ValueError('Invalid or colliding Pages destination')
        destinations.add(record['relative'])
        if destination.exists() and backup.digest(destination) != record['output_sha256']:
            raise ValueError('Refusing to overwrite a different repository file')
    if total > MAX_IMPORT:
        raise ValueError('Optimized import exceeds the 800 MiB migration budget')
    # Complete all checks before writing any public repository asset.
    for record in records:
        destination = checkout / 'static' / record['relative']
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            with destination.open('xb') as output:
                output.write(Path(record['file']).read_bytes())
    manifest = {'origin': origin, 'inventory_sha256': inventory_hash, 'state': 'prepared', 'records': records}
    save(manifest_path, manifest)
    return manifest


def verify(directory):
    (directory / 'switch-pages.sql').unlink(missing_ok=True)
    manifest = json.loads((directory / 'pages-manifest.json').read_text())
    if manifest.get('state') != 'prepared' or not manifest.get('records'):
        raise ValueError('The public-media preparation is incomplete')
    origin = origin_url(manifest['origin'])
    journal, rows = {}, []
    for record in manifest['records']:
        expected_url = origin + '/' + urllib.parse.quote(record['relative'], safe='/')
        if record['verified_url'] != expected_url or not record['relative'].startswith('media/'):
            raise ValueError('Unexpected verification URL')
        request = urllib.request.Request(expected_url, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(MAX_FILE + 1)
            mime = response.headers.get_content_type()
            if response.status != 200 or response.geturl() != expected_url or mime != record['content_type'].split(';')[0]:
                raise ValueError('Pages returned the wrong status, URL or MIME type')
        if len(data) != record['output_bytes'] or hashlib.sha256(data).hexdigest() != record['output_sha256']:
            raise ValueError('Pages round-trip checksum mismatch')
        journal[record['key']] = record
        bucket, name = record['key'].split('/', 1)
        rows.append({'bucket_id': bucket, 'name': name})
    backup.write_switch_sql(directory / 'switch-pages.sql', rows, journal)
    backup.write_switch_sql(directory / 'rollback-pages.sql', rows, journal, reverse=True)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    audit = sub.add_parser('plan')
    audit.add_argument('inventory', type=Path)
    audit.add_argument('snapshot', type=Path)
    audit.add_argument('directory', type=Path)
    stage = sub.add_parser('prepare')
    stage.add_argument('directory', type=Path)
    stage.add_argument('checkout', type=Path)
    stage.add_argument('--confirm-public-history', action='store_true', required=True)
    stage.add_argument('--origin', default=DEFAULT_ORIGIN)
    check = sub.add_parser('verify')
    check.add_argument('directory', type=Path)
    args = parser.parse_args()
    if args.action == 'plan':
        report = plan(json.loads(args.inventory.read_text()), json.loads(args.snapshot.read_text()), args.directory)
        print(json.dumps({k: report[k] for k in ('objects', 'source_bytes', 'public_candidates', 'candidate_bytes')}))
    elif args.action == 'prepare':
        result = prepare(json.loads((args.directory / 'public-candidates.json').read_text()), args.directory, args.checkout, args.origin)
        print('Staged', len(result['records']), 'files. Review and deploy before verify; SQL has not run.')
    else:
        print('Verified', verify(args.directory), 'files. Review switch-pages.sql; SQL has not run.')


if __name__ == '__main__':
    main()
