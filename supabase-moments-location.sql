-- 动态地点功能 (moments.location jsonb)
-- 幂等: 可重复执行
-- 用法: Supabase SQL Editor 执行本文件
-- 字段: location = { "name": "地点名", "lat": 31.23, "lng": 121.47 }
-- 发布动态时前端写入; 卡片渲染展示 name (左下角灰色小字)

ALTER TABLE public.moments
  ADD COLUMN IF NOT EXISTS location jsonb;

-- 可选索引 (按地点过滤/聚合, 数据量大时再开)
-- CREATE INDEX IF NOT EXISTS moments_location_name_idx ON public.moments ((location->>'name'));
