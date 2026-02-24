<script lang="ts">
  import TreeLayout from '../components/tree/TreeLayout.svelte';
  import TreeSvg from '../components/tree/TreeSvg.svelte';
  import TreeControls from '../components/tree/TreeControls.svelte';
  import LayerManager from '../components/annotation/LayerManager.svelte';
  import AnnotationLegendLayer from '../components/annotation/AnnotationLegendLayer.svelte';
  import FileUpload from '../components/ui/FileUpload.svelte';
  import ExportDialog from '../components/ui/ExportDialog.svelte';
  import { uiStore } from '../stores/uiStore';

  let exportDialog: any;
  let viewportEl: HTMLElement | null = null;
  let sidebarCollapsed = false;
  let canvasFullscreen = false;
  let panelUploadOpen = true;
  let panelControlOpen = true;
  let panelLayerOpen = false;

  const openExportDialog = () => {
    if (exportDialog) {
      exportDialog.open();
    }
  };

  const handleExport = (event: { detail: { format: string; data: any } }) => {
    const { format, data } = event.detail;
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tree.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAnnotationSearch = (event: Event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    uiStore.setSearchQuery(value);
  };

  const clearAnnotationSearch = () => {
    uiStore.setSearchQuery('');
  };

  const handleAnnotationOnlySelected = (event: Event) => {
    uiStore.setAnnotationOnlySelected((event.currentTarget as HTMLInputElement).checked);
  };

  const handleRowsPerPageChange = (event: Event) => {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    uiStore.setAnnotationRowsPerPage(value);
  };

  const prevAnnotationPage = () => {
    uiStore.prevAnnotationPage();
  };

  const nextAnnotationPage = () => {
    uiStore.nextAnnotationPage();
  };

  const toggleSidebar = () => {
    sidebarCollapsed = !sidebarCollapsed;
  };

  const enterCanvasFullscreen = () => {
    canvasFullscreen = true;
  };

  const exitCanvasFullscreen = () => {
    canvasFullscreen = false;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && canvasFullscreen) {
      canvasFullscreen = false;
    }
  };
</script>

<svelte:window on:keydown={handleKeydown} />

