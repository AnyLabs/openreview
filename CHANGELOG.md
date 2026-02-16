# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 待添加的新功能

### Changed
- 待更新的变更

### Fixed
- 待修复的问题

## [0.1.0] - 2026-02-07

### Added
- 初始版本发布
- 三栏布局：左侧栏 (GitLab 群组/项目/MR)、中间 (Diff 视图)、右侧 (AI 审查/设置)
- GitLab 集成
  - 群组列表浏览
  - 项目列表浏览
  - Merge Request 列表浏览
  - MR 代码变更查看
- AI 代码审查
  - OpenAI 兼容 API 支持
  - 智谱 GLM-4 兼容
  - 结构化审查结果
  - 评论严重程度分级
- 代码 Diff 视图
  - @pierre/diffs 集成
  - Unified diff 格式
  - 文件列表导航
- 配置持久化 (localStorage)
- 跨平台支持 (macOS + Windows)
