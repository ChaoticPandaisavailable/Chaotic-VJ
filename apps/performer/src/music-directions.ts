import type { VisualEntryId } from './visual-library.ts';

/** Explanations follow each material's actual response, not a generic pulsing scale. */
export const musicDirections:Record<VisualEntryId,{summary:string;kick:string;flow:string;detail:string}>={
  aurora:{summary:'风穿过折叠光帘，光浪沿长纤维传播',kick:'一束光浪从侧面穿过三层光幕',flow:'持续输送光帘内部的褶皱与长纤维',detail:'局部纤维与星点短暂闪亮'},
  tidal:{summary:'音乐落入波面，涟漪与折射光相互交叠',kick:'从局部落点扩散一道真实击打的涟漪',flow:'持续输送波面与交叠折射纹理',detail:'点亮朝向光源的少量波峰'},
  nebula:{summary:'旋臂承接推动，远近星尘分层流动',kick:'推动旋臂内的云气，释放后继续前行',flow:'带动近远烟云沿不同速度输送',detail:'少量星点短暂变大、变亮'},
  clouds:{summary:'大块云体受推，薄云与星空轻轻呼应',kick:'宽缓地推动不同深度的云体',flow:'持续带动云海与近景薄雾',detail:'穿过云隙的星点轻轻闪亮'},
  ink:{summary:'墨层错位流动，保留山海的舒展层次',kick:'轻推墨层，保持长条轮廓',flow:'远层慢移，近层墨迹加速掠过',detail:'疏星微光，克制细部扰动'},
  classic:{summary:'多层卷曲相互穿行，细涡流随音乐增强',kick:'推动已有卷曲向前展开',flow:'持续输送卷曲气流与内部剪切',detail:'点亮背景星点与细小流动'},
  vortex:{summary:'星际尘埃随风输送，保留深空旋臂与暗隙',kick:'沿旋臂与风带推进，停鼓后不回弹',flow:'持续输送星尘，推动不同形态的流向',detail:'局部尘粒闪亮，避免整幅闪烁'},
  storm:{summary:'声音深入体积，推动云体与局部透光',kick:'按不同深度推动云体并局部透光',flow:'持续推进三维云层的内部流动',detail:'仅点亮薄云边缘'},
  strings:{summary:'击打沿弦传播，流层在低频里交织',kick:'沿丝线向两侧传播一次波动',flow:'缓慢推动流层与空间形变',detail:'点亮局部细丝'},
  particles:{summary:'三股深空粒子流穿行，星尘形成有纵深的长河',kick:'推动不同流段局部起伏与错位',flow:'持续输送前后粒子流，带动内部波浪',detail:'点亮近景粒子与背景星点'},
  facets:{summary:'六组几何独立换位，落定后保留新的构图',kick:'实测 Kick 推进有序队形，平滑停留',flow:'Bass 带动各组缓慢漂移',detail:'高频点亮细线与边缘'},
};
