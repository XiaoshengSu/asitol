<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { treeStore } from '../../stores/treeStore';
  import { annotationStore } from '../../stores/annotationStore';
  import { uiStore } from '../../stores/uiStore';
  import { parser } from '../../utils/parser';
  import type { Tree } from '../../types/tree';
  import type { AnnotationData, AnnotationType } from '../../types/annotation';

  const dispatch = createEventDispatcher<{
    fileUploaded: File;
    treeLoaded: Tree;
    annotationLoaded: AnnotationData;
  }>();

  const EXAMPLE_ANNOTATION_ID = 'example_annotation';
  const AUTO_ANNOTATION_ID = 'auto_annotation';
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
  let theme: 'dark' | 'light' = 'dark';
  let isDragOver = false;

  const unsubscribeTree = treeStore.subscribe(state => {
    currentTree = state.tree;
  });

  const unsubscribeUI = uiStore.subscribe(state => {
    theme = state.theme;
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

  const removeAutoAnnotation = () => {
    annotationStore.removeLayer(AUTO_ANNOTATION_ID);
    const storeAny = annotationStore as any;
    if (typeof storeAny.removeAnnotation === 'function') {
      storeAny.removeAnnotation(AUTO_ANNOTATION_ID);
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

  const getCategoryColor = (index: number): string => {
    const palette = [
      '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9',
      '#6366f1', '#a855f7', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e'
    ];
    return palette[index % palette.length];
  };

  const normalizeGroupLabel = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return 'Other';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

  const inferGroupFromLeafName = (name: string): string => {
    const normalized = name.trim();
    if (!normalized) return 'Other';

    // 优先提取首个有意义词元（如属名/前缀）
    const tokens = normalized
      .split(/[\s_|:;,-]+/)
      .map(token => token.replace(/[^A-Za-z0-9]/g, ''))
      .filter(Boolean);

    const alphaToken = tokens.find(token => /^[A-Za-z]{3,}$/.test(token));
    if (alphaToken) return normalizeGroupLabel(alphaToken);

    const firstToken = tokens[0] || normalized;
    if (/^[A-Za-z]+$/.test(firstToken)) {
      return normalizeGroupLabel(firstToken.slice(0, Math.min(6, firstToken.length)));
    }

    const alnum = firstToken.replace(/[^A-Za-z0-9]/g, '');
    return alnum ? `Cluster-${alnum.slice(0, 3).toUpperCase()}` : 'Other';
  };

  const collectLeafProfiles = (tree: Tree): Array<{ id: string; name: string; distance: number }> => {
    const profiles: Array<{ id: string; name: string; distance: number }> = [];

    const walk = (node: any, cumulativeDistance: number) => {
      const ownDistance = cumulativeDistance + Math.max(0, Number(node?.branchLength ?? 0));
      const isLeaf = !node?.children || node.children.length === 0;
      if (isLeaf) {
        profiles.push({
          id: node.id,
          name: (node.name || node.id || '').trim() || `leaf_${profiles.length + 1}`,
          distance: ownDistance
        });
        return;
      }

      node.children.forEach((child: any) => walk(child, ownDistance));
    };

    walk(tree.root, 0);
    return profiles;
  };

  /**
   * 基于树拓扑结构自动划分类群分组（不依赖名称），用于更专业的默认色带。
   * 返回：leafId -> groupLabel 的映射；若无法得到合理分组则返回空 Map，调用方退回名称分组。
   */
  const buildTopologyGroups = (
    tree: Tree,
    leafProfiles: Array<{ id: string; name: string; distance: number }>
  ): Map<string, string> => {
    const leafIds = new Set(leafProfiles.map(item => item.id));
    if (!tree?.root || leafIds.size === 0) return new Map();

    type NodeInfo = {
      node: any;
      leafCount: number;
      parentId: string | null;
      depth: number;
    };

    const nodeInfoById = new Map<string, NodeInfo>();
    const leafPaths = new Map<string, string[]>(); // leafId -> ancestor id path（root 不必重复存储）

    const walk = (node: any, parentId: string | null, path: string[], depth: number): number => {
      if (!node || !node.id) return 0;

      const currentPath = path;
      let leafCount = 0;

      if (!node.children || node.children.length === 0) {
        if (leafIds.has(node.id)) {
          leafCount = 1;
          leafPaths.set(node.id, currentPath);
        }
      } else {
        const childPath = [...currentPath, node.id];
        node.children.forEach((child: any) => {
          leafCount += walk(child, node.id, childPath, depth + 1);
        });
      }

      nodeInfoById.set(node.id, { node, leafCount, parentId, depth });
      return leafCount;
    };

    const totalLeaves = walk(tree.root, null, [], 0);
    if (totalLeaves <= 0) return new Map();

    // 仅考虑叶子数在 [minLeaves, maxLeaves] 范围内的内部节点作为潜在主类群
    const minLeaves = Math.max(3, Math.floor(totalLeaves / 30));
    const maxLeaves = Math.max(minLeaves, Math.floor(totalLeaves * 0.8));

    const candidates: Array<{ id: string; leafCount: number; depth: number; score: number }> = [];
    nodeInfoById.forEach((info, id) => {
      if (!info.node?.children || info.node.children.length === 0) return;
      if (id === tree.root.id) return;
      if (info.leafCount >= minLeaves && info.leafCount <= maxLeaves) {
        // 更偏好“足够大且更具体”的类群：在叶子数相近时，优先选择更深层的 clade。
        const normalizedDepth = Math.max(1, info.depth);
        const score = info.leafCount * Math.pow(normalizedDepth, 0.6);
        candidates.push({ id, leafCount: info.leafCount, depth: info.depth, score });
      }
    });

    if (candidates.length === 0) {
      return new Map();
    }

    // “更大且更具体”的 clade 优先，限制分组数量以保证图例可读性（最多 8 个）
    candidates.sort((a, b) => b.score - a.score);

    const chosenIds: string[] = [];

    const isAncestor = (maybeAncestorId: string, nodeId: string): boolean => {
      let currentId: string | null = nodeInfoById.get(nodeId)?.parentId ?? null;
      while (currentId) {
        if (currentId === maybeAncestorId) return true;
        currentId = nodeInfoById.get(currentId)?.parentId ?? null;
      }
      return false;
    };

    for (const candidate of candidates) {
      const { id } = candidate;
      let skip = false;
      for (const chosenId of chosenIds) {
        if (isAncestor(chosenId, id) || isAncestor(id, chosenId)) {
          skip = true;
          break;
        }
      }
      if (!skip) {
        chosenIds.push(id);
        if (chosenIds.length >= 8) break;
      }
    }

    // 如果无法形成至少两个非重叠主类群，则交给名称启发式逻辑处理
    if (chosenIds.length < 2) {
      return new Map();
    }

    // 为每个选中的内部节点生成分组名称：优先使用节点自身名称，否则回退到 Clade N
    const labelByNodeId = new Map<string, string>();
    chosenIds.forEach((id, index) => {
      const info = nodeInfoById.get(id);
      const rawName = (info?.node?.name || '').trim();
      const label = rawName || `Clade ${index + 1}`;
      labelByNodeId.set(id, label);
    });

    // 叶子归类：沿着 ancestor path 从下往上寻找最近的已选 clade
    const topologyGroups = new Map<string, string>();
    leafProfiles.forEach(profile => {
      const path = leafPaths.get(profile.id) || [];
      for (let idx = path.length - 1; idx >= 0; idx -= 1) {
        const ancId = path[idx];
        const label = labelByNodeId.get(ancId);
        if (label) {
          topologyGroups.set(profile.id, label);
          return;
        }
      }
    });

    return topologyGroups;
  };

  const buildAutoAnnotation = (tree: Tree, type: AnnotationType): AnnotationData => {
    const leafProfiles = collectLeafProfiles(tree);
    if (leafProfiles.length === 0) {
      return {
        id: AUTO_ANNOTATION_ID,
        name: '默认注释',
        type: 'COLORSTRIP',
        data: {},
        config: { width: 20, showLegend: true }
      };
    }

    const maxDistance = Math.max(...leafProfiles.map(item => item.distance), 0.001);

    // 数值型默认注释：继续使用“根到叶距离”作为默认连续变量，语义清晰为 distance-based
    // （在 UI 文案中不再直接称为“丰度/保守性”，而是强调来自树距离）。

    if (type === 'HEATMAP') {
      return {
        id: AUTO_ANNOTATION_ID,
        name: '注释分组',
        type,
        data: Object.fromEntries(
          leafProfiles.map(item => [item.name, { value: item.distance / maxDistance }])
        ),
        config: {
          width: 20,
          showLegend: true,
          minValue: 0,
          maxValue: 1,
          showTitle: false,
          autoGenerated: true,
          source: 'tree'
        }
      };
    }

    if (type === 'BARCHART') {
      return {
        id: AUTO_ANNOTATION_ID,
        name: '距离型默认注释',
        type,
        data: Object.fromEntries(
          leafProfiles.map(item => [item.name, { value: Math.round((item.distance / maxDistance) * 100) }])
        ),
        config: {
          width: 36,
          showLegend: true,
          minValue: 0,
          maxValue: 100,
          showTitle: false,
          autoGenerated: true,
          source: 'tree'
        }
      };
    }

    // 分类型默认色带：优先基于树拓扑自动识别主类群，不依赖命名；
    // 若无法得到稳定拓扑分组，则退回到基于名称的启发式 grouping。
    const topologyGroups = buildTopologyGroups(tree, leafProfiles);
    const topologyGroupLabels = Array.from(new Set(topologyGroups.values()));
    const useTopologyGroups = topologyGroupLabels.length >= 2;

    const grouped = new Map<string, number>();
    leafProfiles.forEach(item => {
      const topoLabel = topologyGroups.get(item.id);
      const groupLabel = useTopologyGroups && topoLabel
        ? topoLabel
        : inferGroupFromLeafName(item.name);
      grouped.set(groupLabel, (grouped.get(groupLabel) || 0) + 1);
    });

    const sortedGroups = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
    const keptGroups = sortedGroups.slice(0, 10).map(([group]) => group);
    const colorMap = new Map<string, string>();
    keptGroups.forEach((group, idx) => colorMap.set(group, getCategoryColor(idx)));
    colorMap.set('Other', '#94a3b8');

    return {
      id: AUTO_ANNOTATION_ID,
      name: useTopologyGroups ? '拓扑分组色带' : '注释分组',
      type: 'COLORSTRIP',
      data: Object.fromEntries(
        leafProfiles.map(item => {
          const topoLabel = topologyGroups.get(item.id);
          const rawGroup = useTopologyGroups && topoLabel
            ? topoLabel
            : inferGroupFromLeafName(item.name);
          const group = colorMap.has(rawGroup) ? rawGroup : 'Other';
          return [item.name, { value: group, color: colorMap.get(group) || '#94a3b8' }];
        })
      ),
      config: {
        width: 24,
        showLegend: true,
        showTitle: false,
        autoGenerated: true,
        source: 'tree'
      }
    };
  };

  const upsertAutoAnnotationLayer = (tree: Tree, type: AnnotationType) => {
    const annotation = buildAutoAnnotation(tree, type);
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

  const getAnnotationHint = (type: AnnotationType): string => {
    if (type === 'COLORSTRIP') return '用于分类变量分组；无注释文件时可基于标签自动生成默认色带。';
    if (type === 'HEATMAP') return '用于连续变量梯度展示；无注释文件时可基于根到叶距离自动生成。';
    if (type === 'BARCHART') return '用于数量比较；无注释文件时可基于根到叶距离自动生成。';
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

  $: if (!exampleTreeMode && currentTree && syncedAnnotationType !== annotationType) {
    const hasAutoLayer = getLayerSnapshot().some(layer => layer.id === AUTO_ANNOTATION_ID);
    if (hasAutoLayer) {
      upsertAutoAnnotationLayer(currentTree, annotationType);
      syncedAnnotationType = annotationType;
    }
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

  const processFile = async (selectedFile: File) => {
    file = selectedFile;
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

        const layersBefore = getLayerSnapshot();
        const hasUserProvidedLayer = layersBefore.some(layer => layer.id !== EXAMPLE_ANNOTATION_ID && layer.id !== AUTO_ANNOTATION_ID);
        if (!hasUserProvidedLayer) {
          upsertAutoAnnotationLayer(tree, annotationType);
        }

        dispatch('treeLoaded', tree);
        dispatch('fileUploaded', file);
      } else {
        const text = await file.text();
        const annotation = parser.parseAnnotation(text, annotationType);
        removeAutoAnnotation();
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

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    await processFile(target.files[0]);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    isDragOver = true;
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    isDragOver = false;
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    isDragOver = false;
    const dt = event.dataTransfer;
    if (!dt || !dt.files || dt.files.length === 0) return;
    const droppedFile = dt.files[0];
    await processFile(droppedFile);
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
      removeAutoAnnotation();
      upsertExampleAnnotationLayer(annotationType);
      syncedAnnotationType = annotationType;

      // 布局计算会自动触发居中操作，无需手动调用
      // TreeLayout.computeLayout() 会在树数据变化时自动执行
      // 并在计算完成后调用 uiStore.resetView()
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
    removeAutoAnnotation();
    upsertExampleAnnotationLayer(annotationType);
    syncedAnnotationType = annotationType;
  };

  onDestroy(() => {
    unsubscribeTree();
    unsubscribeUI();
  });
</script>

<div class="space-y-2.5">
  <div class={`text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
    <span>上传 Newick 树文件，再按需上传注释；若不上传注释，将自动生成一个默认注释层。</span>
  </div>
  <div class={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>{uploadType === 'tree' ? 'Newick' : 'JSON'}</div>

  <div class={`grid grid-cols-2 gap-2 rounded p-1 ${theme === 'light' ? 'bg-slate-100' : 'bg-gray-900'}`}>
    <button
      class={`text-xs py-1.5 rounded border transition-all ${uploadType === 'tree' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
      on:click={() => switchUploadType('tree')}
    >
      树文件
    </button>
    <button
      class={`text-xs py-1.5 rounded border transition-all ${uploadType === 'annotation' ? (theme === 'light' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-blue-900/40 text-blue-300 border-blue-700') : (theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600')}`}
      on:click={() => switchUploadType('annotation')}
    >
      注释文件
    </button>
  </div>

  <div class="flex gap-2">
    <button
      class={`flex-1 text-xs py-2 rounded border transition-all ${theme === 'light' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-300' : 'bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 border-blue-700'} disabled:opacity-50`}
      on:click={triggerFileSelect}
      disabled={loading}
    >
      {loading ? '读取中...' : (uploadType === 'tree' ? '上传树文件' : '上传注释文件')}
    </button>

    {#if uploadType === 'tree'}
      <button
        class={`text-xs py-2 px-2 rounded border transition-all disabled:opacity-50 whitespace-nowrap ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
        on:click={loadExampleTree}
        disabled={loading}
      >
        示例树
      </button>
      <button
        class={`text-xs py-2 px-2 rounded border transition-all disabled:opacity-50 whitespace-nowrap ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'}`}
        on:click={applyExampleAnnotation}
        disabled={loading || !currentTree}
      >
        套用注释
      </button>
    {/if}
  </div>

  <div
    class={`mt-1 rounded border border-dashed px-3 py-3 text-[11px] cursor-pointer transition-colors ${
      isDragOver
        ? (theme === 'light'
            ? 'border-blue-400 bg-blue-50/80 text-slate-800'
            : 'border-blue-400/80 bg-blue-500/10 text-gray-100')
        : (theme === 'light'
            ? 'border-slate-300/80 bg-white text-slate-500 hover:border-blue-400 hover:bg-blue-50/40'
            : 'border-gray-600/80 bg-gray-800/70 text-gray-400 hover:border-blue-400/70 hover:bg-gray-700/70')
    }`}
    role="button"
    tabindex="0"
    aria-label={uploadType === 'tree' ? '上传或拖拽树文件' : '上传或拖拽注释文件'}
    on:click={triggerFileSelect}
    on:keydown={(event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerFileSelect();
      }
    }}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <div class="flex items-center justify-between gap-3">
      <div class="flex-1">
        <div class="font-medium mb-0.5">
          {uploadType === 'tree' ? '拖拽树文件到此处' : '拖拽注释文件到此处'}或点击区域选择文件。
        </div>
        <div>
          {uploadType === 'tree' ? '支持 .nwk / .newick / .txt' : '支持 .json / .txt'}
        </div>
      </div>
      <div class={`shrink-0 text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
        {loading ? '解析中…' : (file ? file.name : '未选择文件')}
      </div>
    </div>
  </div>

  <input
    bind:this={fileInputEl}
    type="file"
    accept={acceptedFileTypes}
    class="hidden"
    on:change={handleFileChange}
  />

  <div class={`text-[11px] space-y-1 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
    <div>{uploadType === 'tree' ? '支持 .nwk / .newick / .txt' : '支持 .json / .txt'}</div>
    {#if file}
      <div class={`truncate ${theme === 'light' ? 'text-slate-700' : 'text-gray-300'}`}>当前文件: {file.name}</div>
    {/if}
    {#if error}
      <div class="text-red-400">{error}</div>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <span class={`text-[11px] whitespace-nowrap ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>注释方式</span>
    <select
      class={`flex-1 text-xs rounded border p-1.5 ${theme === 'light' ? 'bg-white text-slate-700 border-slate-300' : 'bg-gray-700 text-gray-300 border-gray-600'}`}
      bind:value={annotationType}
    >
      {#each ANNOTATION_OPTIONS as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <div class={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'}`}>{getAnnotationHint(annotationType)}</div>
</div>
