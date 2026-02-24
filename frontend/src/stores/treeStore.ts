import { writable, derived } from 'svelte/store';
import type { Tree, LayoutConfig, LayoutResult } from '../types/tree';

// 创建树状态存储
const createTreeStore = () => {
  const { subscribe, set, update } = writable<{
    tree: Tree | null;
    layoutConfig: LayoutConfig;
    layoutResult: LayoutResult | null;
    loading: boolean;
    error: string | null;
  }>({
    tree: null,
    layoutConfig: {
      type: 'rectangular',
      width: 800,
      height: 600,
      padding: 20,
      nodeSize: 4,
      branchWidth: 1
    },
    layoutResult: null,
    loading: false,
    error: null
  });

  return {
    subscribe,
    // 设置树数据
    setTree: (tree: Tree) => update(state => ({ ...state, tree })),
    // 更新布局配置
    updateLayoutConfig: (config: Partial<LayoutConfig>) => 
      update(state => ({ 
        ...state, 
        layoutConfig: { ...state.layoutConfig, ...config } 
      })),
    // 设置布局结果
    setLayoutResult: (result: LayoutResult) => update(state => ({ ...state, layoutResult: result })),
    // 设置加载状态
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    // 设置错误
    setError: (error: string | null) => update(state => ({ ...state, error })),
    // 计算树的边界
    calculateTreeBounds: () => {
      return update(state => {
        if (!state.layoutResult) {
          return state;
        }
        
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        
        // 遍历nodes对象的所有值
        const nodeValues = Object.values(state.layoutResult.nodes || {});
        for (const node of nodeValues) {
          if (node && typeof node === 'object' && 'x' in node && 'y' in node) {
            minX = Math.min(minX, node.x);
            maxX = Math.max(maxX, node.x);
            minY = Math.min(minY, node.y);
            maxY = Math.max(maxY, node.y);
          }
        }
        
        // 如果没有节点信息，使用默认边界
        if (minX === Infinity) {
          minX = 0;
          maxX = state.layoutConfig.width || 800;
          minY = 0;
          maxY = state.layoutConfig.height || 600;
        }
        
        return {
          ...state,
          layoutResult: {
            ...state.layoutResult,
            bounds: {
              minX,
              maxX,
              minY,
              maxY,
              width: maxX - minX,
              height: maxY - minY
            }
          }
        };
      });
    },
    // 重置状态
    reset: () => set({
      tree: null,
      layoutConfig: {
        type: 'rectangular',
        width: 800,
        height: 600,
        padding: 20,
        nodeSize: 4,
        branchWidth: 1
      },
      layoutResult: null,
      loading: false,
      error: null
    })
  };
};

export const treeStore = createTreeStore();

// 派生状态：是否有树数据
export const hasTree = derived(treeStore, $treeStore => !!$treeStore.tree);

// 派生状态：树节点数量
export const nodeCount = derived(treeStore, $treeStore => 
  $treeStore.tree ? $treeStore.tree.nodeCount : 0
);
