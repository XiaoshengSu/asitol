import { writable, derived } from 'svelte/store';
import type { RenderMode } from '../types/layout';
import { treeStore } from './treeStore';

// 创建界面状态存储
const createUIStore = () => {
  const { subscribe, set, update } = writable<{
    sidebarVisible: boolean;
    layersPanelVisible: boolean;
    propertiesPanelVisible: boolean;
    zoom: number;
    pan: { x: number; y: number };
    selectedNodes: string[];
    searchQuery: string;
    annotationOnlySelected: boolean;
    annotationRowsPerPage: number;
    annotationPage: number;
    showLabels: boolean;
    branchColor: string;
    branchColorMode: 'single' | 'clade';
  }>({
    sidebarVisible: true,
    layersPanelVisible: true,
    propertiesPanelVisible: false,
    zoom: 1,
    pan: { x: 0, y: 0 },
    selectedNodes: [],
    searchQuery: '',
    annotationOnlySelected: false,
    annotationRowsPerPage: 80,
    annotationPage: 1,
    showLabels: true,
    branchColor: '#8f96a3',
    branchColorMode: 'clade'
  });

  const getLongestLeafNameLength = (node: any): number => {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) {
      return (node.name || '').length;
    }

    let maxLength = 0;
    for (const child of node.children) {
      maxLength = Math.max(maxLength, getLongestLeafNameLength(child));
    }
    return maxLength;
  };

  return {
    subscribe,

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
        
        // 使用实际的画布中心，从树的布局配置中获取
        let canvasCenterX = 400; // 默认值
        let canvasCenterY = 300; // 默认值
        
        // 获取当前树的状态来获取实际的画布大小
        let treeState: any;
        treeStore.subscribe(state => treeState = state)();
        
        if (treeState?.layoutConfig) {
          canvasCenterX = (treeState.layoutConfig.width || 800) / 2;
          canvasCenterY = (treeState.layoutConfig.height || 600) / 2;
        }
        
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
      let treeState: any;
      treeStore.subscribe(state => treeState = state)();
      
      // 计算居中位置
      let panX = 0;
      let panY = 0;
      let zoom = 1;
      
      if (treeState?.layoutResult?.bounds && treeState?.layoutConfig) {
        const { bounds } = treeState.layoutResult;
        const canvasWidth = Math.max(1, treeState.layoutConfig.width || 800);
        const canvasHeight = Math.max(1, treeState.layoutConfig.height || 600);
        const isRectangular = treeState.layoutConfig.type === 'rectangular';

        let leftExtra = 24;
        let rightExtra = 24;
        let topExtra = 24;
        let bottomExtra = 24;

        if (isRectangular) {
          const longestLeafName = getLongestLeafNameLength(treeState?.tree?.root);
          rightExtra = Math.min(420, Math.max(180, 44 + longestLeafName * 7));
          leftExtra = 16;
          topExtra = 20;
          bottomExtra = 20;
        }

        const contentWidth = Math.max(1, bounds.width + leftExtra + rightExtra);
        const contentHeight = Math.max(1, bounds.height + topExtra + bottomExtra);
        const fitScaleX = canvasWidth / contentWidth;
        const fitScaleY = canvasHeight / contentHeight;
        zoom = Math.min(1, fitScaleX, fitScaleY) * 0.98;

        const contentMinX = bounds.minX - leftExtra;
        const contentMinY = bounds.minY - topExtra;
        const contentCenterX = contentMinX + contentWidth / 2;
        const contentCenterY = contentMinY + contentHeight / 2;
        
        // 计算居中的平移值
        panX = canvasWidth / 2 - contentCenterX * zoom;
        panY = canvasHeight / 2 - contentCenterY * zoom;
      }
      
      return update(state => ({ 
        ...state, 
        zoom, 
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
    setSearchQuery: (query: string) => update(state => ({
      ...state,
      searchQuery: query,
      annotationPage: 1
    })),
    setAnnotationOnlySelected: (onlySelected: boolean) => update(state => ({
      ...state,
      annotationOnlySelected: onlySelected,
      annotationPage: 1
    })),
    setAnnotationRowsPerPage: (rowsPerPage: number) => update(state => ({
      ...state,
      annotationRowsPerPage: Math.max(10, Math.floor(rowsPerPage)),
      annotationPage: 1
    })),
    setAnnotationPage: (page: number) => update(state => ({
      ...state,
      annotationPage: Math.max(1, Math.floor(page))
    })),
    nextAnnotationPage: () => update(state => ({
      ...state,
      annotationPage: state.annotationPage + 1
    })),
    prevAnnotationPage: () => update(state => ({
      ...state,
      annotationPage: Math.max(1, state.annotationPage - 1)
    })),
    // 切换标签显示
    toggleLabels: () => update(state => ({ ...state, showLabels: !state.showLabels })),
    // 设置标签显示状态
    setShowLabels: (show: boolean) => update(state => ({ ...state, showLabels: show })),
    // 设置树枝颜色
    setBranchColor: (color: string) => update(state => ({ ...state, branchColor: color })),
    // 设置树枝配色模式
    setBranchColorMode: (mode: 'single' | 'clade') => update(state => ({ ...state, branchColorMode: mode })),
    // 重置状态
    reset: () => set({
      sidebarVisible: true,
      layersPanelVisible: true,
      propertiesPanelVisible: false,
      zoom: 1,
      pan: { x: 0, y: 0 },
      selectedNodes: [],
      searchQuery: '',
      annotationOnlySelected: false,
      annotationRowsPerPage: 80,
      annotationPage: 1,
      showLabels: true,
      branchColor: '#8f96a3',
      branchColorMode: 'clade'
    })
  };
};

export const uiStore = createUIStore();

// 派生状态：是否有选中节点
export const hasSelectedNodes = derived(uiStore, $uiStore =>
  $uiStore.selectedNodes.length > 0
);
