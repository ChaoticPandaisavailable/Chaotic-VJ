import type { VisualEntryId } from './visual-library.ts';

/** Explanations follow each material's actual response, not a generic pulsing scale. */
export const musicDirections:Record<VisualEntryId,{summary:string;kick:string;flow:string;detail:string}>={
  nebula:{summary:'旋臂承接推动，远近星尘分层流动',kick:'推动旋臂内的云气，释放后继续前行',flow:'带动近远烟云沿不同速度输送',detail:'少量星点短暂变大、变亮'},
  clouds:{summary:'大块云体受推，薄云与星空轻轻呼应',kick:'宽缓地推动不同深度的云体',flow:'持续带动云海与近景薄雾',detail:'穿过云隙的星点轻轻闪亮'},
  ink:{summary:'墨层错位流动，保留山海的舒展层次',kick:'轻推墨层，保持长条轮廓',flow:'远层慢移，近层墨迹加速掠过',detail:'疏星微光，克制细部扰动'},
  classic:{summary:'多层卷曲相互穿行，细涡流随音乐增强',kick:'推动已有卷曲向前展开',flow:'持续输送卷曲气流与内部剪切',detail:'点亮背景星点与细小流动'},
  vortex:{summary:'星际尘埃随风输送，保留深空旋臂与暗隙',kick:'沿旋臂与风带推进，停鼓后不回弹',flow:'持续输送星尘，推动不同形态的流向',detail:'局部尘粒闪亮，避免整幅闪烁'},
  storm:{summary:'声音深入体积，推动云体与局部透光',kick:'按不同深度推动云体并局部透光',flow:'持续推进三维云层的内部流动',detail:'仅点亮薄云边缘'},
  strings:{summary:'击打沿弦传播，流层在低频里交织',kick:'沿丝线向两侧传播一次波动',flow:'缓慢推动流层与空间形变',detail:'点亮局部细丝'},
  particles:{summary:'花瓣依次舒展，薄纱承接有方向的流动',kick:'不同花瓣先后展开、折叠',flow:'沿薄纱推动局部起伏与纤维流动',detail:'点亮部分纤维与瓣缘'},
  facets:{summary:'六组几何独立换位，落定后保留新的构图',kick:'实测 Kick 推进有序队形，平滑停留',flow:'Bass 带动各组缓慢漂移',detail:'高频点亮细线与边缘'},
};
