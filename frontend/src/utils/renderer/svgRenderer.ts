import * as d3 from 'd3';
import type { Tree, LayoutResult } from '../../types/tree';
import type { RenderConfig } from '../../types/layout';
import { uiStore } from '../../stores/uiStore';
import { buildCladeColorMap, ensureContrast } from './colors';
import { findNodeById, isLeafNode } from './treeUtils';

export class SVGRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g: d3.Selection<SVGGElement, unknown, null, undefined>;
  private renderTimeout: number | null = null;

  constructor(container: HTMLElement, config: RenderConfig) {
    this.svg = d3.select(container)
      .append('svg')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('background-color', config.backgroundColor || '#242424')
      .attr('viewBox', `0 0 ${config.width} ${config.height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    this.g = this.svg.append('g');
  }

  render(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    this.renderTimeout = window.setTimeout(() => {
      this.doRender(tree, layoutResult, config);
    }, 50);
  }

  private getSelectedNodeSet(): Set<string> {
    if (typeof uiStore === 'undefined') {
      return new Set<string>();
    }

    let selectedNodes: string[] = [];
    uiStore.subscribe(state => {
      selectedNodes = state.selectedNodes;
    })();

    return new Set(selectedNodes);
  }

  private applySelectedNodeStyles(baseRadius: number): void {
    const selectedNodeSet = this.getSelectedNodeSet();

    this.g.selectAll<SVGCircleElement, [string, { x: number; y: number }]>('.node')
      .attr('stroke', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? '#ff4d4f' : 'transparent')
      .attr('stroke-width', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? 3 : 2)
      .attr('r', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? baseRadius * 1.45 : baseRadius);
  }

  private doRender(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    this.g.selectAll('*').remove();

    const centerX = config.width / 2;
    const centerY = config.height / 2;

    const nodeCount = Object.keys(layoutResult.nodes).length;
    const isLargeTree = nodeCount > 500;
    const useCladeColors = config.branchColorMode !== 'single' && (tree.root.children?.length || 0) > 1;
    const cladeColorMap = useCladeColors ? buildCladeColorMap(tree, config.branchColor || '#8f96a3') : null;

    const nodeSize = isLargeTree ? Math.max(1, (config.nodeSize || 4) * 0.6) : (config.nodeSize || 4);
    const baseBranchWidth = isLargeTree ? Math.max(0.5, (config.branchWidth || 1) * 0.8) : (config.branchWidth || 1);
    
    // 计算每个节点的深度层级
    const nodeDepth = new Map<string, number>();
    const maxDepth = this.calculateNodeDepths(tree.root, 0, nodeDepth);
    const depthRange = Math.max(1, maxDepth);
    
    // 调试：检查 nodeDepth 映射是否正确填充
    console.log('Node depths:', Array.from(nodeDepth.entries()).slice(0, 10));
    console.log('Max depth:', maxDepth);
    console.log('Tree root:', tree.root);
    console.log('First 5 links:', layoutResult.links.slice(0, 5));

    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, baseBranchWidth, cladeColorMap, nodeDepth, maxDepth);
      return;
    }

    // 计算所有布局的叶节点
    const leafNodeIds = new Set(Object.keys(layoutResult.nodes).filter(id => isLeafNode(tree.root, id)));
    
    // 为圆形和径向布局计算叶节点
    const circularLeafIds = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? leafNodeIds
      : new Set<string>();

    const labelDirection = new Map<string, { angle: number; ux: number; uy: number }>();
    if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
      const parentById = new Map<string, string>();
      layoutResult.links.forEach(link => parentById.set(link.target, link.source));
      Object.entries(layoutResult.nodes).forEach(([id, pos]) => {
        const parentId = parentById.get(id);
        const parentPos = parentId ? layoutResult.nodes[parentId] : null;
        if (parentPos) {
          // 有父节点时，基于父节点方向
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 无父节点时（根节点），基于中心方向
          const dx = pos.x - centerX;
          const dy = pos.y - centerY;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        }
      });
    }

    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];

        if (layoutResult.type === 'rectangular') {
          // 按照参考效果图的方式绘制矩形树树枝
          // 所有树枝都是直角分叉，水平线段朝右
          
          // 检查目标节点是否为叶节点
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 对于叶节点，确保有一个水平向右的线段
            // 计算水平线段的终点x坐标，确保朝右
            const horizontalEndX = Math.max(source.x, target.x) + 30; // 额外增加30px，确保有足够空间显示标签
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 对于非叶节点，使用正常的直角分叉
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'circular') {
          // 对于圆形布局，使用矩形分叉
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }
        
        if (layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
          // 对于径向和无根布局，使用直线分支
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
      })
      .attr('stroke', d => {
        if (cladeColorMap) {
          const color = cladeColorMap.get(d.target) || cladeColorMap.get(d.source) || (config.branchColor || '#888');
          return ensureContrast(color);
        }
        return ensureContrast(config.branchColor || '#888');
      })
      .attr('stroke-width', d => {
        // 基于目标节点深度计算树枝宽度，根节点最粗，叶节点最细
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / depthRange);
        // 使用更明显的宽度变化范围
        const minWidth = baseBranchWidth * 0.5;
        const maxWidth = baseBranchWidth * 2;
        return Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
      })
      .attr('stroke-opacity', (layoutResult.type === 'circular' || layoutResult.type === 'radial') ? 0.75 : 1)
      .attr('fill', 'none');

    const allNodes = Object.entries(layoutResult.nodes);
    const circularLeafNodes = allNodes.filter(([id]) => leafNodeIds.has(id));

    const nodeData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') && circularLeafNodes.length > 300
      ? allNodes.filter(([id]) => !isLeafNode(tree.root, id))
      : allNodes;

    // 为每个节点添加选中状态
    this.g.selectAll('.node')
      .data(nodeData)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('data-node-id', d => d[0])
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', nodeSize)
      .attr('fill', config.nodeColor || '#fff')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        // 先移除可能存在的旧tooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 创建工具提示元素
        const tooltip = d3.select('body')
          .append('div')
          .attr('class', 'tree-tooltip')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('padding', '8px 12px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('z-index', '1000')
          .style('pointer-events', 'none')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
        
        // 获取节点信息
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>节点名称:</strong> ${node.name || '未命名'}</div>
            <div><strong>节点ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>子节点数:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>分支长度:</strong> ${node.length}</div>` : ''}
            <div><small>点击节点以该节点为中心放大</small></div>
            <div><small>点击空白处重置缩放</small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 鼠标悬停时高亮节点
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', nodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 更新工具提示位置
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 移除所有tooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 恢复节点原始样式
        this.applySelectedNodeStyles(nodeSize);
      })
      .on('click', (event, d) => {
        // 以选中节点为中心放大
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 高亮选中的节点
        this.applySelectedNodeStyles(nodeSize);
        
        // 更新uiStore中的选中状态

        // 阻止事件冒泡，确保选中状态不被其他事件覆盖
        event.preventDefault();
      });

    this.applySelectedNodeStyles(nodeSize);
    
    // 添加点击空白处重置缩放的功能
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 更新 uiStore 中的状态，重置缩放和平移
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 如果 uiStore 不可用，直接应用变换
          this.updateTransform('');
        }
        // 保持选中状态，只重置缩放
        // 注意：这里不恢复节点样式，因为可能有节点被选中
      });

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      // 默认只显示叶节点标签，避免重叠
    let labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? this.selectCircularLabels(circularLeafNodes, centerX, centerY, isLargeTree)
      : circularLeafNodes; // 矩形布局只显示叶节点
    
    // 对于矩形布局，进一步优化标签密度
    if (layoutResult.type === 'rectangular') {
      labelData = this.optimizeRectangularLabels(labelData, isLargeTree);
    }

      this.g.selectAll('.label')
        .data(labelData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', '#fff')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', () => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            return this.getCircularLabelFontSize(labelData.length, isLargeTree);
          } else {
            // 矩形布局根据叶节点数量调整字体大小，使用更小的字体以避免重叠
            if (labelData.length > 300) return '4px';
            if (labelData.length > 150) return '5px';
            if (labelData.length > 80) return '6px';
            if (labelData.length > 40) return '7px';
            return isLargeTree ? '8px' : '10px';
          }
        })
        .attr('text-anchor', () => 'start')
        .attr('x', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const x = d[1].x;
            const y = d[1].y;
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const ux = dir ? dir.ux : Math.cos(Math.atan2(y - centerY, x - centerX));
            return x + offset * ux;
          } else if (layoutResult.type === 'rectangular') {
            // 对于矩形树，将标签放在分支末端右侧
            return d[1].x + 35; // 额外增加35px，确保标签在分支末端右侧
          }
          return d[1].x + 8;
        })
        .attr('y', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const x = d[1].x;
            const y = d[1].y;
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const uy = dir ? dir.uy : Math.sin(Math.atan2(y - centerY, x - centerX));
            return y + offset * uy;
          } else if (layoutResult.type === 'rectangular') {
            // 对于矩形树，将标签垂直居中于分支
            return d[1].y;
          }
          return d[1].y + 3;
        })
        .attr('transform', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const x = d[1].x;
            const y = d[1].y;
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const angle = dir ? dir.angle : Math.atan2(y - centerY, x - centerX);
            const ux = dir ? dir.ux : Math.cos(angle);
            const uy = dir ? dir.uy : Math.sin(angle);
            const labelX = x + offset * ux;
            const labelY = y + offset * uy;
            const rotation = angle * (180 / Math.PI);
            return `rotate(${rotation}, ${labelX}, ${labelY})`;
          }
          return '';
        })
        .text(d => {
          const node = findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }
    
    // 渲染完成后，根据 uiStore 中的选中状态重新应用高亮效果
    if (typeof uiStore !== 'undefined') {
      setTimeout(() => {
        let selectedNodes: string[] = [];
        uiStore.subscribe(state => selectedNodes = state.selectedNodes)();
        
        if (selectedNodes.length > 0) {
          // 高亮选中的节点
          selectedNodes.forEach(nodeId => {
            // 这里可以通过其他方式实现节点高亮
            // 由于我们没有直接的方法来获取节点元素，我们可以通过数据绑定来实现
            // 注意：这种方法可能需要进一步优化
          });
        }
      }, 50);
    }

  }

  private renderLargeTree(
    tree: Tree,
    layoutResult: LayoutResult,
    config: RenderConfig,
    centerX: number,
    centerY: number,
    nodeSize: number,
    branchWidth: number,
    cladeColorMap: Map<string, string> | null,
    nodeDepth: Map<string, number>,
    maxDepth: number
  ): void {
    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];

        if (layoutResult.type === 'circular') {
          // 对于圆形布局，使用矩形分叉
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }

        if (layoutResult.type === 'rectangular') {
          // 按照参考效果图的方式绘制矩形树树枝
          // 所有树枝都是直角分叉，水平线段朝右
          
          // 检查目标节点是否为叶节点
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 对于叶节点，确保有一个水平向右的线段
            // 计算水平线段的终点x坐标，确保朝右
            const horizontalEndX = Math.max(source.x, target.x) + 30; // 额外增加30px，确保有足够空间显示标签
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 对于非叶节点，使用正常的直角分叉
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'radial') {
          // 对于径向布局，使用直线分支
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
      })
      .attr('stroke', d => {
        if (cladeColorMap) {
          const color = cladeColorMap.get(d.target) || cladeColorMap.get(d.source) || (config.branchColor || '#888');
          return ensureContrast(color);
        }
        return ensureContrast(config.branchColor || '#888');
      })
      .attr('stroke-width', d => {
        // 基于目标节点深度计算树枝宽度，根节点最粗，叶节点最细
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / Math.max(1, maxDepth));
        // 使用更明显的宽度变化范围
        const minWidth = branchWidth * 0.4;
        const maxWidth = branchWidth * 1.6;
        return Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
      })
      .attr('fill', 'none');

    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const largeTreeNodeData = layoutResult.type === 'circular' && leafNodes.length > 300 ? [] : leafNodes;

    // 为大型树的节点添加交互效果
    const largeNodeSize = nodeSize * 0.8;
    this.g.selectAll('.node')
      .data(largeTreeNodeData)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('data-node-id', d => d[0])
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', largeNodeSize)
      .attr('fill', config.nodeColor || '#fff')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        // 先移除可能存在的旧tooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 创建工具提示元素
        const tooltip = d3.select('body')
          .append('div')
          .attr('class', 'tree-tooltip')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', 'white')
          .style('padding', '8px 12px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('z-index', '1000')
          .style('pointer-events', 'none')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
        
        // 获取节点信息
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>节点名称:</strong> ${node.name || '未命名'}</div>
            <div><strong>节点ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>子节点数:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>分支长度:</strong> ${node.length}</div>` : ''}
            <div><small>点击节点以该节点为中心放大</small></div>
            <div><small>点击空白处重置缩放</small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 鼠标悬停时高亮节点
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', largeNodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 更新工具提示位置
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 移除所有tooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 恢复节点原始样式
        this.applySelectedNodeStyles(largeNodeSize);
      })
      .on('click', (event, d) => {
        // 以选中节点为中心放大
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 高亮选中的节点
        this.applySelectedNodeStyles(largeNodeSize);
        
        // 更新uiStore中的选中状态

        // 阻止事件冒泡，确保选中状态不被其他事件覆盖
        event.preventDefault();
      });
    
    // 添加点击空白处重置缩放的功能
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 更新 uiStore 中的状态，重置缩放和平移
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 如果 uiStore 不可用，直接应用变换
          this.updateTransform('');
        }
        // 保持选中状态，只重置缩放
        // 注意：这里不恢复节点样式，因为可能有节点被选中
      });

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    const labelDirection = new Map<string, { angle: number; ux: number; uy: number }>();
    if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
      const parentById = new Map<string, string>();
      layoutResult.links.forEach(link => parentById.set(link.target, link.source));
      Object.entries(layoutResult.nodes).forEach(([id, pos]) => {
        const parentId = parentById.get(id);
        const parentPos = parentId ? layoutResult.nodes[parentId] : null;
        if (parentPos) {
          // 有父节点时，基于父节点方向
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 无父节点时（根节点），基于中心方向
          const dx = pos.x - centerX;
          const dy = pos.y - centerY;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        }
      });
    }

    if (showLabels && (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')) {
      const sampledLabels = this.selectCircularLabels(leafNodes, centerX, centerY, true);

      this.g.selectAll('.label')
        .data(sampledLabels)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', '#fff')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', this.getCircularLabelFontSize(leafNodes.length, true))
        .attr('text-anchor', () => 'start')
        .attr('x', d => {
          const x = d[1].x;
          const y = d[1].y;
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const ux = dir ? dir.ux : Math.cos(Math.atan2(y - centerY, x - centerX));
          return x + offset * ux;
        })
        .attr('y', d => {
          const x = d[1].x;
          const y = d[1].y;
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const uy = dir ? dir.uy : Math.sin(Math.atan2(y - centerY, x - centerX));
          return y + offset * uy;
        })
        .attr('transform', d => {
          const x = d[1].x;
          const y = d[1].y;
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const angle = dir ? dir.angle : Math.atan2(y - centerY, x - centerX);
          const ux = dir ? dir.ux : Math.cos(angle);
          const uy = dir ? dir.uy : Math.sin(angle);
          const labelX = x + offset * ux;
          const labelY = y + offset * uy;
          const rotation = angle * (180 / Math.PI);
          return `rotate(${rotation}, ${labelX}, ${labelY})`;
        })
        .text(d => {
          const node = findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }

    this.applySelectedNodeStyles(largeNodeSize);
  }

  private selectCircularLabels(
    nodes: Array<[string, { x: number; y: number }]>,
    centerX: number,
    centerY: number,
    isLargeTree: boolean
  ): Array<[string, { x: number; y: number }]> {
    if (nodes.length <= 240) return nodes;

    const radius = nodes.reduce((sum, [, pos]) => sum + Math.hypot(pos.x - centerX, pos.y - centerY), 0) / nodes.length;
    const minLabelArc = isLargeTree ? 5 : 8;
    const minAngleGap = minLabelArc / Math.max(1, radius);

    const sorted = nodes
      .slice()
      .sort((a, b) => Math.atan2(a[1].y - centerY, a[1].x - centerX) - Math.atan2(b[1].y - centerY, b[1].x - centerX));

    const result: Array<[string, { x: number; y: number }]> = [];
    let lastAngle = -Infinity;

    for (const node of sorted) {
      const angle = Math.atan2(node[1].y - centerY, node[1].x - centerX);
      if (angle - lastAngle >= minAngleGap) {
        result.push(node);
        lastAngle = angle;
      }
    }

    return result;
  }

  private getCircularLabelFontSize(labelCount: number, isLargeTree: boolean): string {
    if (labelCount > 800) return '6px';
    if (labelCount > 400) return '7px';
    return isLargeTree ? '8px' : '10px';
  }

  private getCircularLabelOffset(isLargeTree: boolean): number {
    return isLargeTree ? 10 : 12;
  }

  private shortestArcSweep(sourceAngle: number, targetAngle: number): number {
    let delta = targetAngle - sourceAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
  }

  updateTransform(transform: string): void {
    this.g.attr('transform', transform);
  }

  resize(width: number, height: number): void {
    this.svg.attr('width', width).attr('height', height);
  }

  /**
   * 递归计算每个节点的深度层级
   * @param node 当前节点
   * @param depth 当前深度
   * @param nodeDepth 存储节点深度的映射
   * @returns 最大深度值
   */
  private calculateNodeDepths(
    node: any,
    depth: number,
    nodeDepth: Map<string, number>
  ): number {
    // 确保节点有 id 属性
    if (node.id) {
      nodeDepth.set(node.id, depth);
    }
    
    if (!node.children || node.children.length === 0) {
      return depth;
    }
    
    let maxChildDepth = depth;
    for (const child of node.children) {
      const childDepth = this.calculateNodeDepths(child, depth + 1, nodeDepth);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }
    
    return maxChildDepth;
  }

  /**
   * 优化矩形树的标签密度，避免标签重叠
   * @param labels 原始标签数据
   * @param isLargeTree 是否为大型树
   * @returns 优化后的标签数据
   */
  private optimizeRectangularLabels(
    labels: Array<[string, { x: number; y: number }]>,
    isLargeTree: boolean
  ): Array<[string, { x: number; y: number }]> {
    // 对于大型树，采用最激进的标签限制策略
    if (labels.length > 100) {
      // 只保留约40个标签，确保可读性
      const maxLabels = 40;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 60) {
      // 中型树，保留约50个标签
      const maxLabels = 50;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 30) {
      // 小型树，保留约60个标签
      const maxLabels = 60;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    }
    
    // 按 Y 坐标排序标签
    const sortedLabels = [...labels].sort((a, b) => a[1].y - b[1].y);
    
    // 采样标签，确保垂直方向上有足够间距
    const optimizedLabels: Array<[string, { x: number; y: number }]> = [];
    // 大幅增加最小垂直间距，确保标签不重叠
    const minYSpacing = isLargeTree ? 20 : 25;
    let lastY = -Infinity;
    
    for (const label of sortedLabels) {
      const y = label[1].y;
      if (y - lastY >= minYSpacing) {
        optimizedLabels.push(label);
        lastY = y;
      }
    }
    
    return optimizedLabels;
  }

  /**
   * 以选中节点为中心进行区域放大
   * @param nodeId 选中节点的ID
   * @param layoutResult 布局结果
   * @param config 渲染配置
   */
  private zoomToNode(
    nodeId: string,
    layoutResult: LayoutResult,
    config: RenderConfig
  ): void {
    const nodePos = layoutResult.nodes[nodeId];
    if (!nodePos) return;
    
    const centerX = config.width / 2;
    const centerY = config.height / 2;
    
    // 计算平移量，使选中节点成为中心
    const translateX = centerX - nodePos.x;
    const translateY = centerY - nodePos.y;
    
    // 计算缩放比例，放大2倍
    const scale = 2;
    
    // 先更新 uiStore 中的选中状态
    if (typeof uiStore !== 'undefined') {
      uiStore.selectNode(nodeId);
    }
    
    // 然后更新缩放和平移状态
    if (typeof uiStore !== 'undefined') {
      // 计算新的缩放和平移状态
      const newZoom = scale;
      const newPan = { x: translateX, y: translateY };
      
      // 更新 uiStore 状态
      uiStore.setZoom(newZoom);
      uiStore.setPan(newPan);
    } else {
      // 如果 uiStore 不可用，直接应用变换
      const transform = `translate(${translateX}, ${translateY}) scale(${scale})`;
      this.updateTransform(transform);
    }
    
    // 保持选中节点的高亮状态
    // 注意：由于我们是在SVG变换层面进行缩放，节点的DOM元素并没有改变
    // 所以选中状态会自动保持，不需要额外操作
  }
}
