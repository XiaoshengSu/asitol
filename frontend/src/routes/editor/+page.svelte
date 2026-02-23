<script lang="ts">
  import { onMount } from 'svelte';
  import TreeLayout from '../../components/tree/TreeLayout.svelte';
  import TreeSvg from '../../components/tree/TreeSvg.svelte';
  import TreeCanvas from '../../components/tree/TreeCanvas.svelte';
  import TreeControls from '../../components/tree/TreeControls.svelte';
  import LayerManager from '../../components/annotation/LayerManager.svelte';
  import FileUpload from '../../components/ui/FileUpload.svelte';
  import ExportDialog from '../../components/ui/ExportDialog.svelte';
  import { uiStore } from '../../stores/uiStore';
  import type { RenderMode } from '../../types/layout';

  let exportDialog: any;
  let viewportEl: HTMLElement | null = null;
  let renderMode: RenderMode = 'svg';

  // 打开导出对话框
  const openExportDialog = () => {
    if (exportDialog) {
      exportDialog.open();
    }
  };

  // 处理导出
  const handleExport = (event: { detail: { format: string; data: any } }) => {
    const { format, data } = event.detail;
    // 创建下载链接
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

  // 处理渲染模式变化
  const handleRenderModeChange = (mode: RenderMode) => {
    renderMode = mode;
  };

  onMount(() => {
    // 初始化
  });
</script>

<div class="h-screen bg-gray-900 flex flex-col">
  <!-- 顶部工具栏 -->
  <header class="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-bold text-white">AS iTOL</h1>
      <nav class="flex gap-4">
        <button
          class="text-sm text-gray-300 hover:text-white"
          on:click={openExportDialog}
        >
          导出
        </button>
      </nav>
    </div>
    <div class="text-xs text-gray-400">
      系统发育树可视化与注释工具
    </div>
  </header>

  <!-- 主内容区 -->
  <main class="flex-1 flex overflow-hidden">
    <!-- 左侧边栏 -->
    <aside class="w-64 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
      <div class="space-y-4">
        <FileUpload />
        <TreeControls on:renderModeChange={handleRenderModeChange} />
        <!-- 将图层管理移动到左侧边栏 -->
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

    <!-- 中央画布 -->
    <section bind:this={viewportEl} class="flex-1 relative">
      <TreeLayout {viewportEl} />
      {#if renderMode === 'svg'}
        <TreeSvg />
      {:else}
        <TreeCanvas />
      {/if}
    </section>

    <!-- 移除右侧边栏 -->
  </main>

  <!-- 导出对话框 -->
  <ExportDialog bind:this={exportDialog} on:export={handleExport} />
</div>
