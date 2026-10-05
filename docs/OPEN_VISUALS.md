# 开源 VJ 框架试用 · 2026-10-03

本轮实际接入 Butterchurn，新增 8 个精选 MilkDrop 预设。视觉总数为 19，原有 11 个场景和前三个主视觉的 ID、算法与过渡保持兼容。

## 框架比较

| 项目 | 适合的方向 | 本轮处理 |
| --- | --- | --- |
| [Butterchurn](https://github.com/jberg/butterchurn) | WebGL2 / MilkDrop 音乐可视化、反馈纹理、分形 | 接入 npm 2.6.7；精选预设来自 butterchurn-presets 2.4.7。两个包均为 MIT |
| [Hydra](https://github.com/hydra-synth/hydra-synth) | 视频合成、反馈、振荡器、实时编程 | 已研究；AGPL-3.0，尚未安装或接入 |
| [projectM](https://github.com/projectM-visualizer/projectm) | 原生应用中的 MilkDrop 渲染 | 已研究；核心 LGPL-2.1，本轮浏览器项目未接入原生库 |

## 已接入风格

入口：主视觉下方的「开源视觉 · MilkDrop」。按钮悬停显示原作者 / 预设名；页面「作者与许可」保留包许可证全文。

| ID | 界面名称 | 原始预设 |
| --- | --- | --- |
| 11 | 光速隧道 | martin - tunnel race |
| 12 | 液态银幕 | martin - silversmith |
| 13 | 曼陀罗 | shifter - mandala |
| 14 | 折纸分形 | Flexi - 100% shader fractal [origami edit] |
| 15 | 幻象徽章 | martin - unholy amulet |
| 16 | 水银熔体 | Flexi - mindblob [shiny mix] |
| 17 | 共振扭带 | martin - resonant twister |
| 18 | 朱利亚分形 | Flexi - Julia fractal |

保留精选预设的主体方程；构图漫游叠加小幅反馈旋转、缩放、中心与扭曲偏移，切到新构形时在上游引擎内用 4 秒过渡。最终亮度图接入 CHAOTIC 色板、表面处理、照片合成与形变换场。XY 自定义区间、HEX 色板、旋转、形体尺度、流速、Freeze、Blackout、清空残影均沿用现有入口。原生场的能量 / 扭曲等宏不会直接改写上游预设内部方程。

原生视觉与 MilkDrop、两个 MilkDrop 都可在 A/B 中混合；所有新增场景可通过 MIDI Learn 分配给 MiniLab 的键或打击垫。硬件连接方式见 [MiniLab MkII](MINILAB_MKII.md)。

## 音频与运行

- 首次选择才加载开源引擎和 8 个 JSON；没有加载整个预设库，没有运行时 CDN。新增独立构建块约 255 kB，gzip 58 kB。
- 复用当前播放端的音频分析器，单声道 PCM 重采样到 44.1 kHz，再交给 Butterchurn；没有另外请求麦克风或创建音频播放链。
- 无音乐时输入真实静音。有些风格，尤其水银熔体，会呈现较简单的形态，接入音乐后展开。可用已有「测试节奏」试听。
- A/B 分别持有独立的反馈画布；按画质档限制为 960×540 / 1920×1080 / 2560×1440，实际随内部场尺寸变化；网格分别为 32×24 / 48×36 / 64×48。暂停时不推进开源引擎；清空残影和退出页面时释放画布上下文。
- 独立输出拥有播放权时，应在独立输出页连接音频。远程控制台只接收原有音频特征遥测，没有传输原始 PCM，因此其 MilkDrop 预览不保证与输出逐帧一致。本轮没有加入 PCM 广播。

## 初次接入验证（后续画质改动见 [画质记录](QUALITY.md)）

- TypeScript 与生产构建通过；34 项测试通过，包括真实 HTTP 配置读写、旧场景编号兼容、最高新场景 ID、MIDI A/B 路由和 PCM 48 kHz 重采样 / 静音 / 异常值。
- 在应用内浏览器逐个检查最终 8 个预设的静音和测试音乐画面，未捕获 shader / WebGL 错误。筛掉了过暗、过曝或空白的候选预设。
- 1440 × 900 测试视口，预览画布约 1108 × 623：单路、双 MilkDrop 50% 混合、原生粒子 + MilkDrop 混合均观察到约 60 FPS。该数值不代表 4K HDMI 或 VDJ 同时运行的性能。
- 检查前三个场景与开源场景间快速切换、清空残影后重建、Freeze / 恢复。双路冻结间隔 1.2 秒的截图画面区域平均 RGB 差约 0.004 / 255，视觉保持静止。
- 390 × 844 窄屏检查：新增按钮可用，无水平溢出。修复 Three 纹理在画布尺寸变化后必须重新分配存储的问题，复测宽屏 → 窄屏 → 默认尺寸无黑块。截图在 `test-results/screenshots/milkdrop-*.png`。
- 未连接真实 MiniLab 硬件；未测试现场 HDMI / VDJ 并行及长时间连续演出。

许可：[公开署名与 MIT 全文](../apps/performer/public/open-visual-credits.txt)。
