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
    valueText: string;
    color: string;
    selected: boolean;
  };

  let layers: Layer[] = [];
  let selectedNodes: string[] = [];
  let tree: Tree | null = null;

  let showSelectedOnly = false;
  let searchText = '';
  let rowsPerPage = 80;
  let collapsed = false;
  const pageByLayer: Record<string, number> = {};

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
    if (collapsed) return;
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

  const formatValue = (raw: any): string => {
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
        valueText: formatValue(raw),
        color: getRowColor(layer, raw),
        selected
      };
    });

    if (selectedNodes.length > 0 && !showSelectedOnly) {
      rows = rows.sort((a, b) => Number(b.selected) - Number(a.selected));
    }

    if (showSelectedOnly && selectedNodes.length > 0) {
      rows = rows.filter(row => row.selected);
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter(row =>
        row.label.toLowerCase().includes(q) ||
        row.key.toLowerCase().includes(q) ||
        row.valueText.toLowerCase().includes(q)
      );
    }

    return rows;
  };

  const getLayerPage = (layerId: string) => pageByLayer[layerId] || 1;

  const setLayerPage = (layerId: string, page: number, totalRows: number) => {
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    pageByLayer[layerId] = clamp(page, 1, totalPages);
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
    class="pointer-events-auto absolute w-[360px] max-w-[92vw] rounded-lg border border-gray-600/80 bg-gray-900/92 shadow-xl backdrop-blur-sm"
    style={`left:${panelX}px; top:${panelY}px;`}
  >
    <div
      class="flex items-center justify-between px-3 py-2 border-b border-gray-700 cursor-move select-none"
      role="button"
      tabindex="0"
      on:pointerdown={startDrag}
      on:keydown={() => {}}
    >
      <div class="text-xs font-semibold text-gray-200">注释图例图层</div>
      <div class="flex items-center gap-2">
        <button
          class="text-[11px] text-gray-300 hover:text-white"
          on:click={() => collapsed = !collapsed}
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </div>
    </div>

    {#if !collapsed}
      <div class="p-3 space-y-3">
        <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <input
            class="text-xs bg-gray-800 text-gray-200 rounded px-2 py-1.5 border border-gray-700"
            placeholder="搜索注释项"
            bind:value={searchText}
          />
          <select
            class="text-xs bg-gray-800 text-gray-200 rounded px-2 py-1.5 border border-gray-700"
            bind:value={rowsPerPage}
          >
            <option value={50}>50/页</option>
            <option value={80}>80/页</option>
            <option value={120}>120/页</option>
            <option value={200}>200/页</option>
          </select>
          <label class="text-xs text-gray-300 flex items-center gap-1">
            <input type="checkbox" bind:checked={showSelectedOnly} />
            仅选中
          </label>
        </div>

        {#if selectedNodes.length > 0}
          <div class="text-[11px] text-cyan-300">
            已联动 {selectedNodes.length} 个树节点
          </div>
        {/if}

        {#if layers.filter(layer => layer.visible).length === 0}
          <div class="text-xs text-gray-400">暂无可见注释图层</div>
        {:else}
          <div class="max-h-[58vh] overflow-auto space-y-3 pr-1">
            {#each layers.filter(layer => layer.visible) as layer}
              {@const rows = getLayerRows(layer)}
              {@const totalRows = rows.length}
              {@const currentPage = getLayerPage(layer.id)}
              {@const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))}
              {@const safePage = Math.min(currentPage, totalPages)}
              {@const start = (safePage - 1) * rowsPerPage}
              {@const end = start + rowsPerPage}
              {@const pageRows = rows.slice(start, end)}
              {@const selectedCount = rows.filter(row => row.selected).length}

              <div class="rounded border border-gray-700 bg-gray-800/70">
                <div class="px-2 py-1.5 border-b border-gray-700 flex items-center justify-between">
                  <div class="min-w-0">
                    <div class="text-xs font-medium text-gray-200 truncate">{layer.name}</div>
                    <div class="text-[10px] text-gray-400">{layer.type}</div>
                  </div>
                  <div class="text-[10px] text-gray-400 text-right">
                    <div>{selectedCount}/{totalRows} 联动</div>
                    <div>显示 {pageRows.length}/{totalRows}</div>
                  </div>
                </div>

                {#if totalRows === 0}
                  <div class="px-2 py-2 text-[11px] text-gray-500">当前筛选下无数据</div>
                {:else}
                  <div class="max-h-56 overflow-auto">
                    {#each pageRows as row}
                      <button
                        class={`w-full text-left px-2 py-1.5 border-b border-gray-700/70 last:border-b-0 text-[11px] ${
                          row.selected ? 'bg-cyan-900/35 text-cyan-100' : 'hover:bg-gray-700/70 text-gray-200'
                        }`}
                        on:click={() => selectLegendRow(row)}
                        title={row.nodeId ? '点击联动到树节点' : '无法定位到树节点'}
                      >
                        <div class="flex items-center gap-2">
                          <span class="inline-block h-2.5 w-2.5 rounded-full" style={`background:${row.color};`}></span>
                          <span class="truncate flex-1">{row.label}</span>
                          {#if row.selected}
                            <span class="text-[10px] text-cyan-300">选中</span>
                          {/if}
                        </div>
                        {#if row.valueText}
                          <div class="text-[10px] text-gray-400 truncate">{row.valueText}</div>
                        {/if}
                      </button>
                    {/each}
                  </div>

                  {#if totalPages > 1}
                    <div class="px-2 py-1.5 border-t border-gray-700 flex items-center justify-between text-[11px]">
                      <button
                        class="px-2 py-0.5 rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                        disabled={safePage <= 1}
                        on:click={() => setLayerPage(layer.id, safePage - 1, totalRows)}
                      >
                        上一页
                      </button>
                      <span class="text-gray-400">{safePage}/{totalPages}</span>
                      <button
                        class="px-2 py-0.5 rounded bg-gray-700 text-gray-200 disabled:opacity-40"
                        disabled={safePage >= totalPages}
                        on:click={() => setLayerPage(layer.id, safePage + 1, totalRows)}
                      >
                        下一页
                      </button>
                    </div>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <div class="text-[10px] text-gray-500">
          大数据场景建议使用“搜索 + 仅选中 + 分页”组合，避免一次性渲染全部注释项。
        </div>
      </div>
    {/if}
  </div>
</div>
