# Hugo 构建/开发环境 — 支持本主题全部特性 (webp 图像处理需 extended)
FROM ghcr.io/gohugoio/hugo:v0.164.0

WORKDIR /src
EXPOSE 1313

# 常用命令:
#   开发服务器:  docker compose up
#   构建静态站:  docker compose run --rm hugo --noTimes --minify
#   新建文章:    docker compose run --rm hugo new posts/my-post.md
CMD ["server", "--bind", "0.0.0.0", "--disableFastRender", "--noTimes"]
