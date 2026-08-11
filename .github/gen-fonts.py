#!/usr/bin/env python3
"""构建时生成字体库清单 + 发布 assets 中的字体文件

- 扫描 assets/images 与 static/images 下的字体文件 (.ttf/.otf/.woff/.woff2/.eot)
- assets/images 中的字体复制到 static/images (确保未引用的字体也被发布)
- 生成 static/fonts.json: ["/images/a.ttf", "/images/b.otf", ...]
  编辑器下拉菜单自动读取此清单
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2", ".eot"}
FORMAT_MAP = {
    ".ttf": "truetype",
    ".otf": "opentype",
    ".woff": "woff",
    ".woff2": "woff2",
    ".eot": "embedded-opentype",
}


def font_slug(name: str) -> str:
    """文件名 → 唯一 CSS 字体名 (小写规范化, 与模板推导规则一致)"""
    base = Path(name).stem
    return re.sub(r"[^\w\u4e00-\u9fa5-]", "-", base).lower()


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

    # 静态标题字体 CSS: 每字体唯一名 (f-文件名), head 全局引用, 运行时零演算
    # 解决多文章同名 @font-face 互相覆盖导致部分标题字体失效
    css_lines = []
    for name in sorted(names):
        ext = Path(name).suffix.lower()
        slug = font_slug(name)
        fmt = FORMAT_MAP.get(ext, "truetype")
        css_lines.append(
            "@font-face {{ font-family: 'f-{0}'; src: url('/images/{1}') format('{2}'); font-display: swap; }}".format(
                slug, name, fmt
            )
        )
    fonts_dir = root / "static" / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    (fonts_dir / "title-fonts.css").write_text(
        "\n".join(css_lines) + "\n", encoding="utf-8"
    )
    print(f"标题字体 CSS: static/fonts/title-fonts.css ({len(css_lines)} 个 @font-face)")


if __name__ == "__main__":
    main()
