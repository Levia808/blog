#!/usr/bin/env python3
"""Create a smaller copy; never overwrite the input or silently discard HDR."""
import argparse
import json
import re
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path

HDR_TRANSFERS = {'smpte2084', 'arib-std-b67'}
VIDEO_EXTS = {'.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi'}


def run(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[-1500:])
    return result.stdout


def probe(path):
    data = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)]))
    stream = next(s for s in data['streams'] if s.get('codec_type') == 'video')
    side = list(stream.get('side_data_list', []))
    if stream.get('color_transfer') in HDR_TRANSFERS or 'bt2020' in stream.get('color_primaries', ''):
        # Scan all HDR frames: HDR10+ metadata need not occur in the first frame.
        frames = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                 '-show_frames', '-show_entries', 'frame=side_data_list',
                                 '-of', 'json', str(path)]))
        for frame in frames.get('frames', []):
            for item in frame.get('side_data_list', []):
                if item not in side:
                    side.append(item)
    stream['side_data_list'] = side
    return stream


def image_needs_original(path):
    suffix = path.suffix.lower()
    if suffix not in {'.jpg', '.jpeg', '.png', '.webp'}:
        return True
    data = path.read_bytes()
    if suffix == '.webp':
        return len(data) < 21 or (data[12:16] == b'VP8X' and bool(data[20] & 2))
    if suffix in {'.jpg', '.jpeg'}:
        if not data.startswith(b'\xff\xd8'):
            return True
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 255:
                return True
            offset += 1
            while offset < len(data) and data[offset] == 255:
                offset += 1
            if offset >= len(data):
                return True
            marker = data[offset]
            offset += 1
            if marker in {218, 217}:
                break
            length = int.from_bytes(data[offset:offset + 2], 'big')
            if length < 2 or offset + length > len(data):
                return True
            if 224 <= marker <= 239 and re.search(rb'hdrgm|gain.?map|MPF\x00|21496', data[offset:offset + length], re.I):
                return True
            offset += length
    if suffix == '.png':
        if len(data) < 26 or data[24] > 8:
            return True
        offset = 8
        while offset + 12 <= len(data):
            size = int.from_bytes(data[offset:offset + 4], 'big')
            if offset + size + 12 > len(data):
                return True
            if data[offset + 4:offset + 8] in {b'cICP', b'mDCv', b'cLLi', b'acTL'}:
                return True
            offset += size + 12
    return False


def hdr_kind(stream):
    side = json.dumps(stream.get('side_data_list', []), ensure_ascii=True).lower()
    if any(value in side for value in ('dovi', 'dolby', '2094', 'hdr10+', 'dynamic hdr')):
        return 'dynamic'
    if stream.get('color_transfer') in HDR_TRANSFERS:
        return 'static'
    if stream.get('color_primaries') == 'bt2020':
        return 'unknown-hdr'
    if re.search(r'p(?:10|12|16)|rgb48|rgba64', stream.get('pix_fmt', '')) and stream.get('color_transfer') not in {'bt709', 'iec61966-2-1'}:
        return 'unknown-hdr'
    return 'sdr'


def x265_metadata(stream):
    params = ['pools=2', 'frame-threads=2']
    if stream.get('color_transfer') == 'smpte2084':
        params += ['hdr10=1', 'hdr10-opt=1']
    for item in stream.get('side_data_list', []):
        kind = item.get('side_data_type', '')
        if kind == 'Mastering display metadata':
            def chroma(name):
                return round(Fraction(item[name]) * 50000)
            def luminance(name):
                return round(Fraction(item[name]) * 10000)
            params.append('master-display=' + ''.join(
                f'{label}({chroma(prefix + "_x")},{chroma(prefix + "_y")})'
                for label, prefix in [('G', 'green'), ('B', 'blue'), ('R', 'red'), ('WP', 'white_point')]
            ) + f'L({luminance("max_luminance")},{luminance("min_luminance")})')
        if kind == 'Content light level metadata':
            params.append(f'max-cll={int(item["max_content"])},{int(item["max_average"])}')
    return ':'.join(params)


def optimize(source, destination):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve() or destination.exists():
        raise ValueError('Output must be a new file; source files are never overwritten')
    video = source.suffix.lower() in VIDEO_EXTS
    if not video and image_needs_original(source):
        shutil.copy2(source, destination)
        return {'action': 'preserved', 'reason': 'HDR/gain-map, animation or unsupported image format'}
    stream = probe(source)
    kind = hdr_kind(stream)
    if kind in {'dynamic', 'unknown-hdr'}:
        shutil.copy2(source, destination)
        return {'action': 'preserved', 'reason': kind}
    preview = not video and source.name.startswith('preview-')
    edge = 1920 if video else 600 if preview else 2560
    command = ['ffmpeg', '-n', '-v', 'error', '-i', str(source), '-map', '0:v:0']
    if video:
        command += ['-map', '0:a?', '-map_metadata', '0']
    width, height = stream['width'], stream['height']
    if max(width, height) > edge or (video and (width % 2 or height % 2)):
        command += ['-vf', f'scale={min(width, edge)}:{min(height, edge)}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos']
    if not video:
        command += ['-frames:v', '1', '-c:v', 'libwebp', '-quality', '70' if preview else '86', '-f', 'webp']
    elif kind == 'static':
        command += ['-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p10le',
                    '-tag:v', 'hvc1', '-x265-params', x265_metadata(stream)]
        for name, option in [('color_primaries', '-color_primaries'), ('color_transfer', '-color_trc'),
                             ('color_space', '-colorspace'), ('color_range', '-color_range')]:
            if stream.get(name) and stream[name] != 'unknown':
                command += [option, stream[name]]
    else:
        command += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p']
    if video:
        command += ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4']
    try:
        run(command + [str(destination)])
        output = probe(destination)
        if max(output['width'], output['height']) > edge:
            raise RuntimeError('Output dimensions exceed the configured long edge')
        if kind == 'static':
            if '10' not in output.get('pix_fmt', ''):
                raise RuntimeError('HDR output is not 10-bit')
            for field in ('color_transfer', 'color_primaries', 'color_space'):
                if stream.get(field) != output.get(field):
                    raise RuntimeError('HDR color metadata changed: ' + field)
            for item in stream.get('side_data_list', []):
                if item.get('side_data_type') in {'Mastering display metadata', 'Content light level metadata'}:
                    matches = [v for v in output.get('side_data_list', []) if v.get('side_data_type') == item['side_data_type']]
                    if not matches or any(Fraction(v) != Fraction(matches[0].get(k, '-1')) for k, v in item.items() if k != 'side_data_type'):
                        raise RuntimeError('HDR mastering/light metadata was not preserved')
        if destination.stat().st_size >= source.stat().st_size:
            shutil.copy2(source, destination)
            return {'action': 'preserved', 'reason': 'Encoded copy was not smaller'}
        return {'action': 'compressed', 'hdr': kind, 'width': output['width'], 'height': output['height'],
                'before': source.stat().st_size, 'after': destination.stat().st_size}
    except Exception:
        destination.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(optimize(args.source, args.destination), ensure_ascii=False))
