import { writable, derived } from 'svelte/store';
import type { AnnotationData, Layer, AnnotationConfig } from '../types/annotation';

// 创建注释状态存储
const createAnnotationStore = () => {
  const { subscribe, set, update } = writable<{
    annotations: AnnotationData[];
    layers: Layer[];
    loading: boolean;
    error: string | null;
  }>({
    annotations: [],
    layers: [],
    loading: false,
    error: null
  });

  return {
    subscribe,
    // 添加注释数据
    addAnnotation: (annotation: AnnotationData) => update(state => ({
      ...state,
      annotations: [...state.annotations, annotation]
    })),
    upsertAnnotation: (annotation: AnnotationData) => update(state => {
      const exists = state.annotations.some(item => item.id === annotation.id);
      return {
        ...state,
        annotations: exists
          ? state.annotations.map(item => item.id === annotation.id ? annotation : item)
          : [...state.annotations, annotation]
      };
    }),
    // 添加图层
    addLayer: (layer: Layer) => update(state => ({
      ...state,
      layers: [...state.layers, layer].sort((a, b) => a.order - b.order)
    })),
    // 更新图层
    updateLayer: (layerId: string, updates: Partial<Layer>) => update(state => ({
      ...state,
      layers: state.layers.map(layer =>
        layer.id === layerId ? { ...layer, ...updates } : layer
      )
    })),
    // 移除图层
    removeLayer: (layerId: string) => update(state => ({
      ...state,
      layers: state.layers.filter(layer => layer.id !== layerId)
    })),
    removeAnnotation: (annotationId: string) => update(state => ({
      ...state,
      annotations: state.annotations.filter(annotation => annotation.id !== annotationId)
    })),
    // 调整图层顺序
    reorderLayers: (layerId: string, newOrder: number) => update(state => {
      const layers = [...state.layers];
      const layerIndex = layers.findIndex(layer => layer.id === layerId);
      if (layerIndex === -1) return state;

      const [movedLayer] = layers.splice(layerIndex, 1);
      layers.splice(newOrder, 0, movedLayer);

      // 更新所有图层的顺序
      return {
        ...state,
        layers: layers.map((layer, index) => ({ ...layer, order: index }))
      };
    }),
    // 设置加载状态
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    // 设置错误
    setError: (error: string | null) => update(state => ({ ...state, error })),
    // 重置状态
    reset: () => set({
      annotations: [],
      layers: [],
      loading: false,
      error: null
    })
  };
};

export const annotationStore = createAnnotationStore();

// 派生状态：可见图层数量
export const visibleLayerCount = derived(annotationStore, $annotationStore =>
  $annotationStore.layers.filter(layer => layer.visible).length
);
