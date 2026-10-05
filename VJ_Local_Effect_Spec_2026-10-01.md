# 本地生成式 VJ 效果实现技术方案

版本 2026 年 10 月 1 日

用途：交给本人电脑上的 Codex，作为本地 VJ 项目的视觉和技术实现规格。本文是设计文档，尚未包含可运行的 VJ 程序。

## 1 我的目标和当前决定

我要在自己的联想拯救者电脑上运行实时生成式 VJ。电脑有 GPU，演出软件预计使用 VirtualDJ，下面简称 VDJ。演出时主屏要保留 VDJ 的波形、拍点和操作界面，让我能正常对拍；VJ 持续运行，未来通过 HDMI 把纯视觉送到投影或外接屏。

默认输入就是这台电脑的桌面音频。音乐扰动一个持续存在的混沌视觉场，观众上传的照片短暂融入其中，变成纹理、轮廓、碎片和残影，作用约 15 秒后淡出。画面应有云状、流动、折叠、撕裂和模糊识别的感觉，所有内容属于同一个视觉世界。

**效果和审美优先。** 先实现有感觉的视觉与音乐关系，再优化演出稳定性。色调由我自行选择，图片必须排队，我能删除对应图片。当前先把图形、音频映射、照片时序和队列技术讲清楚；应用运行形式、桌面外壳和安装打包暂不定。

### 已确认需求

| 项目 | 本版规定 |
| --- | --- |
| 运行环境 | 本人联想拯救者电脑，本地运行，使用 GPU |
| 演出软件 | 预计使用 VDJ |
| 音乐输入 | 默认桌面音频，不默认改成麦克风或外部声卡输入 |
| 当前技术重点 | shader 效果、音乐映射、照片融合、时间包络、队列与删除 |
| 视觉语言 | 持续混沌场、云状结构、折叠、碎片、反馈残影、局部显影 |
| 色调 | 所有颜色可自行选择并保存，可以锁定基础色板 |
| 单张照片 | 默认参与约 15 秒，然后 3 秒 fade out |
| 多张照片 | FIFO 排队，默认同时只有一张参与画面 |
| 图片管理 | 可查看、删除排队中、显示中和已结束的对应图片 |
| 主屏与投影 | 主屏保留 VDJ；研究 HDMI 扩展屏上的独立 VJ 输出 |
| VDJ 同步 | 研究当前 BPM、拍点、拍子位置等能否传给 VJ；不行就保留音频驱动 |
| 实现形式 | 暂不选择桌面外壳；先实现可独立运行的视觉内核 |
| 性能目标 | 先按 1080p、60 FPS 设计，实际能力以本机测试为准 |

本文中的时间、宏参数和队列上限是可修改的默认值。操作系统暂按 Windows 场景讨论，具体 Windows、GPU 和 VDJ 版本由本地 Codex 实施时确认。这里没有访问本人电脑，也没有验证本人 VDJ。

## 2 视觉参考和要实现的效果

Codex 写 shader 前，应先看这些参考的运动过程，再把借鉴点落实到自己的实现。每个参考都要记录“观察到什么、用什么技术表达、我如何调节”，不能只把网页链接放进 README。

