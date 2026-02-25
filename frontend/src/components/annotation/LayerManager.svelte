<script lang="ts">
  import { onDestroy } from 'svelte';
  import { annotationStore } from '../../stores/annotationStore';
  import { uiStore } from '../../stores/uiStore';
  import type { Layer } from '../../types/annotation';

  let layers: Layer[] = [];
  let theme: 'dark' | 'light' = 'dark';

  // 订阅图层状态
  const unsubscribeAnnotation = annotationStore.subscribe($annotationStore => {
    layers = $annotationStore.layers;
  });

  // 订阅主题状态，使图层管理面板在亮/暗色下保持一致视觉
  const unsubscribeUI = uiStore.subscribe($uiStore => {
    theme = $uiStore.theme;
  });

  onDestroy(() => {
    unsubscribeAnnotation();
    unsubscribeUI();
  });

  // 切换图层可见性
  const toggleLayerVisibility = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
      annotationStore.updateLayer(layerId, { visible: !layer.visible });
    }
  };

  // 移除图层
  const removeLayer = (layerId: string) => {
    annotationStore.removeLayer(layerId);
  };

  // 调整图层顺序
  const moveLayerUp = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.order > 0) {
      annotationStore.reorderLayers(layerId, layer.order - 1);
    }
  };

  const moveLayerDown = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer && layer.order < layers.length - 1) {
      annotationStore.reorderLayers(layerId, layer.order + 1);
    }
  };
</script>

<div>
  {#if layers.length === 0}
    <p class={`text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-400'}`}>暂无图层</p>
  {:else}
    <div class="space-y-2">
      {#each layers as layer}
        <div
          class={`p-2 rounded flex items-center justify-between gap-2 ${
            theme === 'light'
              ? 'bg-slate-100 border border-slate-200'
              : 'bg-gray-700/80 border border-gray-600/70'
          }`}
        >
          <div class="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              class="h-3 w-3 rounded border border-gray-400/60"
              checked={layer.visible}
              on:change={() => toggleLayerVisibility(layer.id)}
            />
            <span
              class={`text-xs truncate max-w-[126px] ${
                theme === 'light' ? 'text-slate-800' : 'text-gray-200'
              }`}
              title={layer.name}
            >
              {layer.name}
            </span>
            <span class={`text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-gray-400'}`}>
              ({layer.type})
            </span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              class={`text-[11px] px-1 rounded disabled:opacity-40 ${
                theme === 'light'
                  ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                  : 'text-gray-400 hover:text-white hover:bg-gray-600/80'
              }`}
              on:click={() => moveLayerUp(layer.id)}
              disabled={layer.order === 0}
              title="上移图层"
            >
              ↑
            </button>
            <button
              class={`text-[11px] px-1 rounded disabled:opacity-40 ${
                theme === 'light'
                  ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                  : 'text-gray-400 hover:text-white hover:bg-gray-600/80'
              }`}
              on:click={() => moveLayerDown(layer.id)}
              disabled={layer.order === layers.length - 1}
              title="下移图层"
            >
              ↓
            </button>
            <button
              class={`text-[11px] px-1 rounded ${
                theme === 'light'
                  ? 'text-rose-500 hover:text-rose-600 hover:bg-rose-50'
                  : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
              }`}
              on:click={() => removeLayer(layer.id)}
              title="移除图层"
            >
              ×
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
