<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
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
    { value: 'COLORSTRIP', label: '类群分组（色带）' },
    { value: 'HEATMAP', label: '保守性/丰度（热图）' },
    { value: 'BARCHART', label: '丰度对比（条形图）' }
  ];

  // 生物学意义的分组
  const EXAMPLE_GROUPS = ['Primates', 'Rodents', 'Carnivora', 'Artiodactyla'];
  const EXAMPLE_GROUP_COLORS: Record<string, string> = {
    Primates: '#ef4444',    // 灵长类
    Rodents: '#1d4ed8',      // 啮齿类
    Carnivora: '#e879f9',    // 食肉目
    Artiodactyla: '#22c55e'  // 偶蹄目
  };
  const DEFAULT_EXAMPLE_LEAVES = ['Human', 'Chimpanzee', 'Gorilla', 'Orangutan', 'Mouse', 'Rat', 'Dog', 'Cat', 'Cow'];

  // 基于生物学分类的分组映射
  const TAXONOMY_GROUP_MAP: Record<string, string> = {
    Human: 'Primates',
    Chimpanzee: 'Primates',
    Gorilla: 'Primates',
    Orangutan: 'Primates',
    Mouse: 'Rodents',
    Rat: 'Rodents',
    Dog: 'Carnivora',
    Cat: 'Carnivora',
    Cow: 'Artiodactyla'
  };

  type ExampleProfile = {
    group: string;
    color: string;
    score: number;
    abundance: number;
  };

  let file: File | null = null;
  let loading = false;
  let error: string | null = null;
  let uploadType: 'tree' | 'annotation' = 'tree';
  let annotationType: AnnotationType = 'COLORSTRIP';
  let exampleTreeMode = false;
  let syncedAnnotationType: AnnotationType = annotationType;
  let fileInputEl: HTMLInputElement | null = null;
  let acceptedFileTypes = '.nwk,.newick,.txt';
  let currentTree: Tree | null = null;

  const unsubscribeTree = treeStore.subscribe(state => {
    currentTree = state.tree;
  });

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

  const collectLeafNames = (node: any, names: string[]) => {
    if (!node) return;
    if (!node.children || node.children.length === 0) {
      names.push((node.name || node.id || '').trim() || `leaf_${names.length + 1}`);
      return;
    }
    node.children.forEach((child: any) => collectLeafNames(child, names));
  };

  const hashSeed = (text: string): number => {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash;
  };

  const buildExampleProfiles = (): Record<string, ExampleProfile> => {
    const leafNames: string[] = [];
    collectLeafNames(currentTree?.root, leafNames);
    const effectiveLeafNames = leafNames.length > 0 ? leafNames : DEFAULT_EXAMPLE_LEAVES;

    return Object.fromEntries(
      effectiveLeafNames.map((name, index) => {
        // 基于生物学分类的分组
        const group = TAXONOMY_GROUP_MAP[name] || 'Unknown';
        const color = EXAMPLE_GROUP_COLORS[group] || '#a855f7';
        
        // 基于分组的有意义数据
        const baseScore = group === 'Primates' ? 0.8 : 
                        group === 'Rodents' ? 0.6 : 
                        group === 'Carnivora' ? 0.7 : 0.5;
        const baseAbundance = group === 'Primates' ? 80 : 
                           group === 'Rodents' ? 60 : 
                           group === 'Carnivora' ? 70 : 50;
        
        const seed = hashSeed(`${name}:${index}`);
        const score = Math.min(0.98, baseScore + ((seed % 100) / 1000));
        const abundance = baseAbundance + (seed % 20);
        
        return [name, { group, color, score, abundance }];
      })
    );
  };

  const getAnnotationHint = (type: AnnotationType): string => {
    if (type === 'COLORSTRIP') return '用于分类变量分组（示例为动物分类学分组）。';
    if (type === 'HEATMAP') return '用于连续变量（基因保守性、丰度、表达量）梯度展示。';
    if (type === 'BARCHART') return '用于样本级数量比较（物种丰度、基因表达、测序深度）。';
    return '';
  };

  const buildExampleAnnotation = (type: AnnotationType): AnnotationData => {
    const profiles = buildExampleProfiles();

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
        name: '示例注释-保守性/丰度热图',
        type,
        data: Object.fromEntries(
          Object.entries(profiles).map(([name, meta]) => [name, { value: meta.score }])
        ),
        config: { ...baseConfig, minValue: 0, maxValue: 1, width: 20 }
      };
    }

    if (type === 'BARCHART') {
      return {
        id: EXAMPLE_ANNOTATION_ID,
        name: '示例注释-丰度条形图',
        type,
        data: Object.fromEntries(
          Object.entries(profiles).map(([name, meta]) => [name, { value: meta.abundance }])
        ),
        config: { ...baseConfig, minValue: 0, maxValue: 100, width: 36 }
      };
    }

    return {
      id: EXAMPLE_ANNOTATION_ID,
      name: '示例注释-色带',
      type: 'COLORSTRIP',
      data: Object.fromEntries(
        Object.entries(profiles).map(([name, meta]) => [name, { value: meta.group, color: meta.color }])
      ),
      config: { ...baseConfig, width: 24 }
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

  $: if (exampleTreeMode && currentTree && syncedAnnotationType !== annotationType) {
    upsertExampleAnnotationLayer(annotationType);
    syncedAnnotationType = annotationType;
  }

  $: acceptedFileTypes = uploadType === 'tree' ? '.nwk,.newick,.txt' : '.json,.txt';

  const switchUploadType = (type: 'tree' | 'annotation') => {
    uploadType = type;
    file = null;
    error = null;
  };

  const triggerFileSelect = () => {
    fileInputEl?.click();
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    file = target.files[0];
    error = null;
    loading = true;

    try {
      if (uploadType === 'tree') {
        exampleTreeMode = false;
        syncedAnnotationType = annotationType;
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
      syncedAnnotationType = annotationType;
    } catch (err) {
      error = `加载示例树失败: ${err instanceof Error ? err.message : '未知错误'}`;
      console.error('Load example tree error:', err);
    } finally {
      loading = false;
    }
  };

  const applyExampleAnnotation = () => {
    if (!currentTree) {
      error = '请先加载树文件后再套用示例注释';
      return;
    }

    error = null;
    exampleTreeMode = true;
    upsertExampleAnnotationLayer(annotationType);
    syncedAnnotationType = annotationType;
  };

  onDestroy(() => {
    unsubscribeTree();
  });
</script>

<div class="space-y-2.5">
  <div class="text-[10px] text-gray-400">{uploadType === 'tree' ? 'Newick' : 'JSON'}</div>

  <div class="grid grid-cols-2 gap-2 rounded bg-gray-900 p-1">
    <button
      class={`text-xs py-1.5 rounded ${uploadType === 'tree' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/80'}`}
      on:click={() => switchUploadType('tree')}
    >
      树文件
    </button>
    <button
      class={`text-xs py-1.5 rounded ${uploadType === 'annotation' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700/80'}`}
      on:click={() => switchUploadType('annotation')}
    >
      注释文件
    </button>
  </div>

  <div class="flex gap-2">
    <button
      class="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-white py-2 rounded disabled:opacity-50"
      on:click={triggerFileSelect}
      disabled={loading}
    >
      {loading ? '读取中...' : (uploadType === 'tree' ? '上传树文件' : '上传注释文件')}
    </button>

    {#if uploadType === 'tree'}
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2 px-2 rounded disabled:opacity-50 whitespace-nowrap"
        on:click={loadExampleTree}
        disabled={loading}
      >
        示例树
      </button>
      <button
        class="text-xs bg-gray-700 hover:bg-gray-600 text-white py-2 px-2 rounded disabled:opacity-50 whitespace-nowrap"
        on:click={applyExampleAnnotation}
        disabled={loading || !currentTree}
      >
        套用注释
      </button>
    {/if}
  </div>

  <input
    bind:this={fileInputEl}
    type="file"
    accept={acceptedFileTypes}
    class="hidden"
    on:change={handleFileChange}
  />

  <div class="text-[11px] text-gray-400 space-y-1">
    <div>{uploadType === 'tree' ? '支持 .nwk / .newick / .txt' : '支持 .json / .txt'}</div>
    {#if file}
      <div class="text-gray-300 truncate">当前文件: {file.name}</div>
    {/if}
    {#if error}
      <div class="text-red-400">{error}</div>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <span class="text-[11px] text-gray-400 whitespace-nowrap">注释方式</span>
    <select
      class="flex-1 text-xs bg-gray-700 text-gray-300 rounded p-1.5"
      bind:value={annotationType}
    >
      {#each ANNOTATION_OPTIONS as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class="text-[10px] text-gray-500">{getAnnotationHint(annotationType)}</div>
</div>
