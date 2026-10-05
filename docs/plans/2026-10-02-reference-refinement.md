# 参考图重构与控制台精简

用户要求：仔细对照原参考图，尤其改善几何；查找成熟视觉实现；颜色 XY 控件向 FL Studio Sytrus 靠近；直接实施优化。

前三个已恢复的版本继续作为原版回归基线。对比了三条路径：增加原片元循环中的三角形（仍难处理清晰叠层）、加入通用后期效果（不能补足构图）、独立 GPU 面片组合。选独立面片，以大切面、半透明叠层、局部网点、细线骨架组织画面。控制顶点运动，不扭曲屏幕采样；形态之间仍使用场历史过渡。

粒子花云按投影尺寸调节点数，减少低分辨率画面中的过曝堆积；减弱布面，增强细粒和空间层次。保留统一色板、字符与点阵表达。

界面以演出操作为主：减少大场景卡片和展示性文字，折叠音频调制与次要运动控制。颜色区使用小型暗色 XY 栅格、十字指示、X/Y 双轴与单个色板选择，增加黑白捷径；上方代表更浓，左右对应暖冷，方向键可操作，双击回中。

参考：
- [Sytrus 官方手册：Modulation X/Y](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Sytrus.htm)
- [Matt DesLauriers：Stylized Wireframe Rendering](https://github.com/mattdesl/webgl-wireframes)，MIT，参考重心坐标、屏幕导数和单次线框渲染方法；本次组合与运动代码独立编写。
- [Three.js 自定义 BufferGeometry](https://threejs.org/manual/pages/custom-buffergeometry.html)
- [Codrops 粒子实现](https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/)，参考批量粒子的着色器运动方法。

验证：构建 / 既有回归测试；浏览器同批检查几何、粒子、原生混沌、XY、Freeze，以及桌面 / 窄屏。最多一轮集中修正后确认。实际帧率必须附输出尺寸。

Impeccable 规范已读取；本机未安装其 engine binary，使用浏览器实际布局与交互检查，不把自动设计检查声称为已通过。
