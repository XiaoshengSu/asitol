<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { uiStore } from '../../stores/uiStore';
  import { treeStore } from '../../stores/treeStore';
  import type { LayoutType } from '../../types/tree';

  const dispatch = createEventDispatcher<{
    layoutChange: LayoutType;
    renderModeChange: 'svg' | 'canvas';
  }>();

  // 反应式变量来跟踪UI状态
  let renderMode = 'svg';
  let showLabels = true;

  // 订阅UI状态变化
  uiStore.subscribe($uiStore => {
    renderMode = $uiStore.renderMode;
    showLabels = $uiStore.showLabels;
  });

  // 放大
  const zoomIn = () => {
    // 使用update方法来更新缩放值，这样可以确保获取到最新的值
    uiStore.setZoom((zoom: number) => zoom * 1.2);
  };

  // 缩小
  const zoomOut = () => {
    // 使用update方法来更新缩放值，这样可以确保获取到最新的值
    uiStore.setZoom((zoom: number) => zoom / 1.2);
  };

  // 重置视图
  const resetView = () => {
    uiStore.resetView();
  };

  // 切换渲染模式
  const toggleRenderMode = () => {
    // 使用update方法来更新渲染模式
    uiStore.setRenderMode((mode: 'svg' | 'canvas') => {
      const newMode = mode === 'svg' ? 'canvas' : 'svg';
      dispatch('renderModeChange', newMode);
      return newMode;
    });
  };

  // 切换标签显示
  const toggleLabels = () => {
    uiStore.toggleLabels();
  };

  // 更改布局类型
  const changeLayout = (type: LayoutType) => {
    treeStore.updateLayoutConfig({ type });
    dispatch('layoutChange', type);
  };
</script>

<div class="bg-gray-800 p-3 rounded-lg shadow-md">
  <h3 class="text-sm font-medium text-gray-300 mb-3">树控制</h3>
  
  <!-- 布局选择 -->
  <div class="mb-4">
    <label class="block text-xs text-gray-400 mb-1">布局</label>
    <div class="grid grid-cols-2 gap-2">
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded"
        on:click={() => changeLayout('rectangular')}
      >
        矩形
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded"
        on:click={() => changeLayout('circular')}
      >
        圆形
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded"
        on:click={() => changeLayout('radial')}
      >
        径向
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded"
        on:click={() => changeLayout('unrooted')}
      >
        无根
      </button>
    </div>
  </div>

  <!-- 缩放控制 -->
  <div class="mb-4">
    <label class="block text-xs text-gray-400 mb-1">缩放</label>
    <div class="flex gap-2">
      <button
        class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs"
        on:click={zoomIn}
      >
        放大
      </button>
      <button
        class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs"
        on:click={zoomOut}
      >
        缩小
      </button>
      <button
        class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs"
        on:click={resetView}
      >
        重置
      </button>
    </div>
  </div>

  <!-- 渲染模式 -->
  <div class="mb-4">
    <label class="block text-xs text-gray-400 mb-1">渲染模式</label>
    <button
      class="w-full bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs"
      on:click={toggleRenderMode}
    >
      {renderMode === 'svg' ? '切换到Canvas' : '切换到SVG'}
    </button>
  </div>

  <!-- 标签显示 -->
  <div>
    <label class="block text-xs text-gray-400 mb-1">标签显示</label>
    <button
      class="w-full bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded text-xs"
      on:click={toggleLabels}
    >
      {showLabels ? '隐藏标签' : '显示标签'}
    </button>
  </div>
</div>