| 参考 | 观看位置 | 要借鉴的效果 | 在本项目中的实现 |
| --- | --- | --- | --- |
| Apophenia 2026  Zoi Roupakia | [交互作品](https://apophenia-2026.netlify.app/) 和 [技术说明](https://eccv-art-26.github.io/pieces/apophenia/) | 持续变化的云状场，形状似乎即将被辨认，又重新消散；局部关注与机器观看的感觉 | 多层 FBM、domain warping、轮廓阈值、照片局部显影 |
| Arturia Pigments | [官方介绍与演示](https://www.arturia.com/products/software-instruments/pigments/overview) | 可读的调制关系；不同声音特征对应不同变化 | 将低频、瞬态、亮度分开映射，控制面板能看到参数的调制 |
| Hydra  Olivia Jack | [在线编辑器](https://hydra.ojack.xyz/) 和 [官方文档](https://hydra.ojack.xyz/docs/) | 反馈、拖影、图像漂移、扭曲和电子纹理 | 两个 render targets 交替读写，反馈采样、局部位移与衰减 |
| Synesthesia | [官网演示](https://synesthesia.live/) 和 [音频 uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html) | 能量、瞬态、持续运动和节拍分别控制画面 | 自己实现 Level、Hits、连续时钟和 Beat 的分工 |
| The Book of Shaders | [FBM 与 Domain Warping](https://thebookofshaders.com/13/) 和 [Cellular Noise](https://thebookofshaders.com/12/) | 分形云层、嵌套噪声扭曲、细胞边界 | GLSL 噪声、空间扭曲和碎片 mask |

Apophenia 官方说明包含实时生成的云状场、domain-warped fractal noise 和本地机器视觉分析。本项目借鉴它的视觉组织，音乐驱动与照片碎片是我们自己的扩展；第一版不用先复制它的 CLIP 推理流程。[R01]

Pigments 是声音合成器，这里借鉴调制可读性和动态表现。Hydra 与 Synesthesia 分别帮助理解反馈和音乐映射。这些是效果与实现参考，不要求我先学习这些软件。[R02–R05]

### 画面如何运动

安静时，大形态缓慢漂移，保留暗部、轮廓和空间。音乐变厚时，场被挤压、折叠、拉扯，密度逐步增加。突然的声音变化造成局部裂口，随后被流动重新吞没。高频增加细碎纹理与边缘活动，不能直接让全屏变成随机雪花。

照片出现时，先有不同的纹理或局部轮廓，再出现少量碎片。人脸的一部分、建筑边缘或衣服纹理可以短暂辨认。照片服从同一套流场和材质，不出现漂浮在背景上的矩形相册。照片退出后，混沌场继续存在。

首轮做同一内核的三个调参版本：稀薄云层、密集折叠、强碎裂。用同一段音乐各录制约 30 秒供我比较。三个版本能连续插值，不是三套独立场景。

### 效果验收重点

- 静音时仍能持续演化；打开音乐后，结构、细节和运动有可感知的改变。
- 低频影响大结构，瞬态影响局部裂口，高频影响细节；关闭某一路映射能看出区别。
- 大部分时间保留暗部与留白，反馈不会很快积成一片白。
- 色板能真实改变画面，颜色不是写死的。
- 照片短暂可辨认，但没有完整矩形边框。
- 画面不能只靠频谱条、同心圆、每拍统一缩放或全屏闪白表达音乐。

## 3 视觉内核和数据流

先采用 TypeScript、Vite、Three.js、WebGL2、GLSL 和 Web Audio API。图片处理使用本地 Node.js 服务与 Sharp，事件使用 WebSocket。先完成可在本地浏览器验证的图形内核，部署形式与桌面包装留到需要时再决定。

核心模块不应依赖某一种窗口外壳。DesktopAudioSource 提供桌面音频，AudioFeatureEngine 提供特征，VisualEngine 只消费统一数据。以后更换音频捕获入口或运行容器时，不重写 shader。

~~~mermaid
flowchart TD
    VDJ["VDJ 桌面音频"] --> SOURCE["DesktopAudioSource"]
    SOURCE --> FEATURE["音频特征与平滑"]
    VDJ -. "可选节拍数据" .-> SYNC["VDJ 数据桥接"]
    FEATURE --> MAP["视觉调制与缓慢演化"]
    SYNC --> MAP
    UPLOAD["观众照片"] --> QUEUE["处理与 FIFO 队列"]
    QUEUE --> PHOTO["照片纹理与时间包络"]
    MAP --> GPU["GPU 视觉引擎"]
    PHOTO --> GPU
    GPU --> OUTPUT["纯视觉输出"]
    CONTROL["控制面板"] --> MAP
    CONTROL --> QUEUE
~~~

VDJ 自己播放音乐。VJ 分析的是桌面音频旁路，不再次发出捕获到的音乐。桌面捕获 API 如果附带视频流，那个流不能成为投影内容；投影始终来自生成式 renderer。

界面职责先分成纯输出、控制面板和上传页面。第一轮可以先用一个本地页面验证视觉，随后再拆出独立输出窗口；两屏窗口管理并不是 shader 开发的前置任务。

## 4 ChaosField 混沌场的实现

以全屏三角形或 quad 渲染 ShaderMaterial 或 RawShaderMaterial。UV 先做宽高比校正，确保不同外接屏比例不会意外把形态拉长。[R07]

建议起始实现：

1. 用 4 到 6 层 FBM 形成大尺度云状结构。
2. 用两层嵌套 domain warping 扭曲采样空间。
3. 用慢速流场位移和旋转产生卷曲、挤压、折叠。
4. 用 ridge 或局部梯度形成边缘，再用阈值控制浮现与消散。
5. 用高频噪声提供小尺度纹理，颗粒强度单独控制。
6. 加入低强度色差与统一调色，强度必须可关闭。

结构草案如下，属于本项目的实现建议，不是参考作品的源码：

~~~glsl
// 结构示意，不是完整可编译 shader。
q = vec2(fbm(p + offsetA), fbm(p + offsetB));
r = vec2(fbm(p + warpA * q + flowA),
         fbm(p + warpA * q + flowB));
field = fbm(p + warpB * r + localImpulse);
ridge = edgeFromField(field);
~~~

FBM、domain warping 和 cellular noise 的原理可从 R06 学习。不要把“噪声纹理平移”当成最终效果。如果太像屏保，先改尺度分布、内部卷曲、阈值、撕裂位置和运动语言，而不只是换色或增加 bloom。

时间推进要累计平滑后的运动速度，不能用“绝对时间乘以当前音量”。后者会在音量变化时把整个场跳到另一个位置。每个预设保存 seed，便于比较修改前后的结果。

低频主要作用于大尺度的采样坐标；spectral flux 提高局部扭曲；高频作用于细纹理；整体能量改变运动速度和密度。给各路设置深度和范围，不直接把原始 FFT 丢进 shader。

## 5 Signal 与 Feedback 的实现

### 5 1 音乐改变局部结构

Signal 与混沌场共用流场、边缘和色板。先实现局部边缘断裂、细颗粒聚集和短暂扫描纹理。低频瞬态沿部分轮廓挤压，中高频瞬态短暂切开结构，高频能量让边缘更细更碎。

瞬态触发后，用约 120 到 300 毫秒的包络恢复。变化位置来自缓慢移动的场与稳定 seed，不让整个画面每拍执行同一动作。节拍时钟用于连续呼吸和结构周期，音频 onset 用于实际声音变化，两者独立。

### 5 2 背景反馈

使用两个 render targets 交替读写。前一帧做轻度位移、扭曲、旋转或缩放，与当前生成的场混合。按实际 deltaSeconds 计算衰减，避免帧率变化导致记忆时长变化。[R07]

可用半衰期表达衰减：

~~~text
decay = 2 ^ (-deltaSeconds / halfLifeSeconds)
~~~

新画面注入量、历史衰减、暗部保留和亮度限制需要一起调。反馈不能只有一个接近 1 的混合比例。提供 Memory 宏和 Clear Background Memory，让我能改变拖影和清空历史。

**照片不写入长期背景反馈。** 它有自己的反馈缓冲和最终包络。否则原图淡出后，人物轮廓仍会长时间留在背景，违背照片约 15 秒后退出的要求。

### 5 3 合成与缓慢演化

组合顺序是：生成混沌场和 Signal，更新背景反馈，生成本张照片的独立贡献，按照片包络合成，再统一调色、颗粒、轻度 bloom 和输出。

自动变化先用缓慢的参数曲线与低频随机过程，保证我专心 DJ 时画面仍能演化。Morph 在云层、细胞边缘和碎裂结构之间插值。复杂的整场叙事导演留到效果方向确定后。

## 6 照片如何融入画面

每张图片进入 GPU 后是一张 texture。shader 从不同 UV 区域取样，用 mask 和流场形成碎片，不需要服务端生成几十个裁剪文件。

第一版实现三种可混合贡献：

- **纹理**：用当前流场扭曲照片，只让噪声 mask 选中的部分可见。
- **轮廓**：用 Sobel 或类似小卷积提取边缘，再拉扯、打断和局部显影。
- **碎片**：使用扫描切片、三角形 mask 或 Voronoi 单元分割 UV，产生位移、微小旋转和漂移。

照片的清晰度、opacity、覆盖面积、碎片数量、warp 强度和边缘阈值都可调。初始可以试 8 到 24 个可见碎片、约 10% 到 35% 局部覆盖面积，再用人像、建筑和纹理图片调整。这些是调试起点，不是固定限制。

照片与背景共用视觉语言，完整矩形边界应被 mask 消掉。允许局部短暂被认出，但不默认整张清晰展示。人物与建筑只是素材，效果不能依赖某种特定内容。

照片短反馈的关系：

~~~text
photoHistory = 本张照片的碎片和轮廓反馈
visiblePhoto = photoEnvelope(age) * processedPhotoHistory
finalFrame = combine(backgroundHistory, signal, visiblePhoto)
~~~

photoEnvelope 必须作用在照片最终输出。到期归零后销毁本张 texture 和独立历史。任何照片颜色贡献也服从同一个包络，不允许颜色或可识别残影无限保留。

## 7 色调由我自行选择

提供 Palette 面板：3 到 5 个可编辑颜色槽、背景色、亮度、对比度、饱和度、过渡时间，以及保存和加载 JSON 预设。支持 HEX 输入与选色器。

可提供黑白、暗红暖白、深蓝米白等初始色板用于比较。我可以改掉全部颜色，shader 不能把某个色系写死。Color Drift 在当前色板内缓慢变化，不自动生成彩虹。

照片色彩分两种策略：

- **锁定色板**：默认开启。照片提供亮度、边缘、纹理，最终颜色来自我的色板。
- **允许照片带色**：我主动开启，设置 0 到 1 的混入比例。照片颜色随照片一起淡入和淡出，结束后回到基础色板。

基础色板与照片色彩贡献分开保存。删除图片不能改掉基础色板。色板切换默认过渡约 2 秒，可调或立即切换。

## 8 照片时间 队列与删除

### 8 1 默认生命周期

按“作用约 15 秒，然后 fade out”理解：

| 从本张照片开始呈现计时 | 状态 | 行为 |
| --- | --- | --- |
| 0 到 2 秒 | Fade in | 纹理、轮廓和碎片逐渐浮现 |
| 2 到 15 秒 | Active | 随音乐漂移、扭曲和局部显影 |
| 15 到 18 秒 | Fade out | 照片、残影与颜色贡献一起消失 |
| 18 秒以后 | Done | 退出渲染，不自动重新播放 |

默认约第 15 秒开始淡出，完整生命周期约 18 秒。若我希望“含淡出总共 15 秒”，将 activeForSeconds 改成 12，fadeOutSeconds 保持 3。所有时间可配置，不因 BPM 改变而延长。

只有图片处理完成、texture 可用、输出端确认开始呈现后才计时。上传、审核和排队不消耗显示时间。Freeze 和 Blackout 默认暂停照片时钟及队列推进，恢复后继续剩余时间。

~~~text
inEnvelope = smoothstep(0, fadeInSeconds, age)
outEnvelope = 1 - smoothstep(activeForSeconds,
                            activeForSeconds + fadeOutSeconds, age)
opacity = inEnvelope * outEnvelope * PhotoPresence
~~~

照片纹理、边缘、碎片、独立反馈和带入的颜色全部使用这个包络。只把原图 alpha 降低，不能算完成 fade out。

### 8 2 FIFO 队列

默认一张接一张，当前照片完成淡出后下一张淡入。背景持续存在，两张图片之间不用黑屏。第一版不默认叠加多张，也不让新上传的图立即抢占当前图。

通过上传验证后分配唯一 ID 与接收序号。压缩的异步完成顺序不能改变接收顺序。队首处理失败时标记 Failed 并跳过，处理超时不能永久堵住队列。

后端保存队列顺序与状态；输出端报告纹理就绪、实际开始与实际结束。控制页重连时读取完整快照。只能有一个实际播放调度者，不能每个页面各自开一个计时器。

管理列表显示缩略图、状态、顺序、当前剩余时间、队列长度和预计等待。状态至少包括 Processing、Queued、Active、Fading、Done、Deleted、Failed。

默认队列上限建议 100 张，可由我调整。满时明确提示暂时无法接收，不覆盖旧图。每张约 18 秒，约每分钟播放 3.3 张；空队列同时接收 20 张，且处理及时、没有暂停时，第 20 张大约等待 5 分 42 秒才开始。排队提示必须反映实际等待，不能告诉所有人马上出现。

暂停时 ETA 显示已暂停，不继续倒数。第一版不用先做投票、插队或复杂轮转。

### 8 3 删除对应图片

排队中的图片立即移除，更新后续顺序与等待时间。正在显示的图片在下一次绘制停止贡献，清空它的反馈、颜色贡献和 GPU 资源，背景继续运动。主动删除优先于正常淡出，不额外保留 3 秒。

已结束的图片从管理列表和本地素材移除。Done 只表示播放结束，不加入循环播放。

删除先设置 Deleted 与取消标记，再清理文件和 texture。压缩、预加载、纹理解码和消息可能仍在进行；这些操作结束时都要检查取消标记，不能让图片重新进入队列。重连快照也不能恢复已删除图片。

清理覆盖原始暂存、处理后图片、缩略图、可选边缘图和本张反馈缓冲。可保留最小 ID 与 Deleted 标记来处理迟到事件，但不保留可再次渲染的副本。

只有本人管理界面能删除。观众上传页面没有删除他人图片的能力。

### 8 4 图片处理与资源

本地 Node.js 服务使用 Sharp 解码、自动处理方向、缩放、转 WebP 并移除不需要的元数据。默认长边不超过 1536 像素，缩略图约 256 像素，均可调。[R16]

提取低分辨率亮度、色板和宽高比。边缘先在 GPU 实时算，需要时再生成离线版本。MVP 支持 JPEG、PNG、WebP；HEIC 等手机格式检测实际支持并给明确提示。

GPU 默认只保留当前图片与后面 2 张预加载图片，不把全部队列上传显存。播放结束的图片可以保留在本地管理列表，但释放 GPU 资源，不自动再出现。

## 9 默认桌面音频的技术入口

产品输入已确定为桌面音频。用 DesktopAudioSource 封装捕获，把 MediaStream 或 PCM 交给特征引擎，视觉模块无需关心捕获细节。

浏览器原型可先研究 getDisplayMedia 的系统音频模式：开发页面在 localhost 运行，由我点击开始按钮，选择包含桌面声音的来源并授权。它需要视频 track，音频能否返回与浏览器、系统和选择的来源有关；systemAudio 为 include 是提示，不是成功保证。重新开始捕获需要再次授权。[R08]

实现时要检查返回流确实包含 audio track，确认读到正在播放的桌面音乐。不把 getUserMedia 的麦克风输入冒充桌面音频，也不把浏览器某个标签页的声音误当整个桌面的 VDJ。

附带的视频不显示、不录制、不上传。停止视频 track 是否影响音频需要验证。捕获信号只分析，不重新发音。

第一轮不因为设备路由研究而推迟 shader。先按桌面音频提供给 AudioFeatureEngine 的接口开发；如果本机原型暂时没有抓到，使用本地音乐文件验证同一条特征与视觉链路，捕获问题单独记录。

确实遇到捕获限制时，再查 Windows loopback、VDJ 实际输出端点与驱动。Microsoft 的 WASAPI 与 application loopback 文档列为后续实现参考。[R09–R10] 当前不选定桌面外壳，不预先改动 VDJ 音频配置。

本地调试时确认分析的是我希望跟随的桌面演出声音，能区分 VDJ Master 与耳机预听的影响。它属于后续本机验证，不改变默认输入决定。

## 10 音乐特征和效果映射

初始可采用 FFT 2048、hop 512，按实际采样率计算频带。建议起点：20 到 180 Hz 为低频，180 到 2000 Hz 为中频，2000 到 14000 Hz 为高频；上限不能超过 Nyquist。

RMS、频带能量、spectral centroid、正向 spectral flux 和 onset 都先经过静音门限、自适应归一化及 attack/release smoothing，再映射到参数。静音不能被归一化成最大能量。

“低频瞬态”不是精确的 kick 分类，“中高频瞬态”也不等于准确识别 snare。第一版用这些变化制造效果，不先解决复杂鼓声识别。

| 特征 | 初始时间尺度 | 作用 |
| --- | --- | --- |
| RMS 或整体能量 | 快速约 0.1 秒，趋势约 1 到 5 秒 | 运动速度、密度、新画面注入量 |
| Bass | attack 约 30 ms，release 约 250 ms；另保留慢速值 | 大尺度挤压、卷曲与局部脉冲 |
| Mid | 约 0.1 到 0.5 秒平滑 | 中尺度纹理和轮廓厚度 |
| High | 约 50 到 300 ms 平滑 | 细颗粒、边缘噪声和短切片 |
| Spectral centroid | 约 0.3 到 1.5 秒平滑 | 细节与小范围亮度变化 |
| Spectral flux | 短 attack，约 0.5 秒回落 | 局部 turbulence 和失稳 |
| Onset | 一次事件与约 120 到 300 ms 包络 | 局部裂口与短促结构变化 |
| Beat phase 与 BPM | 连续节拍及 4 拍、16 拍周期 | 呼吸、结构周期和有节奏的漂移 |

持续运动、短促瞬态和慢速趋势分开计算，可参考 Synesthesia 的 Level、Hits、Time 与 BPM 分工。[R05] 运动使用平滑累计时钟，参数要限幅，瞬态要有恢复过程。

开发中提供 AudioDebugPanel，显示输入来源、音量、特征历史、BPM 来源和同步状态。调试信息不属于投影画面。

## 11 需要 Codex 研究的问题

### 11 1 VDJ 保持前台时如何只投影 VJ

目标：我在电脑主屏正常看 VDJ、对拍和操作，VJ 不占主屏，不抢键盘焦点，投影端持续显示生成画面。

**一根 HDMI 配合 Windows 扩展桌面可实现这种分工。** 官方 Extend 模式允许不同窗口放在不同显示器。通常内屏显示 VDJ，HDMI 外接屏放 VJ 的独立输出窗口。[R17]

这里的后台是“VJ 不占操作焦点”，输出窗口仍在第二块屏幕实际显示；不能只最小化一个窗口，再假定投影继续收到它的内容。

后续让 Codex 验证：

1. Windows 识别内屏与 HDMI 外接屏，选择扩展模式，内屏设为主屏。
2. 将纯 VJ 输出放到外接屏，进入合适的全屏或无边框显示。
3. 回到 VDJ 保持焦点，观察 VJ 是否因后台节流而停帧。
4. 收起控制面板后，音频分析、队列和输出是否继续。
5. Blackout、Freeze、调色和删除能否通过独立控制页、手机管理页或不冲突的快捷键执行。
6. 核对不同 DPI、分辨率和插拔 HDMI 的行为，以及音频输出是否发生变化。

先用浏览器输出窗口研究实际行为。只有在浏览器不能满足持续输出或操作需求时，再评估运行容器；当前不把某种桌面外壳写成已定技术路线。

### 11 2 VDJ 能否传出它已经识别的数据

这是增强节奏效果的可选研究，不阻塞音乐驱动视觉。当前没有访问本人 VDJ；先核对本机 build、授权和选项，再做真实读取实验。

**优先研究 OSC。** VDJ 官方 Options 文档列出 oscPort、oscPortBack 与查询订阅示例，并注明 OSC 需要 VDJ PRO 授权。[R11]

官方给出的地址形式包括：

~~~text
/vdj/query/deck/1/get_bpm
/vdj/subscribe/deck/1/get_bpm
~~~

浏览器不能直接处理普通 UDP OSC 时，用一个本地 Node.js 桥接转成 WebSocket。它只是数据模块，不是桌面外壳。

| 想得到的内容 | 官方可研究的查询 | 本机验证重点 |
| --- | --- | --- |
| 当前播放速度 | get_bpm | pitch 改变后是否更新 |
| 原始 BPM | get_bpm absolute | 与当前速度区分 |
| 当前拍点坐标 | get_beatpos | 含小数的 beatgrid 坐标及更新频率 |
| 小节中的拍子 | get_beat_num | 官方有 1 到 4 的拍子位置，需验证网格 |
| 歌曲时间或位置 | get_time 与 get_position | 单位、暂停和变速的影响 |
| 变速量 | get_pitch 与 get_pitch_value | 实测单位与数值范围 |
| 同步主 deck | get_activedeck | 官方指 sync master，不一定是最响的 deck |
| Deck 音量权重 | get_volume | 混音时辅助选择节拍主来源 |

这些查询的含义见官方 VDJScript 列表。[R12] 除 get_bpm 的官方订阅示例外，其余字段还要逐项验证返回类型、订阅支持和频率，不能把“查询存在”当成“本机已实时收到”。

有 get_beatpos 时，小数部分可构造连续 beatPhase；消息之间按 BPM 插值。loop、跳转和 scratch 时重新锚定，不用歌曲时间乘 BPM 代替真实 beatgrid。当前 BPM 与原始 BPM 必须分开。

**其次研究 OS2L。** VDJ 官方列有 OS2L、direct IP 和 beat offset 设置。OS2L 协议使用 TCP，可在本机回环地址通信，beat 消息含 BPM 和拍序号。[R11、R13]

协议示例：

~~~json
{
  "evt": "beat",
  "change": false,
  "pos": 42,
  "bpm": 120.0
}
~~~

OS2L 主要用于节拍同步，不自动提供全部 deck 状态。用逐拍消息与 BPM 推进连续相位，提供可调 offset 来校准画面与声音。授权和本机支持仍需验证。

**插件 SDK 放在后面。** 官方 SDK 提供插件接口和示例；另有作者维护的 vdj-websocket 项目可阅读实现思路。[R14–R15] 内置方法不满足且确有必要时再研究插件，不先把插件开发放到主要进度上。

桥接输出统一 DJState：source、connected、receivedAt、deckId、currentBpm、originalBpm、beatPosition、beatPhase、beatInBar，以及已验证可得的其他字段。未知字段用 null，不用假值伪装成功。

两首歌混音时保留各 deck 数据，再选择用户指定或已验证的同步主来源；不要两套拍点同时驱动同一个脉冲。音频能量继续使用桌面音频。

数据断开或不可用时，继续 Audio onset、内部时钟和 Tap Tempo，面板显示真实来源。用户的要求是“能同步更好，不能就算了”，所以接口研究不能拖住视觉效果。

研究报告写清实际方法、读到的字段、单位、更新频率、延迟、跳转和变速表现，以及没有成功的能力。数据库里的歌曲 BPM 不等于播放时实时速度。

## 12 控制面板和本地上传

先保留八个宏：Energy、Chaos、Density、Memory、Fragmentation、Photo Presence、Motion、Morph。宏的基础值和音频调制深度分开，可关闭某一路调制。

Palette 独立成面板。操作包括 Freeze、Blackout、Tap Tempo、暂停照片队列、Clear Background Memory、保存和加载预设。图片列表有缩略图与删除按钮。

Blackout 只使视觉输出变黑，不停止 VDJ 音乐。Freeze 暂停视觉模拟与照片时钟，不停止 VDJ。实现时根据运行形式研究快捷键，不能默认拦截 VDJ 的单键 B 或 F。

观众上传先使用局域网：手机与电脑接入能互通的同一个 Wi-Fi 或热点，二维码指向电脑实际 LAN 地址。页面只做选图、上传结果和排队提示，不做社交照片墙。

管理页面有独立认证，观众会话 token 不等于管理员凭据。图片检查和压缩在后台异步进行，不阻塞渲染线程。上传页提示照片会以抽象形式参与画面。

本地模式不保证不同 Wi-Fi 或公网手机直接访问；公网入口留到后续。现场内容审核先保留可切换的待处理区，不让复杂审核平台阻塞效果原型。

## 13 模块配置与开发顺序

模块至少分成：

~~~text
vj-local/
  apps/
    performer/       视觉输出与控制界面
    upload-server/   本地上传 图片处理 队列与事件
  packages/
    audio-engine/    桌面音频接口 特征 onset 和平滑
    visual-engine/   Chaos Signal Feedback Photo 调色
    dj-bridge/       可选 OSC OS2L 与统一 DJState
    shared/          参数 状态与事件类型
  presets/           JSON 色板与宏参数
  docs/              参考记录和本机研究结果
  README.md
~~~

这个结构用于保持图形、输入和图片调度分离，不要求第一天就做完整 monorepo。TypeScript strict，视觉参数集中定义并能保存；用户照片不写入源码仓库。

默认配置草案：

~~~json
{
  "schemaVersion": 1,
  "renderer": {
    "width": 1920,
    "height": 1080,
    "targetFps": 60,
    "renderScale": 1.0,
    "automaticQualityScaling": false,
    "seed": 1337
  },
  "audio": {
    "preferredSource": "desktop-audio",
    "fftSize": 2048,
    "hopSize": 512
  },
  "palette": {
    "colors": ["#08090C", "#343943", "#ACA89F", "#F1EBDD"],
    "background": "#08090C",
    "locked": true,
    "photoColorMix": 0.0,
    "transitionSeconds": 2.0
  },
  "photos": {
    "activeForSeconds": 15,
    "fadeInSeconds": 2,
    "fadeOutSeconds": 3,
    "maxActive": 1,
    "preloadCount": 2,
    "maxQueued": 100,
    "queueOrder": "fifo",
    "replayFinished": false,
    "pauseOnFreeze": true,
    "pauseOnBlackout": true,
    "deleteActiveImmediately": true
  },
  "macros": {
    "energy": 0.55,
    "chaos": 0.65,
    "density": 0.45,
    "memory": 0.65,
    "fragmentation": 0.55,
    "photoPresence": 0.45,
    "motion": 0.5,
    "morph": 0.35
  },
  "djSync": {
    "enabled": false,
    "preferredSource": "osc",
    "offsetMs": 0
  }
}
~~~

自动降画质默认关闭，让我先看完整效果。后续在 VDJ 同时运行时测帧率与资源占用，再决定质量档和自动策略。不保证未知 GPU 必然达到目标。

### 建议开发顺序

1. **视觉内核**：ChaosField、Feedback、Signal、可编辑色板、宏控制和本地预览。
2. **音乐驱动**：默认桌面音频，特征平滑、不同映射、AudioDebugPanel，保留本地文件测试。
3. **照片效果**：先本机选图，完成纹理、轮廓、碎片、时间包络和彻底删除。
4. **上传队列**：局域网上传、异步处理、FIFO、缩略图管理与取消竞态。
5. **演出增强**：研究 VDJ 同步、主屏前台与 HDMI 独立输出。
6. **性能与形式**：确定效果后，优化 VDJ 同时运行时的占用，再决定包装、长测和恢复方案。

VDJ 同步和 HDMI 可提前做短探测，但不是前面视觉迭代的门槛。第一轮不要求先开发上传系统或桌面安装程序。

实际实现交付时提供能执行的本地安装、运行与构建命令，且与 package.json 一致。桌面音频的开始方式、调色、保存预设和测试文件的使用都要写进 README。不要把这份设计文档当成软件已经完成。

## 14 验收与本地 Codex 开工指令

先验收效果，再验收基本操作，长时间演出稳定性放在后面。以下是未来实现后应进行的检查，本次没有完成这些本机测试。

| 验收项 | 通过条件 |
| --- | --- |
| 视觉语言 | 云状混沌、折叠、碎裂、反馈有对应效果，三个预设保持同一世界 |
| 音乐关系 | Bass、onset、high 产生不同变化，连续运动和参数平滑 |
| 自选颜色 | 所有颜色可编辑保存，锁色时图片不改变基础色板 |
| 照片融合 | 局部纹理、轮廓与碎片属于流场，没有照片墙的矩形展示 |
| 照片时间 | 就绪后开始计时，约第 15 秒淡出，约第 18 秒退出 |
| 残影清除 | 到期和删除后没有可识别照片残留，对应缓冲清空 |
| 排队 | 20 张测试图按接收顺序播放，没有抢占或全部堆在 GPU |
| 删除 | 处理中、预加载、排队中和当前图片都能删除，迟到任务不恢复它 |
| 后台投影研究 | VDJ 前台时第二屏持续渲染；记录实际可行形式 |
| VDJ 数据研究 | 有真实读取结果与字段定义，或明确不可用并继续音频驱动 |

队列时间、删除竞态和数据适配可做必要的自动化测试。视觉好坏需要真实预览与我的反馈，不由测试通过代替。首轮不以一小时压力测试为前置交付门槛。

把本文件放进本地项目目录后，可给 Codex 这段指令：

> 读取 VJ_Local_Effect_Spec_2026-10-01.md，作为本地 VJ 项目的实现规格。效果优先，默认输入是我的桌面音频。先用 TypeScript、Vite、Three.js、WebGL2、GLSL 和 Web Audio API 完成视觉内核与音乐映射，先不要桌面外壳，不做云部署。
>
> 写 shader 前先研究第 2 节的作品、演示和实现资料，记录借鉴点并落实到 ChaosField、Signal 与 Feedback。实现可编辑色板、不同声音特征的调制、宏控制、Freeze、Blackout，以及同一内核的三个调参版本。提供我能实际观看的本地预览。
>
> DesktopAudioSource 默认接桌面音频，不用麦克风冒充；如果本机捕获暂未打通，用本地文件继续测试同一条分析与视觉链路，捕获细节单独研究，不阻塞效果。
>
> 随后先做本机图片，再做手机上传：单张约 15 秒开始淡出，3 秒内退出，FIFO 排队，支持删除。照片反馈独立，删除和到期都必须清除对应残影、颜色贡献和资源。
>
> 把“VDJ 主屏前台操作且 HDMI 只投影 VJ”以及“读取 VDJ 已识别的速度和拍点”作为研究项。OSC 和 OS2L 优先，能读就接，不能就记录原因并继续音频驱动。不要用假值声称同步成功，不自动改我的 VDJ 演出配置。
>
> 本机验证与远程验证分开记录。每轮交付准确启动命令、可看效果、实际完成内容和仍待研究事项。运行容器、打包形式与演出稳定性在效果方向确定后再讨论。

## 15 参考链接

公开资料核对日期为 2026 年 10 月 1 日。接口是否可用以实施时官方文档和本人电脑为准。视觉中的数值、时间和队列规则由本方案提出，并非参考网站的原有功能。

### 作品和图形实现

- **R01 Apophenia 2026**：[作品与技术说明](https://eccv-art-26.github.io/pieces/apophenia/)；[交互作品](https://apophenia-2026.netlify.app/)。观察云状歧义形态和局部辨认。
- **R02 Arturia Pigments**：[官方介绍](https://www.arturia.com/products/software-instruments/pigments/overview)。参考动态界面与可读调制。
- **R03 Hydra**：[在线编辑器](https://hydra.ojack.xyz/)；[官方文档](https://hydra.ojack.xyz/docs/)。观察 feedback、modulation 和 pixel operations。
- **R04 Hydra 源码**：[作者项目](https://github.com/hydra-synth/hydra)。阅读浏览器视觉与反馈的组织，复用前核对具体许可证。
- **R05 Synesthesia**：[官网](https://synesthesia.live/)；[音频 uniforms](https://app.synesthesia.live/docs/ssf/audio_uniforms.html)；[shader 文档](https://synesthesia.live/docs/)。参考能量、瞬态、运动时钟和 BPM 的分工。
- **R06 The Book of Shaders**：[FBM 与 Domain Warping](https://thebookofshaders.com/13/)；[Cellular Noise](https://thebookofshaders.com/12/)。对应云层、扭曲和细胞碎片。
- **R07 Three.js**：[ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)；[WebGLRenderTarget](https://threejs.org/docs/pages/WebGLRenderTarget.html)。自定义 GLSL 和离屏反馈缓冲。

### 桌面音频

- **R08 浏览器捕获**：[MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)；[Chrome 系统音频选项](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)。用户授权、附带视频、系统音频提示与实际 audio track。
- **R09 Microsoft WASAPI**：[Loopback Recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)。后续研究输出端点与 loopback。
- **R10 Microsoft 进程音频**：[Application loopback sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)。后续研究进程树捕获及系统版本条件。
- **R18 Web Audio**：[AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)。需要独立音频处理时的实现接口。

### VDJ 图片和投影

- **R11 VDJ Options**：[官方选项列表](https://virtualdj.com/manuals/virtualdj/appendix/optionslist.html)。OSC 授权与订阅、OS2L、beat offset。
- **R12 VDJScript**：[官方命令列表](https://virtualdj.com/manuals/virtualdj/appendix/vdjscriptverbs.html)。BPM、beatgrid、beat position、pitch 的含义。
- **R13 OS2L**：[官方协议与示例](https://os2l.org/)。TCP、逐拍消息和 BPM。
- **R14 VDJ SDK**：[官方开发者页面](https://virtualdj.com/wiki/Developers.html)。插件类型、头文件和示例。
- **R15 VDJ WebSocket 插件参考**：[作者仓库](https://github.com/flobros/vdj-websocket)。只作候选实现阅读，不代表在本人电脑已验证。
- **R16 Sharp**：[resize](https://sharp.pixelplumbing.com/api-resize/)；[output](https://sharp.pixelplumbing.com/api-output/)。本地缩放与图像输出。
- **R17 Windows 多显示器**：[Microsoft 官方说明](https://support.microsoft.com/en-us/windows/hardware/display-graphics/how-to-use-multiple-monitors-in-windows)。Extend 模式与显示器布局。
