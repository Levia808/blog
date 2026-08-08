#!/usr/bin/env python3
"""构建时视频自动重编码: 任何编码 (HEVC/AV1/VP9/MKV...) → H.264 (全浏览器兼容)

- 扫描 assets/images 与 content 下的视频文件
- ffprobe 检测编码, 已是 H.264 则跳过
- 其他编码转码: H.264 + AAC + faststart, 超 1080p 自动降 1080p
- 转码产物覆盖工作区原路径 (Hugo 引用路径不变, 仓库原文件保留)
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}
MAX_EDGE = 1920  # 长边超过则降级到 1080p


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    r = run([
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height",
        "-of", "json", str(path),
    ])
    if r.returncode != 0:
        return None
    try:
        s = json.loads(r.stdout)["streams"][0]
        return s.get("codec_name", ""), int(s.get("width", 0)), int(s.get("height", 0))
    except (KeyError, IndexError, ValueError):
        return None


def transcode(path: Path, codec: str, w: int, h: int):
    vf = ""
    edge = max(w, h)
    if edge > MAX_EDGE:
        scale = f"scale={MAX_EDGE}:-2" if w >= h else f"scale=-2:{MAX_EDGE}"
        vf = f"-vf {scale}:force_original_aspect_ratio=decrease"
    tmp = path.with_suffix(path.suffix + ".tmp.mp4")
    cmd = [
        "ffmpeg", "-y", "-v", "error", "-i", str(path),
    ]
    if vf:
        cmd += vf.split()
    cmd += [
        "-c:v", "libx264", "-preset", "medium", "-crf", "26",
        "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(tmp),
    ]
    r = run(cmd)
    if r.returncode != 0:
        print(f"  !! 转码失败: {r.stderr.strip()[:200]}")
        tmp.unlink(missing_ok=True)
        return False
    before = path.stat().st_size / 1024 / 1024
    tmp.replace(path)
    after = path.stat().st_size / 1024 / 1024
    print(f"  ✓ {codec.upper()} {w}x{h} → H.264 ({before:.1f}MB → {after:.1f}MB)")
    return True


def main():
    root = Path(os.environ.get("GITHUB_WORKSPACE", "."))
    targets = []
    for folder in ("assets/images", "assets/media", "content"):
        d = root / folder
        if d.is_dir():
            targets.extend(p for p in d.rglob("*") if p.suffix.lower() in VIDEO_EXTS)
    if not targets:
        print("未发现视频文件")
        return
    done = skipped = 0
    for p in sorted(set(targets)):
        info = probe(p)
        if not info:
            print(f"跳过(无法解析): {p.name}")
            continue
        codec, w, h = info
        if codec == "h264":
            skipped += 1
            continue
        print(f"转码: {p.name}")
        if transcode(p, codec, w, h):
            done += 1
    print(f"完成: 转码 {done} 个, H.264 跳过 {skipped} 个")


if __name__ == "__main__":
    main()
