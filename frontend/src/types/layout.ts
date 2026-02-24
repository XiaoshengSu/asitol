// 布局计算参数类型
export interface LayoutParams {
  tree: import('./tree').Tree;
  width: number;
  height: number;
  padding: number;
}

// 布局算法接口
export interface LayoutAlgorithm {
  compute(params: LayoutParams): import('./tree').LayoutResult;
}

// 渲染模式类型
export type RenderMode = 'svg';

// 渲染配置类型
export interface RenderConfig {
  mode: RenderMode;
  width: number;
  height: number;
  layoutWidth?: number;
  layoutHeight?: number;
  backgroundColor?: string;
  nodeColor?: string;
  branchColor?: string;
  branchColorMode?: 'single' | 'clade';
  annotationDisplayMode?: 'inline' | 'legend';
  nodeSize?: number;
  branchWidth?: number;
}
