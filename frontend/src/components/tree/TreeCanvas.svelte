<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { uiStore } from '../../stores/uiStore';
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
  let renderMode: 'svg' | 'canvas' = 'canvas';
  let zoom: number = 1;
  let pan: { x: number; y: number } = { x: 0, y: 0 };
  let branchColor = '#8f96a3';
  let branchColorMode: 'single' | 'clade' = 'clade';
  let isDragging: boolean = false;
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
    renderMode = $uiStore.renderMode;
    zoom = $uiStore.zoom;
    pan = $uiStore.pan;
    branchColor = $uiStore.branchColor;
    branchColorMode = $uiStore.branchColorMode;
    // 当showLabels或branchColor变化时重新渲染树
    if (renderer && tree && layoutResult) {
      render();
    }
  });

  // 初始化渲染器
  onMount(() => {
    const config: RenderConfig = {
      mode: 'canvas',
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#242424',
      nodeColor: '#fff',
      branchColor,
      branchColorMode,
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
      mode: 'canvas',
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: '#242424',
      nodeColor: '#fff',
      branchColor,
      branchColorMode,
      nodeSize: 4,
      branchWidth: 1
    };

    renderer.render(tree, layoutResult, config);
    updateTransform();
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
  });
</script>

<div
  bind:this={container}
  class="w-full h-full bg-gray-900 overflow-hidden"
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
  on:click={(e) => {
    // 处理节点点击事件
    // 实际项目中需要计算点击位置对应的节点
  }}
/>
