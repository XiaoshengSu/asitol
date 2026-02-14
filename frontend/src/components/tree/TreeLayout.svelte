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
      let optimalWidth = layoutConfig.width || 800;
      let optimalHeight = layoutConfig.height || 600;
      let optimalPadding = layoutConfig.padding || 20;
      
      // 对于大规模树，调整画布大小和间距
      if (nodeCount > 1000) {
        optimalWidth = 1200;
        optimalHeight = 800;
        optimalPadding = 10;
      } else if (nodeCount > 5000) {
        optimalWidth = 1600;
        optimalHeight = 1000;
        optimalPadding = 5;
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
      
      // 计算树的边界并居中
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

  onMount(() => {
    if (tree) {
      computeLayout();
    }
  });

  onDestroy(() => {
    unsubscribe();
  });
</script>

<!-- TreeLayout组件不需要渲染任何内容，它只是一个计算布局的服务组件 -->
