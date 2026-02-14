import { api } from './api';
import type { Tree, LayoutConfig, LayoutResult } from '../types/tree';

// 树服务
export const treeService = {
  // 解析树文件
  parseTree: async (file: File): Promise<Tree> => {
    return api.upload<Tree>('/trees/parse', file);
  },

  // 计算树布局
  calculateLayout: async (tree: Tree, config: LayoutConfig): Promise<LayoutResult> => {
    return api.post<LayoutResult>('/trees/layout', {
      tree,
      type: config.type,
      config
    });
  },

  // 获取示例树
  getExampleTree: async (): Promise<Tree> => {
    return api.get<Tree>('/trees/example');
  }
};
