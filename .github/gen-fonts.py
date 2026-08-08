#!/usr/bin/env python3
"""构建时生成字体库清单 + 发布 assets 中的字体文件

- 扫描 assets/images 与 static/images 下的字体文件 (.ttf/.otf/.woff/.woff2/.eot)
- assets/images 中的字体复制到 static/images (确保未引用的字体也被发布)
- 生成 static/fonts.json: ["/images/a.ttf", "/images/b.otf", ...]
  编辑器下拉菜单自动读取此清单
"""
import json
import os
import shutil
import sys
from pathlib import Path

FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2", ".eot"}


def main():
    root = Path(os.environ.get("GITHUB_WORKSPACE", "."))
    sources = []
    for folder in ("assets/images", "static/images"):
        d = root / folder
        if d.is_dir():
            sources.extend(p for p in d.rglob("*") if p.suffix.lower() in FONT_EXTS)

    names = {}
    for p in sources:
        names[p.name] = p

    # assets 字体复制到 static/images (发布)
    static_img = root / "static" / "images"
    static_img.mkdir(parents=True, exist_ok=True)
    for name, p in names.items():
        if p.parent.name == "assets" and "assets" in str(p):
            dest = static_img / name
            if not dest.exists() or dest.stat().st_size != p.stat().st_size:
                shutil.copy2(p, dest)
                print(f"发布字体: {name}")

    listing = sorted(f"/images/{name}" for name in names)
    (root / "static" / "fonts.json").write_text(
        json.dumps(listing, ensure_ascii=False, indent=0) + "\n", encoding="utf-8"
    )
    print(f"字体库: {len(listing)} 个 -> static/fonts.json")


if __name__ == "__main__":
    main()
