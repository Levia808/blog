---
date: '2026-08-06T16:00:00+08:00'
draft: false
title: '构建现代化个人博客'
description: '从 Hugo 到双线部署的完整实践。一份代码，两边构建。'
tags: [hugo, cloudflare, devops]
ShowToc: true
---

## 概述

本文记录如何从零搭建一个现代化个人博客：静态生成、主题定制、评论系统与双线部署。

## Hugo 静态站点

Hugo 以极快的构建速度著称。全站 22 个页面，冷构建仅需几十毫秒。

```yaml
baseURL: https://blog-go3.pages.dev/
theme: brutalism
markup:
  goldmark:
    renderer:
      unsafe: true
```

## 双线部署策略

部署的本质不是「放在哪里」，而是「如何让内容最快到达读者」。

- **GitHub Pages**：push main 后由 GitHub Actions 自动构建发布
- **Cloudflare Pages**：连接同一仓库，Webhook 触发构建，全球 CDN

两份静态产物，同一份源码，互相容灾。

## 内容工作流

- 文章以 Markdown 存储在仓库中，`hugo new content posts/xxx.md` 新建
- 支持 front matter 配置标签、封面、目录等元信息
- 通过 Sveltia CMS 可视化编辑，GitHub OAuth 认证后直接提交
