<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { uiStore } from '../../stores/uiStore';
  import { treeStore } from '../../stores/treeStore';
  import type { LayoutType } from '../../types/tree';

  const dispatch = createEventDispatcher<{
    layoutChange: LayoutType;

  }>();

  // 反应式变量来跟踪UI状态
  let showLabels = true;
  let branchColor = '#8f96a3';
  let branchColorMode: 'single' | 'clade' = 'clade';
  let currentLayout: LayoutType = 'rectangular';
  let colorDropdownOpen = false;
  let theme: 'dark' | 'light' = 'dark';

  // 专业生信配色方案 - 基于科研期刊和色觉友好标准
  const colorSchemes = [
    // 推荐：色觉友好调色板（适合多类群、大样本）
    { name: 'Colorblind', base: '#0072B2', colors: ['#0072B2', '#009E73', '#D55E00', '#CC79A7', '#F0E442', '#56B4E9', '#E69F00', '#999999'] },
    // 经典科研期刊调色板（适合发表图）
    { name: 'NPG', base: '#E64B35B2', colors: ['#E64B35B2', '#4DBBD5B2', '#00A087B2', '#3C5488B2', '#F39B7F80', '#8491B480', '#91D1C280', '#DC0000B2'] },
    { name: 'GGPlot', base: '#F8766D', colors: ['#F8766D', '#C49A00', '#53B400', '#00C094', '#00B6EB', '#A58AFF', '#FB61D7', '#7CAE00'] },
    { name: 'AAAS', base: '#3B4992', colors: ['#3B4992', '#EE0000', '#008B45', '#631879', '#008280', '#BB0021', '#5F559B', '#A20056'] },
    { name: 'NEJM', base: '#BC3C29', colors: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F9ED4', '#FFDC91', '#EE4C97'] },
    { name: 'Lancet', base: '#00468B', colors: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6'] },
    { name: 'JAMA', base: '#374E55', colors: ['#374E55', '#DF8F44', '#00A1D5', '#B24745', '#79AF97', '#6A6599', '#80796B', '#E0A7C8'] },
    { name: 'JCO', base: '#006393', colors: ['#006393', '#70A6FF', '#D62828', '#00BB2D', '#FFBB00', '#9E0059', '#00B9E3', '#FF6B35'] },
    // 常用软件调色板与灰阶模式
    { name: 'Prism', base: '#1F77B4', colors: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#7F7F7F'] },
    { name: 'Academy', base: '#8C564B', colors: ['#8C564B', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#9467BD', '#D62728', '#7F7F7F'] },
    { name: 'Light', base: '#17BECF', colors: ['#17BECF', '#BCBD22', '#7F7F7F', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#D62728'] },
    { name: 'GSEA', base: '#666666', colors: ['#666666', '#666666', '#666666', '#666666', '#666666', '#FF0000', '#FF0000', '#FF0000'] },
    // 基础调色板
    { name: 'Primary', base: '#3182BD', colors: ['#3182BD', '#E6550D', '#31A354', '#756BB1', '#636363', '#DD8452', '#80B1D3', '#FC8D62'] }
  ];

  // 订阅UI状态变化
  uiStore.subscribe($uiStore => {
    showLabels = $uiStore.showLabels;
    branchColor = $uiStore.branchColor;
    branchColorMode = $uiStore.branchColorMode;
    theme = $uiStore.theme;
  });

  // 订阅树状态变化，获取当前布局类型
  treeStore.subscribe($treeStore => {
    currentLayout = $treeStore.layoutConfig.type;
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
    // 先检查是否有树数据
    let treeState: any;
    treeStore.subscribe(state => treeState = state)();
    
    // 如果没有布局结果或节点信息，先触发布局计算
    if (!treeState?.layoutResult?.nodes && treeState?.tree) {
      // 通过更新布局配置来触发布局计算
      treeStore.updateLayoutConfig({ type: treeState.layoutConfig.type });
      
      // 延迟执行重置视图，确保布局计算完成
      setTimeout(() => {
        uiStore.resetView();
      }, 100);
    } else {
      // 布局计算已经完成，直接执行重置视图
      uiStore.resetView();
    }
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

<div class="space-y-3">
  
  <!-- 布局选择 -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <div class={`text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>布局</div>
      <button
        class={`text-[10px] p-0.5 rounded-full ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-400 hover:text-gray-200'}`}
        title="矩形：适合精读标签与注释；圆形/径向：适合展示整体类群结构；无根：用于强调距离关系而非根位置。"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button
        class={`text-xs py-1.5 px-2 rounded border transition-all ${currentLayout === 'rectangular' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => changeLayout('rectangular')}
      >
        矩形
      </button>
      <button
        class={`text-xs py-1.5 px-2 rounded border transition-all ${currentLayout === 'circular' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => changeLayout('circular')}
      >
        圆形
      </button>
      <button
        class={`text-xs py-1.5 px-2 rounded border transition-all ${currentLayout === 'radial' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => changeLayout('radial')}
      >
        径向
      </button>
      <button
        class={`text-xs py-1.5 px-2 rounded border transition-all ${currentLayout === 'unrooted' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => changeLayout('unrooted')}
      >
        无根
      </button>
    </div>
  </div>

  <!-- 缩放控制 -->
  <div>
    <div class={`text-[11px] mb-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>缩放</div>
    <div class="flex gap-2">
      <button
        class={`flex-1 py-1.5 px-2 rounded border text-xs transition-all ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
        on:click={zoomIn}
      >
        放大
      </button>
      <button
        class={`flex-1 py-1.5 px-2 rounded border text-xs transition-all ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
        on:click={zoomOut}
      >
        缩小
      </button>
      <button
        class={`flex-1 py-1.5 px-2 rounded border text-xs transition-all ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
        on:click={resetView}
      >
        重置
      </button>
    </div>
  </div>



  <!-- 树枝配色 -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <div class={`text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>配色方案</div>
      <button
        class={`text-[10px] p-0.5 rounded-full ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-400 hover:text-gray-200'}`}
        title="分组配色适合查看门/纲级主类群；统一配色适合作为与注释色带区分的“基线”树形。"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-2">
      <button
        class={`text-xs py-1.5 px-2 rounded border text-left transition-all ${branchColorMode === 'clade' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => setBranchColorMode('clade')}
      >
        按主类群上色
      </button>
      <button
        class={`text-xs py-1.5 px-2 rounded border text-left transition-all ${branchColorMode === 'single' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
        on:click={() => setBranchColorMode('single')}
      >
        灰/单一色
      </button>
    </div>
    <div class="flex items-center gap-2 mb-2">
      <div class="flex-1">
        <!-- 自定义下拉组件，支持颜色预览 -->
        <div class="relative w-full">
          <button
            class={`w-full text-xs rounded-md px-3 py-1.5 border flex justify-between items-center transition-all duration-200 ${theme === 'light' ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 shadow-sm' : 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 shadow'}`}
            on:click={() => {
              colorDropdownOpen = !colorDropdownOpen;
            }}
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <div class="w-10 h-3 rounded overflow-hidden flex shadow-sm">
                {#each colorSchemes.find(s => s.base === branchColor)?.colors.slice(0, 5) || [] as color}
                  <div
                    class="flex-1 h-3 transition-transform hover:scale-105"
                    style="background-color: {color}"
                  ></div>
                {/each}
              </div>
              <span class="truncate text-[10px] font-medium">{colorSchemes.find(s => s.base === branchColor)?.name || '选择色系'}</span>
            </div>
            <svg width="8" height="5" fill="none" xmlns="http://www.w3.org/2000/svg" class={`transition-transform duration-200 ${colorDropdownOpen ? 'rotate-180' : ''}`}>
              <path d="M1 1L4 4L7 1" stroke={theme === 'light' ? '#4B5563' : '#D1D5DB'} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <!-- 下拉菜单 -->
          {#if colorDropdownOpen}
            <div
              class={`absolute top-full left-0 right-0 mt-1 rounded-md border shadow-lg z-20 max-h-60 overflow-y-auto transition-all duration-200 ease-in-out transform ${theme === 'light' ? 'bg-white border-slate-200 shadow-md scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100 hover:scrollbar-thumb-slate-400' : 'bg-gray-800 border-gray-600 shadow-lg scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 hover:scrollbar-thumb-gray-500'}`}
            >
            {#each colorSchemes as scheme}
              <button
                class={`w-full text-xs text-left px-3 py-2.5 flex items-center gap-3 transition-all duration-200 hover:translate-x-1 ${theme === 'light' ? 'text-slate-700 hover:bg-slate-50' : 'text-gray-200 hover:bg-gray-700'}`}
                on:click={() => {
                  setBranchColor(scheme.base);
                  colorDropdownOpen = false;
                }}
              >
                <div class="w-12 h-3.5 rounded overflow-hidden flex shadow-sm">
                  {#each scheme.colors.slice(0, 6) as color}
                    <div
                      class="flex-1 h-3.5 transition-transform hover:scale-105" 
                      style="background-color: {color}"
                    ></div>
                  {/each}
                </div>
                <span class="font-medium">{scheme.name}</span>
              </button>
            {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <input
          type="color"
          class={`w-8 h-6 rounded border ${theme === 'light' ? 'bg-white border-slate-300' : 'bg-gray-700 border-gray-600'}`}
          bind:value={branchColor}
          on:change={(e) => setBranchColor((e.currentTarget as HTMLInputElement).value)}
        />
        <span class={`text-[10px] text-left ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>{branchColor}</span>
      </div>
    </div>
  </div>



  <!-- 标签显示 -->
  <div>
    <div class={`text-[11px] mb-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>标签显示</div>
    <button
      class={`w-full py-1.5 px-2 rounded text-xs transition-all ${showLabels ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-blue-900/40 text-blue-300 border border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600')}`}
      on:click={toggleLabels}
    >
      {showLabels ? '隐藏标签' : '显示标签'}
    </button>
  </div>
</div>
