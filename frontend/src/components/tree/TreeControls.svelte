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
  let branchColor = '#8f96a3';
  let branchColorMode: 'single' | 'clade' = 'clade';

  const scientificPalettes = [
    { name: 'Slate', color: '#8f96a3' },
    { name: 'Teal', color: '#4E8B8B' },
    { name: 'Indigo', color: '#6574B8' },
    { name: 'Olive', color: '#7E8B5B' },
    { name: 'Rose', color: '#A46D7C' },
    { name: 'Amber', color: '#B38A4C' }
  ];

  // 订阅UI状态变化
  uiStore.subscribe($uiStore => {
    renderMode = $uiStore.renderMode;
    showLabels = $uiStore.showLabels;
    branchColor = $uiStore.branchColor;
    branchColorMode = $uiStore.branchColorMode;
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

  // 设置树枝颜色
  const setBranchColor = (color: string) => {
    uiStore.setBranchColor(color);
  };

  const setBranchColorMode = (mode: 'single' | 'clade') => {
    uiStore.setBranchColorMode(mode);
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



  <!-- 树枝配色 -->
  <div class="mb-4">
    <label class="block text-xs text-gray-400 mb-1">树枝配色（科研色系）</label>
    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded border border-gray-600"
        style="opacity: {branchColorMode === 'clade' ? 1 : 0.6}"
        on:click={() => setBranchColorMode('clade')}
      >
        分组配色
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded border border-gray-600"
        style="opacity: {branchColorMode === 'single' ? 1 : 0.6}"
        on:click={() => setBranchColorMode('single')}
      >
        统一配色
      </button>
    </div>
    <div class="grid grid-cols-3 gap-2 mb-2">
      {#each scientificPalettes as palette}
        <button
          class="text-[10px] text-white py-1 px-2 rounded border border-gray-600 hover:border-gray-400"
          style="background-color: {palette.color}; opacity: {branchColor === palette.color ? 1 : 0.75}"
          on:click={() => setBranchColor(palette.color)}
          title={palette.name}
        >
          {palette.name}
        </button>
      {/each}
    </div>
    <div class="flex items-center gap-2">
      <input
        type="color"
        class="w-10 h-7 rounded bg-gray-700 border border-gray-600"
        bind:value={branchColor}
        on:change={(e) => setBranchColor((e.currentTarget as HTMLInputElement).value)}
      />
      <span class="text-[10px] text-gray-400">{branchColor}</span>
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
