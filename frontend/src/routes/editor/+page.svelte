<script lang="ts">
  import TreeLayout from '../../components/tree/TreeLayout.svelte';
  import TreeSvg from '../../components/tree/TreeSvg.svelte';
  import TreeCanvas from '../../components/tree/TreeCanvas.svelte';
  import TreeControls from '../../components/tree/TreeControls.svelte';
  import LayerManager from '../../components/annotation/LayerManager.svelte';
  import AnnotationLegendLayer from '../../components/annotation/AnnotationLegendLayer.svelte';
  import FileUpload from '../../components/ui/FileUpload.svelte';
  import ExportDialog from '../../components/ui/ExportDialog.svelte';
  import { uiStore } from '../../stores/uiStore';
  import type { RenderMode } from '../../types/layout';

  let exportDialog: any;
  let viewportEl: HTMLElement | null = null;
  let renderMode: RenderMode = 'svg';

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

  const handleRenderModeChange = (mode: RenderMode) => {
    renderMode = mode;
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
</script>

<div class="h-screen bg-gray-900 flex flex-col">
  <header class="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-bold text-white">AS iTOL</h1>
      <nav class="flex items-center gap-3">
        <input
          class="w-56 text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 placeholder-gray-400"
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
          class="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200"
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
        <span class="text-xs text-gray-400 min-w-10 text-center">{$uiStore.annotationPage}</span>
        <button class="text-xs text-gray-300 hover:text-white" on:click={nextAnnotationPage}>
          下一页
        </button>

        <button class="text-sm text-gray-300 hover:text-white" on:click={openExportDialog}>
          导出
        </button>
      </nav>
    </div>
    <div class="text-xs text-gray-400">系统发育树可视化与注释工具</div>
  </header>

  <main class="flex-1 flex overflow-hidden">
    <aside class="w-64 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
      <div class="space-y-4">
        <FileUpload />
        <TreeControls on:renderModeChange={handleRenderModeChange} />
        <details class="bg-gray-700 rounded-md overflow-hidden">
          <summary class="bg-gray-700 p-2 text-xs font-medium text-gray-300 cursor-pointer hover:bg-gray-600">
            图层管理
          </summary>
          <div class="p-2">
            <LayerManager />
          </div>
        </details>
      </div>
    </aside>

    <section bind:this={viewportEl} class="flex-1 relative">
      <TreeLayout {viewportEl} />
      {#if renderMode === 'svg'}
        <TreeSvg />
      {:else}
        <TreeCanvas />
      {/if}
      <AnnotationLegendLayer />
    </section>
  </main>

  <ExportDialog bind:this={exportDialog} on:export={handleExport} />
</div>

