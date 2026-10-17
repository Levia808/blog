"""Synthetic fixtures only; no real user media."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('media_optimize', Path(__file__).resolve().parents[1] / 'scripts/media_optimize.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class MediaTests(unittest.TestCase):
    def test_dynamic_hdr_is_preserved(self):
        self.assertEqual(media.hdr_kind({'color_transfer': 'smpte2084', 'side_data_list': [{'side_data_type': 'HDR Dynamic Metadata SMPTE2094-40'}]}), 'dynamic')
        self.assertEqual(media.hdr_kind({'side_data_list': [{'side_data_type': 'DOVI configuration record'}]}), 'dynamic')
        self.assertEqual(media.hdr_kind({'pix_fmt': 'yuv420p10le'}), 'unknown-hdr')

    def test_gain_map_bytes_are_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'synthetic-gain-map.jpg'
            payload = b'hdrgm:Version="1.0"'
            source.write_bytes(b'\xff\xd8\xff\xe1' + (len(payload) + 2).to_bytes(2, 'big') + payload + b'\xff\xda\x00\x02')
            output = Path(directory) / 'copy.jpg'
            self.assertEqual(media.optimize(source, output)['action'], 'preserved')
            self.assertEqual(source.read_bytes(), output.read_bytes())
            with self.assertRaises(ValueError):
                media.optimize(source, source)

    def test_real_portrait_image_and_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'synthetic-portrait.jpg'
            media.run(['ffmpeg', '-n', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=2100x3000:rate=1',
                       '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '2', str(source)])
            original_bytes = source.read_bytes()
            output = root / 'small.webp'
            result = media.optimize(source, output)
            self.assertEqual(result['action'], 'compressed', result)
            info = media.probe(output)
            self.assertEqual(info['height'], 2560)
            self.assertLess(info['width'], info['height'])
            self.assertEqual(source.read_bytes(), original_bytes)
            preview_source = root / 'preview-synthetic-portrait.jpg'
            preview_source.write_bytes(original_bytes)
            preview = root / 'preview.webp'
            self.assertEqual(media.optimize(preview_source, preview)['action'], 'compressed')
            self.assertEqual(media.probe(preview)['height'], 600)

    def test_real_pq_hlg_and_sdr_encodes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for transfer in ('smpte2084', 'arib-std-b67', 'bt709'):
                with self.subTest(transfer=transfer):
                    source = root / (transfer + '.mp4')
                    output = root / (transfer + '-small.mp4')
                    hdr = transfer != 'bt709'
                    command = ['ffmpeg', '-n', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=2048x1152:rate=5',
                               '-t', '0.6', '-c:v', 'libx265' if hdr else 'libx264', '-preset', 'ultrafast', '-crf', '12',
                               '-pix_fmt', 'yuv420p10le' if hdr else 'yuv420p', '-color_trc', transfer,
                               '-color_primaries', 'bt2020' if hdr else 'bt709', '-colorspace', 'bt2020nc' if hdr else 'bt709']
                    if hdr:
                        params = 'pools=2:frame-threads=2'
                        if transfer == 'smpte2084':
                            params += ':hdr10=1:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400'
                        command += ['-x265-params', params]
                    subprocess.run(command + [str(source)], check=True, capture_output=True)
                    result = media.optimize(source, output)
                    self.assertEqual(result['action'], 'compressed', result)
                    info = media.probe(output)
                    self.assertLessEqual(max(info['width'], info['height']), 1920)
                    self.assertLess(output.stat().st_size, source.stat().st_size)
                    if hdr:
                        self.assertEqual(info['color_transfer'], transfer)
                        self.assertEqual(info['color_primaries'], 'bt2020')
                        self.assertIn('10', info['pix_fmt'])
                    print(json.dumps({'fixture': transfer, **result}), flush=True)

    def test_odd_dimensions_and_audio_survive_real_encode(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'odd.mov', Path(directory) / 'small.mp4'
            media.run(['ffmpeg', '-n', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=321x241:rate=10',
                       '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.5',
                       '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-crf', '0', '-c:a', 'pcm_s16le', str(source)])
            result = media.optimize(source, output)
            self.assertEqual(result['action'], 'compressed', result)
            info = media.probe(output)
            self.assertEqual((info['width'], info['height']), (320, 240))
            streams = json.loads(media.run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(output)]))['streams']
            self.assertEqual(next(s for s in streams if s['codec_type'] == 'audio')['codec_name'], 'aac')
            self.assertAlmostEqual(float(info['duration']), 0.5, delta=0.1)


if __name__ == '__main__':
    unittest.main()
