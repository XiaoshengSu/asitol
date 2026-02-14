<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { annotationStore } from '../../stores/annotationStore';
  import { treeService } from '../../services/treeService';
  import { parser } from '../../utils/parser';
  import type { Tree } from '../../types/tree';
  import type { AnnotationData } from '../../types/annotation';

  const dispatch = createEventDispatcher<{
    fileUploaded: File;
    treeLoaded: Tree;
    annotationLoaded: AnnotationData;
  }>();

  let file: File | null = null;
  let loading: boolean = false;
  let error: string | null = null;
  let uploadType: 'tree' | 'annotation' = 'tree';
  let annotationType: string = 'COLORSTRIP';

  // 处理文件选择
  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      file = target.files[0];
      error = null;
    }
  };

  // 处理文件上传
  const handleUpload = async () => {
    if (!file) {
      error = '请选择文件';
      return;
    }

    loading = true;
    error = null;

    try {
      if (uploadType === 'tree') {
        // 上传树文件
        const text = await file.text();
        const tree = parser.parseNewick(text);
        treeStore.setTree(tree);
        treeStore.setLoading(false);
        dispatch('treeLoaded', tree);
        dispatch('fileUploaded', file);
      } else {
        // 上传注释文件
        const text = await file.text();
        const annotation = parser.parseAnnotation(text, annotationType);
        annotationStore.addAnnotation(annotation);
        // 添加为图层
        annotationStore.addLayer({
          id: annotation.id,
          name: annotation.name,
          type: annotation.type,
          data: annotation,
          visible: true,
          order: annotationStore.subscribe($store => $store.layers.length)(),
          config: annotation.config || {}
        });
        dispatch('annotationLoaded', annotation);
        dispatch('fileUploaded', file);
      }
    } catch (err) {
      error = `上传失败: ${err instanceof Error ? err.message : '未知错误'}`;
      console.error('File upload error:', err);
    } finally {
      loading = false;
    }
  };

  // 加载示例树
  const loadExampleTree = async () => {
    loading = true;
    error = null;

    try {
      // 生成一个简单的示例树
      const exampleNewick = '(A:0.1,B:0.2,(C:0.3,D:0.4):0.5);';
      const tree = parser.parseNewick(exampleNewick);
      treeStore.setTree(tree);
      treeStore.setLoading(false);
      dispatch('treeLoaded', tree);
    } catch (err) {
      error = `加载示例树失败: ${err instanceof Error ? err.message : '未知错误'}`;
      console.error('Load example tree error:', err);
    } finally {
      loading = false;
    }
  };
</script>

<div class="bg-gray-800 p-3 rounded-lg shadow-md">
  <h3 class="text-sm font-medium text-gray-300 mb-3">文件上传</h3>
  
  <!-- 上传类型选择 -->
  <div class="mb-3">
    <div class="flex gap-2">
      <button
        class={`text-xs py-1 px-3 rounded ${uploadType === 'tree' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        on:click={() => uploadType = 'tree'}
      >
        树文件
      </button>
      <button
        class={`text-xs py-1 px-3 rounded ${uploadType === 'annotation' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        on:click={() => uploadType = 'annotation'}
      >
        注释文件
      </button>
    </div>
  </div>

  <!-- 注释类型选择 -->
  {#if uploadType === 'annotation'}
    <div class="mb-3">
      <label class="block text-xs text-gray-400 mb-1">注释类型</label>
      <select
        class="w-full text-xs bg-gray-700 text-gray-300 rounded p-1"
        bind:value={annotationType}
      >
        <option value="COLORSTRIP">色带</option>
        <option value="HEATMAP">热图</option>
        <option value="BARCHART">条形图</option>
        <option value="PIECHART">饼图</option>
        <option value="BINARY">二进制</option>
        <option value="STRIP">条带</option>
        <option value="ALIGNMENT">序列比对</option>
        <option value="CONNECTIONS">连接</option>
        <option value="POPUP">弹出框</option>
      </select>
    </div>
  {/if}

  <!-- 文件选择 -->
  <div class="mb-3">
    <label class="block text-xs text-gray-400 mb-1">
      {uploadType === 'tree' ? '选择树文件 (Newick格式)' : '选择注释文件'}
    </label>
    <input
      type="file"
      class="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:border-0 file:bg-gray-700 file:text-gray-300"
      on:change={handleFileChange}
    />
    {#if file}
      <p class="text-xs text-gray-400 mt-1">{file.name}</p>
    {/if}
  </div>

  <!-- 错误信息 -->
  {#if error}
    <p class="text-xs text-red-400 mb-3">{error}</p>
  {/if}

  <!-- 操作按钮 -->
  <div class="flex gap-2">
    <button
      class="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-white py-1 px-2 rounded disabled:opacity-50"
      on:click={handleUpload}
      disabled={!file || loading}
    >
      {loading ? '上传中...' : '上传'}
    </button>
    {#if uploadType === 'tree'}
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded disabled:opacity-50"
        on:click={loadExampleTree}
        disabled={loading}
      >
        加载示例
      </button>
    {/if}
  </div>
</div>
