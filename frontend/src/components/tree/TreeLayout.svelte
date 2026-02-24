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

  export let viewportEl: HTMLElement | null = null;

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
  let viewportResizeObserver: ResizeObserver | null = null;
  const getCanvasViewport = () => {
    if (viewportEl) {
      const { width, height } = viewportEl.getBoundingClientRect();
      return {
        width: Math.max(320, Math.floor(width)),
        height: Math.max(260, Math.floor(height))
      };
    }

    return {
      width: layoutConfig.width || 800,
      height: layoutConfig.height || 600
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
      
      // resetView 内部会调用 calculateTreeBounds 并等待状态更新
      uiStore.resetView();
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

  const observeViewportResize = () => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;

    if (viewportResizeObserver) {
      viewportResizeObserver.disconnect();
      viewportResizeObserver = null;
    }

    if (!viewportEl) return;

    viewportResizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    viewportResizeObserver.observe(viewportEl);
  };

  $: if (viewportEl) {
    observeViewportResize();
  }

  onMount(() => {
    if (tree) {
      computeLayout();
    }

    observeViewportResize();

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
    if (viewportResizeObserver) {
      viewportResizeObserver.disconnect();
      viewportResizeObserver = null;
    }
    unsubscribe();
  });
</script>

<!-- TreeLayout组件不需要渲染任何内容，它只是一个计算布局的服务组件 -->
