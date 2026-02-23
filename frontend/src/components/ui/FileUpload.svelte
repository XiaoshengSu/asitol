<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { annotationStore } from '../../stores/annotationStore';
  import { parser } from '../../utils/parser';
  import type { Tree } from '../../types/tree';
  import type { AnnotationData, AnnotationType } from '../../types/annotation';

  const dispatch = createEventDispatcher<{
    fileUploaded: File;
    treeLoaded: Tree;
    annotationLoaded: AnnotationData;
  }>();

  const EXAMPLE_ANNOTATION_ID = 'example_annotation';
  const EXAMPLE_NEWICK = '((((Human:0.1,Chimpanzee:0.12):0.08,Gorilla:0.2):0.3,Orangutan:0.5):0.2,((Mouse:0.6,Rat:0.62):0.1,((Dog:0.7,Cat:0.72):0.1,Cow:0.8):0.2):0.3);';

  const ANNOTATION_OPTIONS: Array<{ value: AnnotationType; label: string }> = [
    { value: 'COLORSTRIP', label: '色带' },
    { value: 'HEATMAP', label: '热图' },
    { value: 'BARCHART', label: '条形图' },
    { value: 'PIECHART', label: '饼图' },
    { value: 'BINARY', label: '二进制' },
    { value: 'STRIP', label: '条带' },
    { value: 'ALIGNMENT', label: '序列比对' },
    { value: 'CONNECTIONS', label: '连接' },
    { value: 'POPUP', label: '弹窗' }
  ];

  const SPECIES_META: Record<string, {
    group: string;
    color: string;
    score: number;
    abundance: number;
    binary: number;
    pie: [number, number, number];
  }> = {
    Human: { group: 'Primates', color: '#ef4444', score: 0.92, abundance: 88, binary: 1, pie: [48, 32, 20] },
    Chimpanzee: { group: 'Primates', color: '#ef4444', score: 0.9, abundance: 84, binary: 1, pie: [45, 35, 20] },
    Gorilla: { group: 'Primates', color: '#ef4444', score: 0.86, abundance: 73, binary: 1, pie: [40, 37, 23] },
    Orangutan: { group: 'Primates', color: '#ef4444', score: 0.81, abundance: 65, binary: 1, pie: [38, 34, 28] },
    Mouse: { group: 'Rodentia', color: '#06b6d4', score: 0.42, abundance: 58, binary: 0, pie: [24, 46, 30] },
    Rat: { group: 'Rodentia', color: '#06b6d4', score: 0.45, abundance: 61, binary: 0, pie: [27, 43, 30] },
    Dog: { group: 'Carnivora', color: '#3b82f6', score: 0.67, abundance: 69, binary: 1, pie: [33, 42, 25] },
    Cat: { group: 'Carnivora', color: '#3b82f6', score: 0.71, abundance: 72, binary: 1, pie: [35, 40, 25] },
    Cow: { group: 'Artiodactyla', color: '#22c55e', score: 0.61, abundance: 76, binary: 0, pie: [29, 44, 27] }
  };

  let file: File | null = null;
  let loading = false;
  let error: string | null = null;
  let uploadType: 'tree' | 'annotation' = 'tree';
  let annotationType: AnnotationType = 'COLORSTRIP';
  let exampleTreeMode = false;

  const getLayerSnapshot = () => {
    let layers: any[] = [];
    annotationStore.subscribe(state => {
      layers = state.layers;
    })();
    return layers;
  };

  const upsertAnnotationData = (annotation: AnnotationData) => {
    const storeAny = annotationStore as any;
    if (typeof storeAny.upsertAnnotation === 'function') {
      storeAny.upsertAnnotation(annotation);
    } else {
      annotationStore.addAnnotation(annotation);
    }
  };

  const removeExampleAnnotation = () => {
    annotationStore.removeLayer(EXAMPLE_ANNOTATION_ID);
    const storeAny = annotationStore as any;
    if (typeof storeAny.removeAnnotation === 'function') {
      storeAny.removeAnnotation(EXAMPLE_ANNOTATION_ID);
    }
  };

  const buildExampleAnnotation = (type: AnnotationType): AnnotationData => {
    const baseConfig = {
      width: 18,
      position: 'right',
      showLegend: true,
      minValue: 0,
      maxValue: 100,
      colorScheme: ['#1d4ed8', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']
    };

    if (type === 'HEATMAP') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-热图',
        type,
        data: Object.fromEntries(
          Object.entries(SPECIES_META).map(([name, meta]) => [name, { value: meta.score }])
        ),
        config: { ...baseConfig, minValue: 0, maxValue: 1, width: 20 }
      };
    }

    if (type === 'BARCHART') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-条形图',
        type,
        data: Object.fromEntries(
          Object.entries(SPECIES_META).map(([name, meta]) => [name, { value: meta.abundance, color: meta.color }])
        ),
        config: { ...baseConfig, minValue: 0, maxValue: 100, width: 36 }
      };
    }

    if (type === 'BINARY') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-二进制',
        type,
        data: Object.fromEntries(
          Object.entries(SPECIES_META).map(([name, meta]) => [name, { value: meta.binary, color: meta.color }])
        ),
        config: { ...baseConfig, width: 14 }
      };
    }

    if (type === 'PIECHART') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-饼图',
        type,
        data: Object.fromEntries(
          Object.entries(SPECIES_META).map(([name, meta]) => [name, {
            values: meta.pie,
            colors: ['#ef4444', '#06b6d4', '#22c55e']
          }])
        ),
        config: { ...baseConfig, radius: 6, width: 20, showLegend: false }
      };
    }

    if (type === 'STRIP') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-条带',
        type,
        data: Object.fromEntries(
          Object.entries(SPECIES_META).map(([name, meta]) => [name, { value: meta.group, color: meta.color }])
        ),
        config: { ...baseConfig, width: 26 }
      };
    }

    return {
      id: EXAMPLE_ANNOTATION_ID,
      name: `示例注释-${type}`,
      type,
      data: Object.fromEntries(
        Object.entries(SPECIES_META).map(([name, meta]) => [name, { value: meta.group, color: meta.color }])
      ),
      config: { ...baseConfig, width: 18 }
    };
  };

  const upsertExampleAnnotationLayer = (type: AnnotationType) => {
    const annotation = buildExampleAnnotation(type);
    upsertAnnotationData(annotation);

    const layers = getLayerSnapshot();
    const existed = layers.find(layer => layer.id === annotation.id);

    if (existed) {
      annotationStore.updateLayer(annotation.id, {
        name: annotation.name,
        type: annotation.type,
        data: annotation,
        config: annotation.config || {},
        visible: true
      });
    } else {
      annotationStore.addLayer({
        id: annotation.id,
        name: annotation.name,
        type: annotation.type,
        data: annotation,
        visible: true,
        order: layers.length,
        config: annotation.config || {}
      });
    }

    dispatch('annotationLoaded', annotation);
  };

  $: if (exampleTreeMode) {
    upsertExampleAnnotationLayer(annotationType);
  }

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    file = target.files[0];
    error = null;
    loading = true;

    try {
      if (uploadType === 'tree') {
        exampleTreeMode = false;
        removeExampleAnnotation();

        const text = await file.text();
        const tree = parser.parseNewick(text);
        treeStore.setTree(tree);
        treeStore.setLoading(false);
        dispatch('treeLoaded', tree);
        dispatch('fileUploaded', file);
      } else {
        const text = await file.text();
        const annotation = parser.parseAnnotation(text, annotationType);
        upsertAnnotationData(annotation);

        const layers = getLayerSnapshot();
        annotationStore.addLayer({
          id: annotation.id,
          name: annotation.name,
          type: annotation.type,
          data: annotation,
          visible: true,
          order: layers.length,
          config: annotation.config || {}
        });

        dispatch('annotationLoaded', annotation);
        dispatch('fileUploaded', file);
      }
    } catch (err) {
      error = `读取失败: ${err instanceof Error ? err.message : '未知错误'}`;
      console.error('File read error:', err);
    } finally {
      loading = false;
    }
  };

  const loadExampleTree = async () => {
    loading = true;
    error = null;

    try {
      const tree = parser.parseNewick(EXAMPLE_NEWICK);
      treeStore.setTree(tree);
      treeStore.setLoading(false);
      dispatch('treeLoaded', tree);

      exampleTreeMode = true;
      upsertExampleAnnotationLayer(annotationType);
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

  <div class="mb-3">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="block text-xs text-gray-400 mb-1">
      {uploadType === 'tree' ? '示例注释类型（实时生效）' : '注释类型'}
    </label>
    <select
      class="w-full text-xs bg-gray-700 text-gray-300 rounded p-1"
      bind:value={annotationType}
    >
      {#each ANNOTATION_OPTIONS as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="mb-3">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label class="block text-xs text-gray-400 mb-1">
      {uploadType === 'tree' ? '选择树文件 (Newick)' : '选择注释文件 (JSON)'}
    </label>
    <input
      type="file"
      class="w-full text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:border-0 file:bg-gray-700 file:text-gray-300"
      on:change={handleFileChange}
    />
    {#if file}
      <p class="text-xs text-gray-400 mt-1">{file.name}{loading ? ' - 读取中...' : ''}</p>
    {/if}
  </div>

  {#if error}
    <p class="text-xs text-red-400 mb-3">{error}</p>
  {/if}

  <div class="flex gap-2">
    {#if uploadType === 'tree'}
      <button
        class="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-white py-1 px-2 rounded disabled:opacity-50"
        on:click={loadExampleTree}
        disabled={loading}
      >
        加载示例树+注释
      </button>
    {/if}
  </div>
</div>
