<script lang="ts">
  import { annotationStore } from '../../stores/annotationStore';
  import type { Layer } from '../../types/annotation';

  let layers: Layer[] = [];

  // 订阅图层状态
  const unsubscribe = annotationStore.subscribe($annotationStore => {
    layers = $annotationStore.layers;
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

<div class="bg-gray-800 p-3 rounded-lg shadow-md">
  <h3 class="text-sm font-medium text-gray-300 mb-3">图层管理</h3>
  
  {#if layers.length === 0}
    <p class="text-xs text-gray-400">暂无图层</p>
  {:else}
    <div class="space-y-2">
      {#each layers as layer}
        <div class="bg-gray-700 p-2 rounded flex items-center justify-between">
          <div class="flex items-center gap-2">
            <input
              type="checkbox"
              class="h-3 w-3 rounded"
              checked={layer.visible}
              on:change={() => toggleLayerVisibility(layer.id)}
            />
            <span class="text-xs text-gray-300">{layer.name}</span>
            <span class="text-xs text-gray-500">({layer.type})</span>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="text-xs text-gray-400 hover:text-white"
              on:click={() => moveLayerUp(layer.id)}
              disabled={layer.order === 0}
            >
              ↑
            </button>
            <button
              class="text-xs text-gray-400 hover:text-white"
              on:click={() => moveLayerDown(layer.id)}
              disabled={layer.order === layers.length - 1}
            >
              ↓
            </button>
            <button
              class="text-xs text-gray-400 hover:text-red-400"
              on:click={() => removeLayer(layer.id)}
            >
              ×
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
