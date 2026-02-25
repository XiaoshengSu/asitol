<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { annotationStore } from '../../stores/annotationStore';

  const dispatch = createEventDispatcher<{
    export: { format: string; data: any };
    close: void;
  }>();

  let isOpen: boolean = false;
  let exportFormat: string = 'newick';
  let tree: any = null;
  let annotations: any[] = [];

  // 订阅状态
  let unsubscribeTree: (() => void) | null = null;
  let unsubscribeAnnotations: (() => void) | null = null;

  // 在组件挂载时订阅
  onMount(() => {
    unsubscribeTree = treeStore.subscribe($treeStore => {
      tree = $treeStore.tree;
    });

    unsubscribeAnnotations = annotationStore.subscribe($annotationStore => {
      annotations = $annotationStore.annotations;
    });
  });

  // 在组件销毁时取消订阅
  onDestroy(() => {
    if (unsubscribeTree) {
      unsubscribeTree();
    }
    if (unsubscribeAnnotations) {
      unsubscribeAnnotations();
    }
  });

  // 打开对话框
  export const open = () => {
    isOpen = true;
  };

  // 关闭对话框
  const close = () => {
    isOpen = false;
    dispatch('close');
  };

  // 导出数据
  const handleExport = () => {
    if (!tree) {
      alert('暂无树数据');
      return;
    }

    let data: any;

    switch (exportFormat) {
      case 'newick':
        // 转换为Newick格式
        data = convertToNewick(tree.root);
        break;
      case 'json':
        // 导出为JSON
        data = JSON.stringify(tree, null, 2);
        break;
      case 'svg':
        // 导出为SVG（需要实现）
        data = 'SVG export not implemented yet';
        break;
      default:
        data = JSON.stringify(tree, null, 2);
    }

    dispatch('export', { format: exportFormat, data });
    close();
  };

  // 转换为Newick格式
  const convertToNewick = (node: any): string => {
    if (!node.children || node.children.length === 0) {
      return node.name || '';
    }

    const children = node.children.map((child: any) => convertToNewick(child)).join(',');
    const name = node.name ? node.name : '';
    const branchLength = node.branchLength ? `:${node.branchLength}` : '';

    return `(${children})${name}${branchLength}`;
  };
</script>

{#if isOpen}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-gray-800 p-4 rounded-lg shadow-lg w-80">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-medium text-gray-300">导出数据</h3>
        <button
          class="text-gray-400 hover:text-gray-300"
          on:click={close}
        >
          ×
        </button>
      </div>

      <!-- 格式选择 -->
      <div class="mb-4">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label class="block text-xs text-gray-400 mb-1">导出格式</label>
        <select
          class="w-full text-xs bg-gray-700 text-gray-300 rounded p-2"
          bind:value={exportFormat}
        >
          <option value="newick">Newick</option>
          <option value="json">JSON</option>
          <option value="svg">SVG</option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="flex gap-2">
        <button
          class="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-white py-1 px-2 rounded"
          on:click={handleExport}
        >
          导出
        </button>
        <button
          class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded"
          on:click={close}
        >
          取消
        </button>
      </div>
    </div>
  </div>
{/if}
