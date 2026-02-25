<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { uiStore } from '../../stores/uiStore';
  import { annotationStore } from '../../stores/annotationStore';
  import { createRenderer } from '../../utils/renderer';
  import type { Tree, LayoutResult } from '../../types/tree';
  import type { RenderConfig } from '../../types/layout';

  const dispatch = createEventDispatcher<{
    nodeClick: string;
  }>();

  let container: HTMLDivElement;
  let renderer: any = null;
  let tree: Tree | null = null;
  let layoutResult: LayoutResult | null = null;
  const renderMode: 'svg' = 'svg';
  let zoom: number = 1;
  let pan: { x: number; y: number } = { x: 0, y: 0 };
  let branchColor = '#8f96a3';
  let branchColorMode: 'single' | 'clade' = 'clade';
  let theme: 'dark' | 'light' = 'dark';
  let showLabels: boolean = true;
  let isDragging: boolean = false;
  let selectedNodeSignature = '';
  let lastMouseX: number = 0;
  let lastMouseY: number = 0;

  // 订阅树状态
  const unsubscribeTree = treeStore.subscribe($treeStore => {
    tree = $treeStore.tree;
    layoutResult = $treeStore.layoutResult;
    if (tree && layoutResult && renderer) {
      render();
    }
  });

  // 订阅UI状态
  const unsubscribeUI = uiStore.subscribe($uiStore => {
    const oldBranchColor = branchColor;
    const oldBranchColorMode = branchColorMode;
    const oldTheme = theme;
    const oldShowLabels = showLabels;

    zoom = $uiStore.zoom;
    pan = $uiStore.pan;
    branchColor = $uiStore.branchColor;
    branchColorMode = $uiStore.branchColorMode;
    theme = $uiStore.theme;
    showLabels = $uiStore.showLabels;

    const nextSelectedSignature = $uiStore.selectedNodes.join('|');
    const selectedNodesChanged = selectedNodeSignature !== nextSelectedSignature;
    selectedNodeSignature = nextSelectedSignature;
    
    // 只在分支颜色变化时重新渲染树
    // 缩放和平移只更新变换，不重新渲染
    if (renderer && tree && layoutResult) {
      if (oldBranchColor !== branchColor || oldBranchColorMode !== branchColorMode || oldTheme !== theme || selectedNodesChanged || oldShowLabels !== showLabels) {
        render();
      } else {
        updateTransform();
      }
    }
  });

  const unsubscribeAnnotation = annotationStore.subscribe(() => {
    if (renderer && tree && layoutResult) {
      // 注释变化时重新渲染，但保留当前的缩放和平移状态
      // 先保存当前的缩放和平移
      const currentZoom = zoom;
      const currentPan = pan;
      
      // 重新渲染
      render();
      
      // 恢复缩放和平移
      setTimeout(() => {
        updateTransform();
      }, 0);
    }
  });

  // 初始化渲染器
  onMount(() => {
    const config: RenderConfig = {
      mode: 'svg',
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: theme === 'light' ? '#f8fafc' : '#0f172a',
      nodeColor: theme === 'light' ? '#0f172a' : '#fff',
      branchColor,
      branchColorMode,
      annotationDisplayMode: 'inline',
      nodeSize: 4,
      branchWidth: 1
    };

    renderer = createRenderer(container, config);

    if (tree && layoutResult) {
      render();
    }
  });

  // 渲染树
  const render = () => {
    if (!tree || !layoutResult || !renderer) return;

    const config: RenderConfig = {
      mode: 'svg',
      width: container.clientWidth,
      height: container.clientHeight,
      layoutWidth: layoutResult.layoutWidth,
      layoutHeight: layoutResult.layoutHeight,
      backgroundColor: theme === 'light' ? '#f8fafc' : '#0f172a',
      nodeColor: theme === 'light' ? '#0f172a' : '#fff',
      branchColor,
      branchColorMode,
      annotationDisplayMode: 'inline',
      nodeSize: 4,
      branchWidth: 1
    };

    renderer.render(tree, layoutResult, config);
    updateTransform();
    
    // 渲染完成后，根据 uiStore 中的选中状态重新应用高亮效果
  };

  // 更新变换
  const updateTransform = () => {
    if (!renderer) return;
    const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;
    renderer.updateTransform(transform);
  };

  // 处理窗口大小变化
  const handleResize = () => {
    if (!renderer) return;
    renderer.resize(container.clientWidth, container.clientHeight);
    if (tree && layoutResult) {
      render();
    }
  };

  // 处理鼠标按下事件，开始拖拽
  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  };

  // 处理鼠标移动事件，计算位移并更新pan
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    
    // 更新pan位置
    uiStore.setPan((currentPan) => ({
      x: currentPan.x + deltaX,
      y: currentPan.y + deltaY
    }));
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  };

  // 处理鼠标释放事件，结束拖拽
  const handleMouseUp = () => {
    isDragging = false;
  };

  // 处理鼠标离开事件，结束拖拽
  const handleMouseLeave = () => {
    isDragging = false;
  };

  // 处理鼠标滚轮事件，实现缩放功能
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (!container) return;

    // 计算鼠标在容器内的坐标（屏幕坐标系）
    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // 计算缩放因子，鼠标滚轮向上为正，向下为负
    const delta = e.deltaY > 0 ? 0.9 : 1.1;

    const currentZoom = zoom || 1;
    const unclampedZoom = currentZoom * delta;
    const newZoom = Math.max(0.1, Math.min(5, unclampedZoom));

    // 如果缩放比例没有变化，则不需要更新
    if (newZoom === currentZoom) {
      return;
    }

    const zoomRatio = newZoom / currentZoom;

    // 调整平移，使鼠标所在位置在缩放前后尽量保持在相同屏幕位置
    const newPanX = screenX * (1 - zoomRatio) + zoomRatio * pan.x;
    const newPanY = screenY * (1 - zoomRatio) + zoomRatio * pan.y;

    uiStore.setZoom(newZoom);
    uiStore.setPan({ x: newPanX, y: newPanY });
  };

  // 添加窗口大小变化监听器
  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
    unsubscribeTree();
    unsubscribeUI();
    unsubscribeAnnotation();
  });
</script>

<div
  bind:this={container}
  class={`w-full h-full overflow-hidden ${theme === 'light' ? 'bg-slate-50' : 'bg-gray-900'}`}
  role="presentation"
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:wheel={handleWheel}
  on:click={(e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // 点击画布空白处时清空选中；点击节点/分支/标签/注释时保持当前选择
    const isTreeElement = Boolean(target.closest('.node, .link, .label, .annotation-layer'));
    if (!isTreeElement) {
      uiStore.clearSelection();
    }
  }}
></div>
