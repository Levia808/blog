---
date: '2025-04-10T09:30:00+08:00'
draft: false
title: 'Container Queries 指南'
description: '组件级响应式设计：让组件根据自身容器宽度自适应，而不是页面视口。'
tags: [css, 前端]
ShowToc: true
---

## 从 Media Queries 到 Container Queries

Media Queries 基于视口尺寸，这要求组件在不同页面中表现一致——但实际布局千变万化。

Container Queries 让组件根据**自身容器**的宽度响应，真正实现组件级自适应。

```css
.card-wrap {
  container-type: inline-size;
}

@container (min-width: 360px) {
  .card {
    display: grid;
    grid-template-columns: 1fr 2fr;
  }
}
```

## 关键特性

- `container-type` 定义查询上下文
- `@container` 按容器尺寸应用样式
- 支持 `cqw` / `cqi` 等容器单位

## 实践建议

- 组件设计之初就考虑容器语义
- 与 CSS Grid `auto-fit` 配合，减少嵌套查询
- 兜底方案：无支持时保持基础单列布局
