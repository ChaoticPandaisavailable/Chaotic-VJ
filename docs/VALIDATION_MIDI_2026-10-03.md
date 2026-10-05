# 2026-10-03 演奏版本验证

- `npm run build`：TypeScript 与生产构建通过。保留既有大包体积提示及第三方 PURE 注释提示。
- `npm test`：31 项通过。新增配置迁移、MIDI 消息类型/通道、按下/松开、绝对值接管与重新接管、反向/局部范围、Arturia 三种相对编码与中性 00、XY 范围映射、A/B 按键路由、过渡包络暂停与中断。扩展服务端 round-trip 验证演奏、区间、映射均能同步。
- 本机生产预览：`http://localhost:5174/`，使用 `.runtime/variation-validation`，与主运行数据分离。
- 浏览器：桌面 1440×900、窄屏 390×844。六种新材质逐一查看，保留场景循环、几何 / 星云 50% A/B、B 端粒子场景实际渲染，无浏览器 warn/error；静音演化界面通常显示约 60 FPS。不是现场 HDMI 或双高负载场景长期基准。
- 数字区间验证：暖冷 20–65、浓度 0–50 后，XY 滑条的实际 min/max 与当前值正确约束到 0.2/0.65 和 0/0.5；修正刷新同步覆盖数字输入的问题，输入实时生效。
- Freeze：在按钮确认 active 且滚动停止后，两次相隔 1.3 秒截图，视觉区域平均 RGB 绝对差为 0。早期使用负坐标 clip 的截图不计作冻结证据。
- 连续切换：已执行几何 → 晶面 → 丝带 → 粒子，未观察到清屏。源图存于 `test-results/screenshots/switch-*.png`；可中断过渡保留实际显示纹理。
- MIDI：未连接时学习有提示；权限请求可取消。内置浏览器未完成 MIDI 授权，没有实际 MiniLab 输入，不宣称完成硬件联调。手册编码已核对，但设备热插拔、独占端口和演奏延迟仍需实机。

证据：`midi-ab-final-desktop.png`、`midi-mobile.png`、`prism-final-performance.png`、`freeze-final-a.png` / `freeze-final-b.png`，以及六套材质的 `*-performance.png`。
