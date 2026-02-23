<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { uiStore } from '../../stores/uiStore';
  import { createLayoutAlgorithm } from '../../utils/layout';
  import type { Tree, LayoutConfig, LayoutResult } from '../../types/tree';
  import type { LayoutParams } from '../../types/layout';

  const dispatch = createEventDispatcher<{
    layoutComputed: LayoutResult;
  }>();

  let tree: Tree | null = null;
  let layoutConfig: LayoutConfig = {
    type: 'rectangular',
    width: 800,
    height: 600,
    padding: 20,
    nodeSize: 4,
    branchWidth: 1
  };
  let resizeTimer: number | null = null;

  const SIDEBAR_WIDTH = 256;
  const HEADER_HEIGHT = 44;
  const getCanvasViewport = () => {
    if (typeof window === 'undefined') {
      return {
        width: layoutConfig.width || 800,
        height: layoutConfig.height || 600
      };
    }

    return {
      width: Math.max(320, window.innerWidth - SIDEBAR_WIDTH),
      height: Math.max(260, window.innerHeight - HEADER_HEIGHT)
    };
  };

  // 订阅树状态
  const unsubscribe = treeStore.subscribe($treeStore => {
    // 只在树或布局配置发生变化时重新计算布局
    if (tree !== $treeStore.tree || layoutConfig.type !== $treeStore.layoutConfig.type) {
      tree = $treeStore.tree;
      layoutConfig = $treeStore.layoutConfig;
      if (tree) {
        computeLayout();
      }
    }
  });

  // 计算布局
  const computeLayout = () => {
    if (!tree) return;

    try {
      // 根据树的大小自动调整布局参数
      const nodeCount = tree.nodeCount;
      const viewport = getCanvasViewport();
      let optimalWidth = viewport.width;
      let optimalHeight = viewport.height;
      let optimalPadding = layoutConfig.padding || 20;
      
      // 对于大规模树，调整画布大小和间距
      if (nodeCount > 5000) {
        optimalPadding = 6;
      } else if (nodeCount > 1000) {
        optimalPadding = 10;
      }

      // 更新布局配置
      treeStore.updateLayoutConfig({
        width: optimalWidth,
        height: optimalHeight,
        padding: optimalPadding
      });

      const algorithm = createLayoutAlgorithm(layoutConfig.type);
      const params: LayoutParams = {
        tree,
        width: optimalWidth,
        height: optimalHeight,
        padding: optimalPadding
      };

      const result = algorithm.compute(params);
      treeStore.setLayoutResult(result);
      treeStore.calculateTreeBounds();
      uiStore.resetView();
      
      // 根据树的大小自动切换渲染模式
      if (nodeCount > 1000) {
        uiStore.setRenderMode('canvas');
        dispatch('renderModeChange', 'canvas');
      }
      
      dispatch('layoutComputed', result);
    } catch (error) {
      console.error('Layout computation failed:', error);
    }
  };

  const handleResize = () => {
    if (!tree || typeof window === 'undefined') return;

    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = window.setTimeout(() => {
      computeLayout();
    }, 120);
  };

  onMount(() => {
    if (tree) {
      computeLayout();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    unsubscribe();
  });
</script>

<!-- TreeLayout组件不需要渲染任何内容，它只是一个计算布局的服务组件 -->
