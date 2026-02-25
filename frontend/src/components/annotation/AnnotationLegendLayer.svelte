<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { annotationStore } from '../../stores/annotationStore';
  import { uiStore } from '../../stores/uiStore';
  import { treeStore } from '../../stores/treeStore';
  import type { Layer } from '../../types/annotation';
  import type { Tree, TreeNode } from '../../types/tree';

  type LegendRow = {
    key: string;
    nodeIds: string[];
    label: string;
    searchText: string;
    color: string;
    selected: boolean;
    count: number;
  };

  let layers: Layer[] = [];
  let selectedNodes: string[] = [];
  let searchQuery = '';
  let annotationOnlySelected = false;
  let annotationRowsPerPage = 80;
  let annotationPage = 1;
  let tree: Tree | null = null;
  let theme: 'dark' | 'light' = 'dark';
  let collapsedLayerIds = new Set<string>();

  let overlayEl: HTMLDivElement | null = null;
  let panelEl: HTMLDivElement | null = null;
  let panelX = 24;
  let panelY = 24;
  let dragging = false;
  let dragMouseStart = { x: 0, y: 0 };
  let dragPanelStart = { x: 0, y: 0 };

  const unsubscribeAnnotation = annotationStore.subscribe(state => {
    layers = [...state.layers].sort((a, b) => a.order - b.order);
  });
  const unsubscribeUI = uiStore.subscribe(state => {
    selectedNodes = state.selectedNodes;
    searchQuery = state.searchQuery;
    annotationOnlySelected = state.annotationOnlySelected;
    annotationRowsPerPage = state.annotationRowsPerPage;
    annotationPage = state.annotationPage;
    theme = state.theme;
  });
  const unsubscribeTree = treeStore.subscribe(state => {
    tree = state.tree;
  });

  const nodeNameById = new Map<string, string>();
  const nodeIdByName = new Map<string, string>();

  const rebuildTreeIndex = (root: TreeNode | null | undefined) => {
    nodeNameById.clear();
    nodeIdByName.clear();
    if (!root) return;

    const stack: TreeNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      nodeNameById.set(node.id, node.name || '');
      if (node.name) {
        nodeIdByName.set(node.name, node.id);
      }
      if (node.children?.length) {
        node.children.forEach(child => stack.push(child));
      }
    }
  };

  $: rebuildTreeIndex(tree?.root);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const resetPanelToTopRight = () => {
    if (!overlayEl || !panelEl) return;
    const margin = 16;
    const maxX = Math.max(0, overlayEl.clientWidth - panelEl.offsetWidth - margin);
    panelX = maxX;
    panelY = margin;
  };

  const startDrag = (event: PointerEvent) => {
    dragging = true;
    dragMouseStart = { x: event.clientX, y: event.clientY };
    dragPanelStart = { x: panelX, y: panelY };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || !overlayEl || !panelEl) return;
    const dx = event.clientX - dragMouseStart.x;
    const dy = event.clientY - dragMouseStart.y;
    const maxX = Math.max(0, overlayEl.clientWidth - panelEl.offsetWidth);
    const maxY = Math.max(0, overlayEl.clientHeight - panelEl.offsetHeight);
    panelX = clamp(dragPanelStart.x + dx, 0, maxX);
    panelY = clamp(dragPanelStart.y + dy, 0, maxY);
  };

  const onPointerUp = () => {
    dragging = false;
  };

  const selectedNodeSet = () => new Set(selectedNodes);

  const resolveNodeIds = (key: string): string[] => {
    const ids = new Set<string>();
    if (nodeNameById.has(key)) ids.add(key);
    const byName = nodeIdByName.get(key);
    if (byName) ids.add(byName);
    return [...ids];
  };

  const rowIsSelected = (rowKey: string, resolvedNodeIds: string[]): boolean => {
    if (selectedNodes.length === 0) return false;
    const selectedSet = selectedNodeSet();
    if (resolvedNodeIds.some(id => selectedSet.has(id))) return true;
    if (selectedSet.has(rowKey)) return true;
    if (nodeIdByName.has(rowKey)) {
      const id = nodeIdByName.get(rowKey);
      return Boolean(id && selectedSet.has(id));
    }
    return false;
  };

  const formatSearchText = (raw: any): string => {
    if (raw == null) return '';
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      return String(raw);
    }
    if (Array.isArray(raw.values)) {
      return raw.values.join('/');
    }
    if ('value' in raw) {
      return String(raw.value ?? '');
    }
    const compact = JSON.stringify(raw);
    return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  };

  const getRowColor = (layer: Layer, raw: any): string => {
    if (typeof raw?.color === 'string') return raw.color;
    if (layer.type === 'BINARY') {
      return Number(raw?.value) > 0 ? '#22c55e' : '#475569';
    }
    if (layer.type === 'HEATMAP') {
      const value = Number(raw?.value);
      const ratio = Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
      const hue = Math.round(220 - ratio * 170);
      return `hsl(${hue}, 78%, 56%)`;
    }
    if (layer.type === 'PIECHART' && Array.isArray(raw?.colors) && raw.colors.length > 0) {
      return raw.colors[0];
    }
    return '#94a3b8';
  };

  const getNodeRows = (layer: Layer, dataEntries: Array<[string, any]>): LegendRow[] => {
    return dataEntries.map(([key, raw]) => {
      const nodeIds = resolveNodeIds(key);
      const selected = rowIsSelected(key, nodeIds);
      const firstNodeId = nodeIds[0];
      return {
        key,
        nodeIds,
        label: firstNodeId ? (nodeNameById.get(firstNodeId) || key) : key,
        searchText: formatSearchText(raw),
        color: getRowColor(layer, raw),
        selected,
        count: 1
      };
    });
  };

  const getCategoricalRows = (layer: Layer, dataEntries: Array<[string, any]>): LegendRow[] => {
    const groups = new Map<string, { label: string; color: string; nodeIds: Set<string>; entryCount: number }>();

    dataEntries.forEach(([key, raw]) => {
      const category = String(raw?.value ?? raw?.group ?? 'Unknown');
      const nodeIds = resolveNodeIds(key);
      const groupKey = category || 'Unknown';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          label: groupKey,
          color: getRowColor(layer, raw),
          nodeIds: new Set<string>(),
          entryCount: 0
        });
      }

      const group = groups.get(groupKey)!;
      group.entryCount += 1;
      nodeIds.forEach(id => group.nodeIds.add(id));
      if (typeof raw?.color === 'string') {
        group.color = raw.color;
      }
    });

    return [...groups.entries()]
      .map(([groupKey, group]) => {
        const nodeIds = [...group.nodeIds];
        const count = Math.max(group.entryCount, nodeIds.length);
        return {
          key: `category:${groupKey}`,
          nodeIds,
          label: group.label,
          searchText: `${group.label} ${count}`,
          color: group.color,
          selected: rowIsSelected(groupKey, nodeIds),
          count
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  const getNumericBinnedRows = (layer: Layer, dataEntries: Array<[string, any]>): LegendRow[] => {
    const values = dataEntries
      .map(([key, raw]) => ({ key, raw, value: Number(raw?.value), nodeIds: resolveNodeIds(key) }))
      .filter(item => Number.isFinite(item.value));

    if (values.length === 0) return [];

    const cfgMin = Number(layer.data?.config?.minValue);
    const cfgMax = Number(layer.data?.config?.maxValue);
    const observedMin = Math.min(...values.map(item => item.value));
    const observedMax = Math.max(...values.map(item => item.value));
    const min = Number.isFinite(cfgMin) ? cfgMin : observedMin;
    const max = Number.isFinite(cfgMax) ? cfgMax : observedMax;
    const span = Math.max(1e-9, max - min);
    const binCount = 4;

    const palette = layer.type === 'HEATMAP'
      ? ['#1e3a8a', '#1d4ed8', '#06b6d4', '#22c55e']
      : ['#1e40af', '#2563eb', '#f59e0b', '#ef4444'];

    const bins = Array.from({ length: binCount }, (_, index) => ({
      index,
      start: min + (span * index) / binCount,
      end: min + (span * (index + 1)) / binCount,
      nodeIds: new Set<string>(),
      entryCount: 0
    }));

    values.forEach(item => {
      const ratio = (item.value - min) / span;
      const idx = clamp(Math.floor(ratio * binCount), 0, binCount - 1);
      const bin = bins[idx];
      bin.entryCount += 1;
      item.nodeIds.forEach(id => bin.nodeIds.add(id));
    });

    const formatNum = (value: number) => (Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(2));

    return bins
      .filter(bin => bin.entryCount > 0)
      .map(bin => {
        const nodeIds = [...bin.nodeIds];
        const label = `${formatNum(bin.start)} - ${formatNum(bin.end)}`;
        const count = Math.max(nodeIds.length, bin.entryCount);
        return {
          key: `bin:${layer.type}:${bin.index}`,
          nodeIds,
          label,
          searchText: `${label} ${count}`,
          color: palette[bin.index],
          selected: rowIsSelected(label, nodeIds),
          count
        };
      });
  };

  const getLayerRows = (layer: Layer): LegendRow[] => {
    const dataEntries = Object.entries(layer.data?.data || {});

    let rows: LegendRow[] =
      layer.type === 'COLORSTRIP'
        ? getCategoricalRows(layer, dataEntries)
        : (layer.type === 'HEATMAP' || layer.type === 'BARCHART')
          ? getNumericBinnedRows(layer, dataEntries)
          : getNodeRows(layer, dataEntries);

    if (selectedNodes.length > 0 && !annotationOnlySelected) {
      rows = rows.sort((a, b) => Number(b.selected) - Number(a.selected));
    }

    if (annotationOnlySelected && selectedNodes.length > 0) {
      rows = rows.filter(row => row.selected);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(row =>
        row.label.toLowerCase().includes(q) ||
        row.key.toLowerCase().includes(q) ||
        row.searchText.toLowerCase().includes(q)
      );
    }

    return rows;
  };

  const getPagedRows = (rows: LegendRow[]): LegendRow[] => {
    const totalPages = Math.max(1, Math.ceil(rows.length / annotationRowsPerPage));
    const safePage = Math.min(annotationPage, totalPages);
    const start = (safePage - 1) * annotationRowsPerPage;
    return rows.slice(start, start + annotationRowsPerPage);
  };

  const selectLegendRow = (row: LegendRow) => {
    if (!row.nodeIds.length) return;
    const ids = [...new Set(row.nodeIds)];
    uiStore.setSelectionHighlightColor(row.color);
    if (ids.length === 1) {
      uiStore.selectNode(ids[0]);
      return;
    }
    uiStore.clearSelection();
    ids.forEach((id, index) => uiStore.selectNode(id, index > 0));
    uiStore.setSelectionHighlightColor(row.color);
  };

  const toggleLayerCollapsed = (layerId: string) => {
    const next = new Set(collapsedLayerIds);
    if (next.has(layerId)) {
      next.delete(layerId);
    } else {
      next.add(layerId);
    }
    collapsedLayerIds = next;
  };

  onMount(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    requestAnimationFrame(() => {
      resetPanelToTopRight();
    });
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    unsubscribeAnnotation();
    unsubscribeUI();
    unsubscribeTree();
  });
</script>
{#if layers.filter(layer => layer.visible).length > 0}
<div bind:this={overlayEl} class="absolute inset-0 z-20 pointer-events-none">
  <div
    bind:this={panelEl}
    class={`pointer-events-auto absolute w-[340px] max-w-[92vw] rounded-lg border shadow-lg backdrop-blur-sm ${theme === 'light' ? 'border-slate-300 bg-white/94' : 'border-gray-700/70 bg-gray-900/82'}`}
    style={`left:${panelX}px; top:${panelY}px;`}
  >
    <div
      class={`h-2.5 cursor-move border-b ${theme === 'light' ? 'border-slate-200 bg-slate-100/90' : 'border-gray-700/60 bg-gray-800/70'}`}
      role="button"
      tabindex="0"
      on:pointerdown={startDrag}
      on:keydown={() => {}}
      title="拖拽移动图例"
    ></div>

    
      <div class="max-h-[62vh] overflow-auto p-3 space-y-3">
        {#each layers.filter(layer => layer.visible) as layer}
          {@const rows = getLayerRows(layer)}
          {@const pageRows = getPagedRows(rows)}
          {@const isCollapsed = collapsedLayerIds.has(layer.id)}
          <section class="space-y-1.5">
            <div class="flex items-center justify-between gap-2 px-1">
              <div class={`text-[10px] tracking-wide uppercase truncate ${theme === 'light' ? 'text-slate-500' : 'text-gray-300'}`}>
                {layer.name}
              </div>
              <button
                type="button"
                class={`text-[10px] px-1 rounded ${
                  theme === 'light'
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
                }`}
                title={isCollapsed ? '展开图例' : '收起图例'}
                on:click={() => toggleLayerCollapsed(layer.id)}
              >
                {isCollapsed ? '展开' : '收起'}
              </button>
            </div>
            {#if !isCollapsed}
              {#if pageRows.length === 0}
                <div class={`px-1 text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'}`}>当前筛选下无图例项</div>
              {:else}
                <div class="space-y-1">
                  {#each pageRows as row}
                    <button
                      class={`w-full inline-flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] transition-colors ${
                        row.selected
                          ? (theme === 'light'
                            ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                            : 'border-cyan-400/70 bg-cyan-500/20 text-cyan-50')
                          : (theme === 'light'
                            ? 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            : 'border-gray-600/70 bg-gray-800/65 text-gray-100 hover:border-gray-500 hover:bg-gray-700/75')
                      }`}
                      on:click={() => selectLegendRow(row)}
                      title={`${row.label} · ${row.count}项${row.searchText ? ` · ${row.searchText}` : ''}${row.nodeIds.length > 0 ? ' · 点击联动到树节点' : ' · 无法定位到树节点'}`}
                    >
                      <span
                        class={`inline-block h-2.5 w-2.5 rounded-sm ${row.selected ? (theme === 'light' ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-white' : 'ring-2 ring-cyan-200/70 ring-offset-1 ring-offset-gray-900') : ''}`}
                        style={`background:${row.color};`}
                      ></span>
                      <span class="truncate flex-1 text-left">{row.label}</span>
                      <span class={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>{row.count}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </section>
        {/each}
      </div>
    </div>
  </div>
{/if}
