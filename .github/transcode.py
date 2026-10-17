#!/usr/bin/env python3
"""Build video copies with a 1920px long edge; retain HDR and source files in Git."""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from media_optimize import VIDEO_EXTS, hdr_kind, optimize, probe


def make_preview(path, stream):
    # An untagged 8-bit preview must never replace an HDR video.
    if hdr_kind(stream) != 'sdr' or max(stream['width'], stream['height']) <= 480:
        return
    output = path.with_name(path.stem + '-preview.mp4')
    if output.exists():
        return
    result = subprocess.run([
        'ffmpeg', '-n', '-v', 'error', '-i', str(path),
        '-vf', 'scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '32', '-maxrate', '600k',
        '-bufsize', '1200k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(output)
    ], capture_output=True, text=True)
    if result.returncode:
        output.unlink(missing_ok=True)
        print('Preview failed:', result.stderr[-400:])


def main():
    root = Path(os.environ.get('GITHUB_WORKSPACE', '.'))
    targets = set()
    for folder in ('assets/images', 'assets/media', 'content'):
        directory = root / folder
        if directory.is_dir():
            targets.update(p for p in directory.rglob('*') if p.suffix.lower() in VIDEO_EXTS
                           and not p.stem.endswith('-preview') and '.tmp.' not in p.name)
    failures = []
    for path in sorted(targets):
        temporary = path.with_name(path.name + '.tmp.mp4')
        try:
            stream = probe(path)
            kind = hdr_kind(stream)
            if kind in {'dynamic', 'unknown-hdr'}:
                print('Preserved HDR source:', path)
                continue
            if stream['codec_name'] != 'h264' or max(stream['width'], stream['height']) > 1920:
                result = optimize(path, temporary)
                if result['action'] == 'compressed':
                    temporary.replace(path)
                    print(path.name, result)
                    stream = probe(path)
                else:
                    temporary.unlink()
            make_preview(path, stream)
        except Exception as error:
            temporary.unlink(missing_ok=True)
            failures.append(str(path))
            print('Video optimization failed:', path, str(error), file=sys.stderr)
    if failures:
        raise SystemExit(1)
    print('Video processing complete:', len(targets))


if __name__ == '__main__':
    main()
