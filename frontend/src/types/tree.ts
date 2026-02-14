// 树节点类型
export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  parent?: string;
  branchLength?: number;
  metadata?: Record<string, any>;
}

// 树结构类型
export interface Tree {
  id: string;
  name: string;
  format: string;
  nodeCount: number;
  root: TreeNode;
}

// 布局类型
export type LayoutType = 'circular' | 'rectangular' | 'radial' | 'unrooted';

// 布局配置类型
export interface LayoutConfig {
  type: LayoutType;
  width?: number;
  height?: number;
  padding?: number;
  nodeSize?: number;
  branchWidth?: number;
}

// 布局结果类型
export interface LayoutResult {
  id: string;
  type: LayoutType;
  nodes: Record<string, { x: number; y: number; }>;
  links: Array<{ source: string; target: string; }>;
}
