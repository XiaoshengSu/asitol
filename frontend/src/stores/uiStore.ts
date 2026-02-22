import { writable, derived } from 'svelte/store';
import type { RenderMode } from '../types/layout';
import { treeStore } from './treeStore';

// 创建界面状态存储
const createUIStore = () => {
  const { subscribe, set, update } = writable<{
    renderMode: RenderMode;
    sidebarVisible: boolean;
    layersPanelVisible: boolean;
    propertiesPanelVisible: boolean;
    zoom: number;
    pan: { x: number; y: number };
    selectedNodes: string[];
    searchQuery: string;
    showLabels: boolean;
    branchColor: string;
  }>({
    renderMode: 'svg',
    sidebarVisible: true,
    layersPanelVisible: true,
    propertiesPanelVisible: false,
    zoom: 1,
    pan: { x: 0, y: 0 },
    selectedNodes: [],
    searchQuery: '',
    showLabels: true,
    branchColor: '#8f96a3'
  });

  return {
    subscribe,
    // 更新渲染模式
    setRenderMode: (mode: RenderMode | ((currentMode: RenderMode) => RenderMode)) => update(state => {
      if (typeof mode === 'function') {
        return { ...state, renderMode: mode(state.renderMode) };
      }
      return { ...state, renderMode: mode };
    }),
    // 切换侧边栏可见性
    toggleSidebar: () => update(state => ({ ...state, sidebarVisible: !state.sidebarVisible })),
    // 切换图层面板可见性
    toggleLayersPanel: () => update(state => ({ ...state, layersPanelVisible: !state.layersPanelVisible })),
    // 切换属性面板可见性
    togglePropertiesPanel: () => update(state => ({ ...state, propertiesPanelVisible: !state.propertiesPanelVisible })),
    // 更新缩放级别
    setZoom: (zoom: number | ((currentZoom: number) => number)) => update(state => {
      if (typeof zoom === 'function') {
        const newZoom = zoom(state.zoom);
        // 计算缩放比例的变化
        const zoomRatio = newZoom / state.zoom;
        
        // 假设画布中心为默认值，实际使用时可以根据需要调整
        const canvasCenterX = 400; // 假设画布宽度为800
        const canvasCenterY = 300; // 假设画布高度为600
        
        // 计算新的平移位置，使缩放围绕画布中心进行
        const newPanX = canvasCenterX - (canvasCenterX - state.pan.x) * zoomRatio;
        const newPanY = canvasCenterY - (canvasCenterY - state.pan.y) * zoomRatio;
        
        return { 
          ...state, 
          zoom: newZoom,
          pan: { x: newPanX, y: newPanY }
        };
      }
      return { ...state, zoom };
    }),
    // 更新平移位置
    setPan: (pan: { x: number; y: number } | ((currentPan: { x: number; y: number }) => { x: number; y: number })) => update(state => {
      if (typeof pan === 'function') {
        return { ...state, pan: pan(state.pan) };
      }
      return { ...state, pan };
    }),
    // 重置视图
    resetView: () => {
      // 先计算树的边界
      treeStore.calculateTreeBounds();
      
      // 获取当前树的状态
      let treeState;
      treeStore.subscribe(state => treeState = state)();
      
      // 计算居中位置
      let panX = 100;
      let panY = 100;
      
      if (treeState?.layoutResult?.bounds) {
        const { bounds } = treeState.layoutResult;
        const canvasWidth = treeState.layoutConfig.width;
        const canvasHeight = treeState.layoutConfig.height;
        
        // 计算居中的平移值
        panX = (canvasWidth - bounds.width) / 2 - bounds.minX;
        panY = (canvasHeight - bounds.height) / 2 - bounds.minY;
      }
      
      return update(state => ({ 
        ...state, 
        zoom: 1, 
        pan: { x: panX, y: panY }
      }));
    },
    // 选择节点
    selectNode: (nodeId: string, multiSelect: boolean = false) => update(state => ({
      ...state,
      selectedNodes: multiSelect
        ? [...state.selectedNodes, nodeId]
        : [nodeId]
    })),
    // 取消选择节点
    deselectNode: (nodeId: string) => update(state => ({
      ...state,
      selectedNodes: state.selectedNodes.filter(id => id !== nodeId)
    })),
    // 清空选择
    clearSelection: () => update(state => ({ ...state, selectedNodes: [] })),
    // 设置搜索查询
    setSearchQuery: (query: string) => update(state => ({ ...state, searchQuery: query })),
    // 切换标签显示
    toggleLabels: () => update(state => ({ ...state, showLabels: !state.showLabels })),
    // 设置标签显示状态
    setShowLabels: (show: boolean) => update(state => ({ ...state, showLabels: show })),
    // 设置树枝颜色
    setBranchColor: (color: string) => update(state => ({ ...state, branchColor: color })),
    // 重置状态
    reset: () => set({
      renderMode: 'svg',
      sidebarVisible: true,
      layersPanelVisible: true,
      propertiesPanelVisible: false,
      zoom: 1,
      pan: { x: 0, y: 0 },
      selectedNodes: [],
      searchQuery: '',
      showLabels: true,
      branchColor: '#8f96a3'
    })
  };
};

export const uiStore = createUIStore();

// 派生状态：是否有选中节点
export const hasSelectedNodes = derived(uiStore, $uiStore =>
  $uiStore.selectedNodes.length > 0
);
