<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { annotationStore } from '../../stores/annotationStore';
  import { uiStore } from '../../stores/uiStore';
  import { treeStore } from '../../stores/treeStore';
  import type { Layer } from '../../types/annotation';
  import type { Tree, TreeNode } from '../../types/tree';

  type LegendRow = {
    key: string;
    nodeId: string | null;
    label: string;
    searchText: string;
    color: string;
    selected: boolean;
  };

  let layers: Layer[] = [];
  let selectedNodes: string[] = [];
  let searchQuery = '';
  let annotationOnlySelected = false;
  let annotationRowsPerPage = 80;
  let annotationPage = 1;
  let tree: Tree | null = null;

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

  const resolveNodeId = (key: string): string | null => {
    if (nodeNameById.has(key)) return key;
    return nodeIdByName.get(key) || null;
  };

  const rowIsSelected = (rowKey: string, resolvedNodeId: string | null): boolean => {
    if (selectedNodes.length === 0) return false;
    const selectedSet = selectedNodeSet();
    if (resolvedNodeId && selectedSet.has(resolvedNodeId)) return true;
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

  const getLayerRows = (layer: Layer): LegendRow[] => {
    const dataEntries = Object.entries(layer.data?.data || {});
    let rows: LegendRow[] = dataEntries.map(([key, raw]) => {
      const nodeId = resolveNodeId(key);
      const selected = rowIsSelected(key, nodeId);
      return {
        key,
        nodeId,
        label: nodeId ? (nodeNameById.get(nodeId) || key) : key,
        searchText: formatSearchText(raw),
        color: getRowColor(layer, raw),
        selected
      };
    });

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
    if (!row.nodeId) return;
    uiStore.selectNode(row.nodeId);
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

<div bind:this={overlayEl} class="absolute inset-0 z-20 pointer-events-none">
  <div
    bind:this={panelEl}
    class="pointer-events-auto absolute w-[360px] max-w-[92vw] rounded-lg border border-gray-700/70 bg-gray-900/82 shadow-lg backdrop-blur-sm"
    style={`left:${panelX}px; top:${panelY}px;`}
  >
    <div
      class="h-2.5 cursor-move border-b border-gray-700/60 bg-gray-800/70"
      role="button"
      tabindex="0"
      on:pointerdown={startDrag}
      on:keydown={() => {}}
      title="拖拽移动图例"
    ></div>

    <div class="max-h-[62vh] overflow-auto p-3 space-y-3">
      {#if layers.filter(layer => layer.visible).length === 0}
        <div class="text-xs text-gray-400">暂无可见图例</div>
      {:else}
        {#each layers.filter(layer => layer.visible) as layer}
          {@const rows = getLayerRows(layer)}
          {@const pageRows = getPagedRows(rows)}
          <section class="space-y-1.5">
            <div class="px-1 text-[10px] tracking-wide uppercase text-gray-300 truncate">{layer.name}</div>
            {#if pageRows.length === 0}
              <div class="px-1 text-[11px] text-gray-500">当前筛选下无图例项</div>
            {:else}
              <div class="flex flex-wrap gap-1.5">
                {#each pageRows as row}
                  <button
                    class={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      row.selected
                        ? 'border-cyan-400/70 bg-cyan-500/20 text-cyan-50'
                        : 'border-gray-600/70 bg-gray-800/65 text-gray-100 hover:border-gray-500 hover:bg-gray-700/75'
                    }`}
                    on:click={() => selectLegendRow(row)}
                    title={`${row.label}${row.searchText ? ` · ${row.searchText}` : ''}${row.nodeId ? ' · 点击联动到树节点' : ' · 无法定位到树节点'}`}
                  >
                    <span
                      class={`inline-block h-2.5 w-2.5 rounded-full ${row.selected ? 'ring-2 ring-cyan-200/70 ring-offset-1 ring-offset-gray-900' : ''}`}
                      style={`background:${row.color};`}
                    ></span>
                    <span class="truncate max-w-[210px]">{row.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      {/if}
    </div>
  </div>
</div>
