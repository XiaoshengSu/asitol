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
    <header class={`border-b px-4 py-2 flex items-center justify-between gap-4 ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-200 shadow-sm' : 'bg-gray-800/95 border-gray-700'}`}>
      <div class="flex items-center gap-4 min-w-0">
        <button
          class={`h-8 w-8 rounded-md flex items-center justify-center ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}` }
          on:click={toggleSidebar}
          title={sidebarCollapsed ? '展开左侧栏' : '收起左侧栏'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="{sidebarCollapsed ? 'M12 4v16m8-8H4' : 'M4 6h16M4 12h16M4 18h16'}" />
          </svg>
        </button>
        <h1 class={`text-lg font-bold whitespace-nowrap ${$uiStore.theme === 'light' ? 'text-slate-900' : 'text-white'}`}>As iTOL</h1>
        <div class="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
        <nav class="flex items-center gap-2 min-w-0">
          <button
            class={`px-3 py-1.5 rounded-md text-sm ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            on:click={enterCanvasFullscreen}
            title="画布全屏"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
            全屏
          </button>
          <button
            class={`px-3 py-1.5 rounded-md text-sm ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            on:click={openExportDialog}
            title="导出树"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            导出
          </button>
          <button
            class={`p-1.5 rounded-md ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            on:click={() => uiStore.toggleTheme()}
            title="切换主题"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="{$uiStore.theme === 'light' ? 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' : 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'}" />
            </svg>
          </button>
        </nav>
      </div>
      <div class={`text-xs whitespace-nowrap ${$uiStore.theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>系统发育树可视化与注释工具</div>
    </header>
  {/if}

  <main class="flex-1 flex overflow-hidden min-h-0">
    {#if !canvasFullscreen}
      <aside
        class={`border-r transition-all duration-200 ease-in-out overflow-hidden ${$uiStore.theme === 'light' ? 'bg-white/95 border-slate-200' : 'bg-gray-800/95 border-gray-700'} ${sidebarCollapsed ? 'w-12' : 'w-[270px]'}`}
      >
        {#if sidebarCollapsed}
          <div class="h-full flex flex-col items-center gap-1.5 py-2">
            <button
              class={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
              on:click={() => {
                sidebarCollapsed = false;
                panelUploadOpen = true;
              }}
              title="导入数据"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </button>
            <button
              class={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
              on:click={() => {
                sidebarCollapsed = false;
                panelControlOpen = true;
              }}
              title="树控制"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </button>
            <button
              class={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${$uiStore.theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
              on:click={() => {
                sidebarCollapsed = false;
                panelLayerOpen = true;
              }}
              title="图层管理"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </button>
          </div>
        {:else}
          <div class="h-full overflow-y-auto px-2 py-2 space-y-1.5">
            <section class={`rounded-md border transition-all duration-200 ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white hover:shadow-sm' : 'border-gray-700/70 bg-gray-800/60 hover:border-gray-600/80'}` }>
              <button
                class={`w-full text-left px-2.5 py-1.5 text-xs font-medium border-b transition-colors ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelUploadOpen = !panelUploadOpen)}
              >
                <div class="flex items-center justify-between">
                  <span>导入数据</span>
                  <svg xmlns="http://www.w3.org/2000/svg" class={`h-3.5 w-3.5 transition-transform ${panelUploadOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {#if panelUploadOpen}
                <div class="p-1.5">
                  <FileUpload />
                </div>
              {/if}
            </section>

            <section class={`rounded-md border transition-all duration-200 ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white hover:shadow-sm' : 'border-gray-700/70 bg-gray-800/60 hover:border-gray-600/80'}` }>
              <button
                class={`w-full text-left px-2.5 py-1.5 text-xs font-medium border-b transition-colors ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelControlOpen = !panelControlOpen)}
              >
                <div class="flex items-center justify-between">
                  <span>树控制</span>
                  <svg xmlns="http://www.w3.org/2000/svg" class={`h-3.5 w-3.5 transition-transform ${panelControlOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {#if panelControlOpen}
                <div class="p-1.5">
                  <TreeControls />
                </div>
              {/if}
            </section>

            <section class={`rounded-md border transition-all duration-200 ${$uiStore.theme === 'light' ? 'border-slate-200 bg-white hover:shadow-sm' : 'border-gray-700/70 bg-gray-800/60 hover:border-gray-600/80'}` }>
              <button
                class={`w-full text-left px-2.5 py-1.5 text-xs font-medium border-b transition-colors ${$uiStore.theme === 'light' ? 'text-slate-700 border-slate-200 hover:bg-slate-50' : 'text-gray-200 border-gray-700/70 hover:bg-gray-700/50'}` }
                on:click={() => (panelLayerOpen = !panelLayerOpen)}
              >
                <div class="flex items-center justify-between">
                  <span>图层管理</span>
                  <svg xmlns="http://www.w3.org/2000/svg" class={`h-3.5 w-3.5 transition-transform ${panelLayerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {#if panelLayerOpen}
                <div class="p-1.5">
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