<div class={`h-screen flex flex-col min-h-0 ${$uiStore.theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-gray-900 text-white'}`}>
  {#if !canvasFullscreen}
    <header class={`border-b px-3 py-2 flex items-center justify-between gap-3 ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-200' : 'bg-gray-800/95 border-gray-700'}`}>
      <div class="flex items-center gap-3 min-w-0">
        <button
          class={`h-7 px-2 rounded text-xs whitespace-nowrap ${$uiStore.theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}` }
          on:click={toggleSidebar}
          title={sidebarCollapsed ? '展开左侧栏' : '收起左侧栏'}
        >
          {sidebarCollapsed ? '展开' : '收起'}
        </button>
        <h1 class={`text-lg font-bold whitespace-nowrap ${$uiStore.theme === 'light' ? 'text-slate-900' : 'text-white'}`}>AS iTOL</h1>
        <nav class="flex items-center gap-2 min-w-0">
          <input
            class={`w-52 text-xs border rounded px-2 py-1 ${$uiStore.theme === 'light' ? 'bg-white border-slate-300 text-slate-700 placeholder-slate-400' : 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'}` }
            type="text"
            placeholder="搜索注释（仅交互）"
            value={$uiStore.searchQuery}
            on:input={handleAnnotationSearch}
          />
          {#if $uiStore.searchQuery}
            <button class="text-xs text-gray-300 hover:text-white" on:click={clearAnnotationSearch}>
              清空
            </button>
          {/if}

          <label class="text-xs text-gray-300 flex items-center gap-1 whitespace-nowrap">
            <input
              type="checkbox"
              checked={$uiStore.annotationOnlySelected}
              on:change={handleAnnotationOnlySelected}
            />
            仅选中
          </label>

          <select
            class={`text-xs border rounded px-2 py-1 ${$uiStore.theme === 'light' ? 'bg-white border-slate-300 text-slate-700' : 'bg-gray-700 border-gray-600 text-gray-200'}` }
            value={$uiStore.annotationRowsPerPage}
            on:change={handleRowsPerPageChange}
          >
            <option value={50}>50/页</option>
            <option value={80}>80/页</option>
            <option value={120}>120/页</option>
            <option value={200}>200/页</option>
          </select>

          <button
            class="text-xs text-gray-300 hover:text-white disabled:opacity-40"
            on:click={prevAnnotationPage}
            disabled={$uiStore.annotationPage <= 1}
          >
            上一页
          </button>
          <span class="text-xs text-gray-400 min-w-8 text-center">{$uiStore.annotationPage}</span>
          <button class="text-xs text-gray-300 hover:text-white" on:click={nextAnnotationPage}>
            下一页
          </button>
          <button class="text-xs text-gray-300 hover:text-white" on:click={enterCanvasFullscreen}>
            画布全屏
          </button>
          <button class="text-xs text-gray-300 hover:text-white" on:click={openExportDialog}>
            导出
          </button>
          <button
            class={`text-xs ${$uiStore.theme === 'light' ? 'text-slate-600 hover:text-slate-900' : 'text-gray-300 hover:text-white'}`}
            on:click={() => uiStore.toggleTheme()}
          >
            {$uiStore.theme === 'light' ? '暗色' : '亮色'}
          </button>
        </nav>
      </div>
      <div class={`text-xs whitespace-nowrap ${$uiStore.theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>系统发育树可视化与注释工具</div>
    </header>
  {/if}

  <main class="flex-1 flex overflow-hidden min-h-0">
    {#if !canvasFullscreen}
      <aside
        class={`border-r transition-all duration-150 ease-out overflow-hidden ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-200' : 'bg-gray-800/95 border-gray-700'} ${
          sidebarCollapsed ? 'w-14' : 'w-[284px]'
        }`}
      >
        {#if sidebarCollapsed}
          <div class="h-full flex flex-col items-center gap-2 py-3">
            <button
              class="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
              on:click={() => {
                sidebarCollapsed = false;
                panelUploadOpen = true;
              }}
              title="导入数据"
            >
              导
            </button>
            <button
              class="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
              on:click={() => {
                sidebarCollapsed = false;
                panelControlOpen = true;
              }}
              title="树控制"
            >
              树
            </button>
            <button
              class="w-9 h-9 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
              on:click={() => {
                sidebarCollapsed = false;
                panelLayerOpen = true;
              }}
              title="图层管理"
            >
              图
            </button>
          </div>
        {:else}
          <div class="h-full overflow-y-auto px-2 py-2 space-y-2">
            <section class={`rounded border ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white' : 'border-gray-700/70 bg-gray-800/60'}` }>
              <button
                class={`w-full text-left px-3 py-2 text-xs font-medium border-b ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelUploadOpen = !panelUploadOpen)}
              >
                导入数据
              </button>
              {#if panelUploadOpen}
                <div class="p-2">
                  <FileUpload />
                </div>
              {/if}
            </section>

            <section class={`rounded border ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white' : 'border-gray-700/70 bg-gray-800/60'}` }>
              <button
                class={`w-full text-left px-3 py-2 text-xs font-medium border-b ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelControlOpen = !panelControlOpen)}
              >
                树控制
              </button>
              {#if panelControlOpen}
                <div class="p-2">
                  <TreeControls />
                </div>
              {/if}
            </section>

            <section class={`rounded border ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white' : 'border-gray-700/70 bg-gray-800/60'}` }>
              <button
                class={`w-full text-left px-3 py-2 text-xs font-medium border-b ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelLayerOpen = !panelLayerOpen)}
              >
                图层管理
              </button>
              {#if panelLayerOpen}
                <div class="p-2">
                  <LayerManager />
                </div>
              {/if}
            </section>
          </div>
        {/if}
      </aside>
    {/if}

    <section bind:this={viewportEl} class="flex-1 min-w-0 min-h-0 relative">
      <TreeLayout {viewportEl} />
      <TreeSvg />
      <AnnotationLegendLayer />

      {#if canvasFullscreen}
        <div class="absolute top-3 left-3 z-30 flex items-center gap-2">
          <button
            class={`px-3 py-1.5 rounded border text-xs ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-gray-800/90 border-gray-600 text-gray-200 hover:bg-gray-700/90'}` }
            on:click={exitCanvasFullscreen}
          >
            退出全屏
          </button>
          <button
            class={`px-3 py-1.5 rounded border text-xs ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-gray-800/90 border-gray-600 text-gray-200 hover:bg-gray-700/90'}` }
            on:click={openExportDialog}
          >
            导出
          </button>
        </div>
      {/if}
    </section>
  </main>

  <ExportDialog bind:this={exportDialog} on:export={handleExport} />
</div>
