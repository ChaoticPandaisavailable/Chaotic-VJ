# 参考与实现记录

研究日期：2026-10-02。下表区分实际页面观察、文档阅读和未完成的观察；本文不代表对所有作品完成视频逐帧分析。

| 来源 | 本轮证据 | 借鉴与落实 |
| --- | --- | --- |
| [Apophenia 2026](https://eccv-art-26.github.io/pieces/apophenia/) / [交互作品](https://apophenia-2026.netlify.app/) | 阅读技术说明；实际打开交互页并观察蓝白云状形态 | 连续歧义形态、局部显影；用流场承载照片纹理，避免照片墙 |
| [Arturia Pigments](https://www.arturia.com/products/software-instruments/pigments/overview) | 阅读官方产品介绍；未声称观看完整演示视频 | 分离基础宏与调制深度；实时显示音频强度和映射 |
| [Hydra 官方文档](https://hydra.ojack.xyz/docs/) | 阅读 modulation / output / feedback 资料；在线编辑器加载未完成可靠观察 | 双缓冲反馈、随时间衰减；背景和照片反馈分离 |
| [Synesthesia audio uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html) | 阅读官方文档 | Level、频段、瞬态、持续时钟和 BPM 分工；不把所有频段映射为同一种闪烁 |
| [The Book of Shaders 12：细胞噪声](https://thebookofshaders.com/12/?lan=ch) | 阅读用户指定的中文章节和页面示例说明 | 网格局部 3×3 邻域搜索，F1 / F2 差形成膜、晶面边缘和裂隙；新增细胞、晶面和断层材质 |
| [噪声](https://thebookofshaders.com/11/?lan=ch) / [FBM](https://thebookofshaders.com/13/?lan=ch) | 阅读章节 | 少量 octave 与 domain warp 形成流动；优化为 3 层噪声，避免多层嵌套 5 层 FBM 的高开销 |
| [Three ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html) / [RenderTarget](https://threejs.org/docs/pages/WebGLRenderTarget.html) | 阅读 API 文档并在本机编译运行 | 全屏 shader、分辨率独立的场缓冲与统一合成 |

本项目 GLSL 为原创实现，没有直接复制书中的完整 demo 或第三方作品源代码。细胞距离、插值、domain warp 等作为通用方法借鉴；颜色、形体节奏、组合逻辑与照片生命周期由本项目设计。

初版偏疏朗云团，用户反馈卡顿、画面不够饱满。第二轮提高覆盖率、放大形体、增加六种材质和独立构图动作，弱化仅靠细节抖动的节奏表现。当前默认与规格最初“不自动缩放”的草案不同：依据用户最新性能要求，启用可关闭的内部精度自适应，并在界面公开实际内部尺寸。

随后用户明确要求保留原始混沌、避免简单形态和硬切片。已恢复独立的原生混沌，新增三维风暴 / 高维场艺术实验，将前六种探索收进折叠区。最新节拍方式为现有亮色大块的平流、局部涟漪位移、惯性构图与色板内变化；撤掉外加的亮色笔迹。详见构图文档。

桌面音频参考 [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) 与 [Chrome 屏幕共享控制](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)。实际授权音轨未在本轮自动代替用户选择。

VDJ 研究参考 [官方选项列表](https://virtualdj.com/manuals/virtualdj/appendix/optionslist.html)、[VDJScript](https://virtualdj.com/manuals/virtualdj/appendix/vdjscriptverbs.html) 和 [OS2L 协议](https://os2l.org/)。实现了可选适配器，真实联调状态见本机报告。

## 2026-10-02：几何参考与 Sytrus XY

重新读取用户原始三角构图、粒子花环及视觉变体图册。几何参考由大面积明暗三角、透明灰面、细线与局部网点构成；重构为独立面片组合，摆脱流体采样对直线的扭曲和残影拖拽。保留共用色板、跨场景过渡与前三版原始形体。

| 来源 | 实际阅读 | 对应实现 |
| --- | --- | --- |
| [Matt DesLauriers / webgl-wireframes](https://github.com/mattdesl/webgl-wireframes) | README、MIT 许可、`lib/wire.frag` 屏幕空间线宽与重心坐标方法 | `facet-composition.ts` 使用重心坐标和屏幕导数画清晰边线；构图、纹理与运动独立编写，没有引入完整第三方项目 |
| [Three.js BufferGeometry](https://threejs.org/manual/pages/custom-buffergeometry.html) | 自定义顶点与属性缓冲说明 | 静态面片属性缓冲，一组网格在 GPU 上演化 |
| [Codrops / Interactive Particles](https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/) | 批量粒子、顶点位移与点形遮罩说明 | 粒子投影密度随分辨率调整；保留曲面与稳定字符标识 |
| [Sytrus 官方手册](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Sytrus.htm) | Modulation X/Y Controller、轴控制与 Smooth 说明 | 紧凑暗色 XY 栅格、十字标记、独立轴调整与原有颜色平滑过渡；没有复制其商标素材 |

## 2026-10-03：全场景衔接、MiniLab 与次级形态

| 来源 | 实际阅读与落实 |
| --- | --- |
| [Codrops / Dual-Scene Fluid X-Ray](https://tympanus.net/codrops/2026/03/23/building-a-dual-scene-fluid-x-ray-reveal-effect-in-three-js/) | 阅读 FBO、双场景与反馈说明。使用独立历史缓冲和可中断的出场纹理过渡，另设 A/B 实时混合；没有照搬其 WebGPU 流体模拟。 |
| [Codrops / UntilLabs living particles](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) | 阅读曲线运动、离屏渲染与 LUT 色彩管线。继续统一灰度形体与最终上色，使不同材质共用同一色彩语言；未获取或复制其图片点云数据。 |
| [MiniLab MkII 官方手册](https://downloads.arturia.com/products/minilab-mkII/manual/MiniLabmkII_Manual_1_0_7_EN.pdf) | 核对 §4.8.4.1 三种相对编码及中间 00 消息。按其真实值域实现解码，保留 MIDI Learn，不写死硬件默认 CC。 |
| [MDN requestMIDIAccess](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess) | 明确用户发起连接、安全上下文、权限拒绝处理，使用 sysex:false。只监听选中的输入端口。 |

六套次级材质独立重写于 `studies.ts`：流体褶皱、薄膜暗腔、矿物晶面、平行丝带、星云旋臂、沉积断层。减少通用噪声混合，复杂度直接作用于各材质自身的空间密度，保留大形体与暗部。前三套 `classic.ts` / `volume.ts` 未修改；粒子与三角叠影延续上轮实现。
