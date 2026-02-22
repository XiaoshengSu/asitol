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

  // 专业生信配色方案 - 基于科研期刊标准
  const colorSchemes = [
    // 科研期刊和软件标准调色板
    { name: 'Prism', base: '#1F77B4', colors: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#7F7F7F'] },
    { name: 'Academy', base: '#8C564B', colors: ['#8C564B', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#9467BD', '#D62728', '#7F7F7F'] },
    { name: 'Light', base: '#17BECF', colors: ['#17BECF', '#BCBD22', '#7F7F7F', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#D62728'] },
    { name: 'GGPlot', base: '#F8766D', colors: ['#F8766D', '#C49A00', '#53B400', '#00C094', '#00B6EB', '#A58AFF', '#FB61D7', '#7CAE00'] },
    { name: 'NPG', base: '#E64B35B2', colors: ['#E64B35B2', '#4DBBD5B2', '#00A087B2', '#3C5488B2', '#F39B7F80', '#8491B480', '#91D1C280', '#DC0000B2'] },
    { name: 'AAAS', base: '#3B4992', colors: ['#3B4992', '#EE0000', '#008B45', '#631879', '#008280', '#BB0021', '#5F559B', '#A20056'] },
    { name: 'NEJM', base: '#BC3C29', colors: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F9ED4', '#FFDC91', '#EE4C97'] },
    { name: 'Lancet', base: '#00468B', colors: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6'] },
    { name: 'JAMA', base: '#374E55', colors: ['#374E55', '#DF8F44', '#00A1D5', '#B24745', '#79AF97', '#6A6599', '#80796B', '#E0A7C8'] },
    { name: 'JCO', base: '#006393', colors: ['#006393', '#70A6FF', '#D62828', '#00BB2D', '#FFBB00', '#9E0059', '#00B9E3', '#FF6B35'] },
    { name: 'GSEA', base: '#666666', colors: ['#666666', '#666666', '#666666', '#666666', '#666666', '#FF0000', '#FF0000', '#FF0000'] },
    // 基础调色板
    { name: 'Primary', base: '#3182BD', colors: ['#3182BD', '#E6550D', '#31A354', '#756BB1', '#636363', '#DD8452', '#80B1D3', '#FC8D62'] },
    { name: 'Colorblind', base: '#0072B2', colors: ['#0072B2', '#009E73', '#D55E00', '#CC79A7', '#F0E442', '#56B4E9', '#E69F00', '#999999'] }
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
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded border border-gray-600 text-left"
        style="opacity: {branchColorMode === 'clade' ? 1 : 0.6}"
        on:click={() => setBranchColorMode('clade')}
      >
        分组配色
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded border border-gray-600 text-left"
        style="opacity: {branchColorMode === 'single' ? 1 : 0.6}"
        on:click={() => setBranchColorMode('single')}
      >
        统一配色
      </button>
    </div>
    <div class="mb-2">
      <!-- 自定义下拉组件，支持颜色预览 -->
      <div class="relative">
        <button
          class="w-full text-xs bg-gray-700 text-gray-300 rounded p-1 border border-gray-600 text-left flex justify-between items-center"
          on:click={() => {
            const dropdown = document.getElementById('colorSchemeDropdown');
            if (dropdown) {
              dropdown.classList.toggle('hidden');
            }
          }}
        >
          <div class="flex items-center gap-2">
            <div class="w-16 h-4 rounded overflow-hidden">
              {#each colorSchemes.find(s => s.base === branchColor)?.colors.slice(0, 8) || [] as color}
                <div 
                  class="inline-block w-2 h-4" 
                  style="background-color: {color}"
                />
              {/each}
            </div>
            <span>{colorSchemes.find(s => s.base === branchColor)?.name || '选择色系'}</span>
          </div>
          <svg width="10" height="6" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L5 5L9 1" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <!-- 下拉菜单 -->
        <div 
          id="colorSchemeDropdown"
          class="hidden absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded border border-gray-600 shadow-lg z-10 max-h-60 overflow-y-auto"
        >
          {#each colorSchemes as scheme}
            <button
              class="w-full text-xs text-left p-2 hover:bg-gray-700 flex items-center gap-2"
              on:click={() => {
                setBranchColor(scheme.base);
                const dropdown = document.getElementById('colorSchemeDropdown');
                if (dropdown) {
                  dropdown.classList.add('hidden');
                }
              }}
            >
              <div class="w-16 h-4 rounded overflow-hidden flex">
                {#each scheme.colors.slice(0, 8) as color}
                  <div 
                    class="flex-1" 
                    style="background-color: {color}"
                  />
                {/each}
              </div>
              <span>{scheme.name}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <input
        type="color"
        class="w-10 h-7 rounded bg-gray-700 border border-gray-600"
        bind:value={branchColor}
        on:change={(e) => setBranchColor((e.currentTarget as HTMLInputElement).value)}
      />
      <span class="text-[10px] text-gray-400 text-left">{branchColor}</span>
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
