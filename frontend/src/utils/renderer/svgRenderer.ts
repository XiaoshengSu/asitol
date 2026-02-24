import * as d3 from 'd3';
import type { Tree, LayoutResult } from '../../types/tree';
import type { RenderConfig } from '../../types/layout';
import type { AnnotationData } from '../../types/annotation';
import { uiStore } from '../../stores/uiStore';
import { annotationStore } from '../../stores/annotationStore';
import { buildCladeColorMap, ensureContrast } from './colors';
import { findNodeById, isLeafNode } from './treeUtils';

export class SVGRenderer {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g: d3.Selection<SVGGElement, unknown, null, undefined>;
  private renderTimeout: number | null = null;
  private baseTransform: string = '';

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
    this.tree = tree;
    this.nodes = layoutResult.nodes;
    this.layoutType = layoutResult.type;
    this.rebuildNodeIndexes(tree);

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

  /**
   * FIX: Compute the true geometric center of all rendered nodes.
   *
   * Annotation layers live inside `this.g` (the same SVG group as the tree nodes),
   * so their coordinates must be in the same node-coordinate space.
   * The bounding-box midpoint of all node positions is the correct center for
   * circular annotation rings, and it is independent of canvas size or zoom state.
   */
  private computeTreeCenter(): { cx: number; cy: number } {
    const allNodes = Object.values(this.nodes || {});
    if (allNodes.length === 0) {
      return { cx: 0, cy: 0 };
    }
    const xs = allNodes.map(p => p.x);
    const ys = allNodes.map(p => p.y);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  private doRender(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    this.g.selectAll('*').remove();
    this.svg.selectAll('.annotation-layer').remove();

    const centerX = config.width / 2;
    const centerY = config.height / 2;

    this.baseTransform = '';
    this.g.attr('transform', '');

    const nodeCount = Object.keys(layoutResult.nodes).length;
    const isLargeTree = nodeCount > 500;
    const useCladeColors = config.branchColorMode !== 'single' && (tree.root.children?.length || 0) > 1;
    const cladeColorMap = useCladeColors ? buildCladeColorMap(tree, config.branchColor || '#8f96a3') : null;

    const nodeSize = isLargeTree ? Math.max(1, (config.nodeSize || 4) * 0.6) : (config.nodeSize || 4);
    const baseBranchWidth = isLargeTree ? Math.max(0.5, (config.branchWidth || 1) * 0.8) : (config.branchWidth || 1);
    
    const nodeDepth = new Map<string, number>();
    const maxDepth = this.calculateNodeDepths(tree.root, 0, nodeDepth);
    const depthRange = Math.max(1, maxDepth);

    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, baseBranchWidth, cladeColorMap, nodeDepth, maxDepth);
      return;
    }

    const leafNodeIds = new Set(Object.keys(layoutResult.nodes).filter(id => isLeafNode(tree.root, id)));
    
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
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
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
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          if (isTargetLeaf) {
            const horizontalEndX = Math.max(source.x, target.x) + 18;
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'circular') {
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }
        
        if (layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
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
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / depthRange);
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
        d3.selectAll('.tree-tooltip').remove();
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
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          tooltip.html(`
            <div><strong>Name:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>Children:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>Length:</strong> ${node.length}</div>` : ''}
            <div><small>Click to zoom in</small></div>
            <div><small>Right click for more options</small></div>
          `);
        }
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', nodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', () => {
        d3.selectAll('.tree-tooltip').remove();
        this.applySelectedNodeStyles(nodeSize);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        this.applySelectedNodeStyles(nodeSize);
        event.preventDefault();
      });

    this.applySelectedNodeStyles(nodeSize);
    
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'none');

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      let labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
        ? this.selectCircularLabels(circularLeafNodes, centerX, centerY, isLargeTree)
        : circularLeafNodes;
    
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
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const ux = dir ? dir.ux : Math.cos(Math.atan2(d[1].y - centerY, d[1].x - centerX));
            return d[1].x + offset * ux;
          } else if (layoutResult.type === 'rectangular') {
            return d[1].x + 22;
          }
          return d[1].x + 8;
        })
        .attr('y', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const uy = dir ? dir.uy : Math.sin(Math.atan2(d[1].y - centerY, d[1].x - centerX));
            return d[1].y + offset * uy;
          } else if (layoutResult.type === 'rectangular') {
            return d[1].y;
          }
          return d[1].y + 3;
        })
        .attr('transform', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const angle = dir ? dir.angle : Math.atan2(d[1].y - centerY, d[1].x - centerX);
            const ux = dir ? dir.ux : Math.cos(angle);
            const uy = dir ? dir.uy : Math.sin(angle);
            const labelX = d[1].x + offset * ux;
            const labelY = d[1].y + offset * uy;
            return `rotate(${angle * (180 / Math.PI)}, ${labelX}, ${labelY})`;
          }
          return '';
        })
        .text(d => {
          const node = findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }
    
    if (config.annotationDisplayMode !== 'legend') {
      this.renderAnnotations(config, cladeColorMap);
    }

    if (typeof uiStore !== 'undefined') {
      setTimeout(() => {
        let selectedNodes: string[] = [];
        uiStore.subscribe(state => selectedNodes = state.selectedNodes)();
        if (selectedNodes.length > 0) {
          selectedNodes.forEach(_nodeId => {});
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
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }

        if (layoutResult.type === 'rectangular') {
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          if (isTargetLeaf) {
            const horizontalEndX = Math.max(source.x, target.x) + 18;
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'radial') {
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
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / Math.max(1, maxDepth));
        const minWidth = branchWidth * 0.4;
        const maxWidth = branchWidth * 1.6;
        return Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
      })
      .attr('fill', 'none');

    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const largeTreeNodeData = layoutResult.type === 'circular' && leafNodes.length > 300 ? [] : leafNodes;

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
        d3.selectAll('.tree-tooltip').remove();
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
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          tooltip.html(`
            <div><strong>Name:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>Children:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>Length:</strong> ${node.length}</div>` : ''}
            <div><small>Click to zoom in</small></div>
            <div><small>Right click for more options</small></div>
          `);
        }
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', largeNodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', () => {
        d3.selectAll('.tree-tooltip').remove();
        this.applySelectedNodeStyles(largeNodeSize);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        this.applySelectedNodeStyles(largeNodeSize);
        event.preventDefault();
      });
    
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'none');

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
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
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
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const ux = dir ? dir.ux : Math.cos(Math.atan2(d[1].y - centerY, d[1].x - centerX));
          return d[1].x + offset * ux;
        })
        .attr('y', d => {
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const uy = dir ? dir.uy : Math.sin(Math.atan2(d[1].y - centerY, d[1].x - centerX));
          return d[1].y + offset * uy;
        })
        .attr('transform', d => {
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const angle = dir ? dir.angle : Math.atan2(d[1].y - centerY, d[1].x - centerX);
          const ux = dir ? dir.ux : Math.cos(angle);
          const uy = dir ? dir.uy : Math.sin(angle);
          const labelX = d[1].x + offset * ux;
          const labelY = d[1].y + offset * uy;
          return `rotate(${angle * (180 / Math.PI)}, ${labelX}, ${labelY})`;
        })
        .text(d => {
          const node = findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }

    if (config.annotationDisplayMode !== 'legend') {
      this.renderAnnotations(config, cladeColorMap);
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
    if (transform) {
      this.g.attr('transform', `${this.baseTransform} ${transform}`);
    } else {
      this.g.attr('transform', this.baseTransform);
    }
  }

  resize(width: number, height: number): void {
    this.svg.attr('width', width).attr('height', height);
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
  }

  private calculateNodeDepths(
    node: any,
    depth: number,
    nodeDepth: Map<string, number>
  ): number {
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

  private optimizeRectangularLabels(
    labels: Array<[string, { x: number; y: number }]>,
    isLargeTree: boolean
  ): Array<[string, { x: number; y: number }]> {
    if (labels.length <= 1) return labels;

    const sortedLabels = [...labels].sort((a, b) => a[1].y - b[1].y);
    const selectedNodeSet = this.getSelectedNodeSet();

    const gaps: number[] = [];
    for (let i = 1; i < sortedLabels.length; i += 1) {
      gaps.push(sortedLabels[i][1].y - sortedLabels[i - 1][1].y);
    }

    const medianGap = this.median(gaps);
    const fontSizePx = isLargeTree ? 8 : 10;
    const requiredSpacing = Math.max(6, fontSizePx * 0.9);
    if (medianGap >= requiredSpacing) {
      return sortedLabels;
    }

    const mustKeep = new Set<string>([
      sortedLabels[0][0],
      sortedLabels[sortedLabels.length - 1][0],
      ...selectedNodeSet
    ]);

    const optimizedLabels: Array<[string, { x: number; y: number }]> = [];
    let lastY = -Infinity;
    for (const label of sortedLabels) {
      const id = label[0];
      const y = label[1].y;
      if (mustKeep.has(id) || y - lastY >= requiredSpacing) {
        optimizedLabels.push(label);
        lastY = y;
      }
    }

    return optimizedLabels;
  }

  private zoomToNode(
    nodeId: string,
    layoutResult: LayoutResult,
    config: RenderConfig
  ): void {
    const nodePos = layoutResult.nodes[nodeId];
    if (!nodePos) return;
    
    const centerX = config.width / 2;
    const centerY = config.height / 2;
    const translateX = centerX - nodePos.x;
    const translateY = centerY - nodePos.y;
    const scale = 2;
    
    if (typeof uiStore !== 'undefined') {
      uiStore.selectNode(nodeId);
      uiStore.setZoom(scale);
      uiStore.setPan({ x: translateX, y: translateY });
    } else {
      this.updateTransform(`translate(${translateX}, ${translateY}) scale(${scale})`);
    }
  }

  private renderAnnotations(config: RenderConfig, cladeColorMap: Map<string, string> | null): void {
    let layers: Array<{ id: string; visible: boolean; order: number; data: AnnotationData }> = [];
    if (typeof annotationStore !== 'undefined') {
      annotationStore.subscribe(state => {
        layers = state.layers as Array<{ id: string; visible: boolean; order: number; data: AnnotationData }>;
      })();
    }

    const visibleLayers = layers
      .filter(layer => layer.visible)
      .sort((a, b) => a.order - b.order);

    visibleLayers.forEach((layer, index) => {
      const annotation = layer.data;
      if (!annotation) return;

      const layerGroup = this.g.append('g')
        .attr('class', `annotation-layer layer-${index}`)
        .attr('data-layer-id', layer.id)
        .attr('opacity', this.clamp(Number(annotation.config?.opacity ?? 1), 0.35, 1));

      if (
        annotation.type === 'COLORSTRIP' ||
        annotation.type === 'STRIP' ||
        annotation.type === 'HEATMAP' ||
        annotation.type === 'BARCHART' ||
        annotation.type === 'PIECHART' ||
        annotation.type === 'BINARY' ||
        annotation.type === 'ALIGNMENT' ||
        annotation.type === 'CONNECTIONS' ||
        annotation.type === 'POPUP'
      ) {
        this.renderColorStrip(layerGroup, annotation, config, cladeColorMap, index, visibleLayers.length);
      }
    });
  }

  private renderColorStrip(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    annotation: AnnotationData,
    config: RenderConfig,
    cladeColorMap: Map<string, string> | null,
    layerIndex: number,
    _layerCount: number
  ): void {
    const configuredWidth = Number(annotation.config?.width ?? 20);
    const trackWidth = this.clamp(Number.isFinite(configuredWidth) ? configuredWidth : 20, 8, 72);
    const rows = this.getAnnotationRows(annotation);
    if (rows.length === 0) return;

    const layerGap = 12;
    const layerOffset = layerIndex * (trackWidth + layerGap);
    const backgroundColor = config.backgroundColor || '#242424';
    
    if (this.layoutType === 'circular' || this.layoutType === 'radial' || this.layoutType === 'unrooted') {
      this.renderCircularAnnotationRing(group, annotation, config, cladeColorMap, trackWidth, layerOffset, backgroundColor);
    }
  }

  private getAnnotationRows(annotation: AnnotationData): Array<{ id: string; pos: { x: number; y: number }; nodeData: any }> {
    const allNodes = Object.entries(this.nodes || {});
    const candidates = this.layoutType === 'rectangular'
      ? allNodes.filter(([id]) => this.leafNodeIdSet.has(id))
      : allNodes;

    const rows = candidates
      .map(([id, pos]) => ({
        id,
        pos,
        nodeData: this.getAnnotationDataByNodeId(annotation, id)
      }))
      .filter(item => item.nodeData);

    return rows.sort((a, b) => a.pos.y - b.pos.y);
  }

  private getAnnotationDataByNodeId(annotation: AnnotationData, nodeId: string): any {
    const byId = annotation.data[nodeId];
    if (byId) return byId;
    const nodeName = this.nodeNameById.get(nodeId);
    if (nodeName && annotation.data[nodeName]) {
      return annotation.data[nodeName];
    }
    return null;
  }

  private getAnnotationRowHeight(rows: Array<{ id: string; pos: { x: number; y: number } }>): number {
    if (rows.length < 2) return 10;
    const gaps: number[] = [];
    for (let index = 1; index < rows.length; index += 1) {
      const gap = rows[index].pos.y - rows[index - 1].pos.y;
      if (gap > 0) gaps.push(gap);
    }
    const medianGap = this.median(gaps);
    return this.clamp(medianGap * 0.72, 4, 12);
  }

  private getAnnotationBaseX(
    rows: Array<{ id: string; pos: { x: number; y: number } }>,
    position: 'left' | 'right',
    config: RenderConfig,
    trackWidth: number,
    layerOffset: number
  ): number {
    const minX = d3.min(rows, row => row.pos.x) ?? 0;
    const maxX = d3.max(rows, row => row.pos.x) ?? 0;
    const showLabels = this.getShowLabels();
    const longestName = rows.reduce((maxLength, row) => {
      const length = (this.nodeNameById.get(row.id) || '').length;
      return Math.max(maxLength, length);
    }, 0);
    const labelReserve = showLabels ? this.clamp(longestName * 6.4, 72, 260) : 28;
    const viewportPadding = 12;
    const treeAnnotationGap = 16;

    const rawX = position === 'left'
      ? minX - treeAnnotationGap - trackWidth - layerOffset
      : maxX + treeAnnotationGap + (this.layoutType === 'rectangular' ? labelReserve : 0) + layerOffset;

    return this.clamp(rawX, viewportPadding, Math.max(viewportPadding, config.width - trackWidth - viewportPadding));
  }

  private getLinkedColor(branchColor: string, annotationColor: unknown, annotation: AnnotationData): string {
    const color = typeof annotationColor === 'string' ? annotationColor : branchColor;
    const linkToBranch = annotation.config?.linkToBranchColor !== false;
    if (!linkToBranch) return color;
    return this.blendColors(color, branchColor, 0.55);
  }

  /**
   * Render circular annotation ring.
   *
   * ── Root cause of the original misalignment bug ───────────────────────────
   *
   * The old code computed the ring center as:
   *
   *   const layoutCenterX = (config.layoutWidth || config.width) / 2;
   *   const layoutCenterY = (config.layoutHeight || config.height) / 2;
   *
   * This is the *canvas* midpoint, NOT the geometric center of the tree nodes.
   * The circular layout algorithm places the root at the center of its own
   * coordinate space, which is typically close to (layoutRadius, layoutRadius)
   * inside the layout, but that origin is then embedded into the SVG canvas
   * at a position that depends on padding, margins, and initial translate.
   *
   * Because annotation layers are children of `this.g` (the same group as the
   * tree nodes), every coordinate inside that group is in node-coordinate
   * space.  Using config.width/2 as the center puts the ring at the canvas
   * origin (top-left) instead of around the tree.
   *
   * ── Fix ───────────────────────────────────────────────────────────────────
   *
   * 1. `computeTreeCenter()` calculates the bounding-box midpoint of all node
   *    positions.  For a symmetric circular layout this equals the layout
   *    center exactly; for asymmetric / unrooted layouts it is still the best
   *    available approximation.
   *
   * 2. All arc paths produced by `d3.arc()` are centered at (0, 0) by
   *    default.  We translate each `<path>` element by `(treeCx, treeCy)` so
   *    the arcs are concentric with the tree circle.
   *
   * 3. The title label and max-radius computation also use `(treeCx, treeCy)`.
   */
  private renderCircularAnnotationRing(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    annotation: AnnotationData,
    config: RenderConfig,
    cladeColorMap: Map<string, string> | null,
    trackWidth: number,
    layerOffset: number,
    backgroundColor: string
  ): void {
    // Only leaf nodes get annotation arcs
    let rows = this.getAnnotationRows(annotation);
    rows = rows.filter(row => this.leafNodeIdSet.has(row.id));
    if (rows.length === 0) return;

    // ── FIX: use node-coordinate-space center ────────────────────────────────
    const { cx: treeCx, cy: treeCy } = this.computeTreeCenter();
    // ─────────────────────────────────────────────────────────────────────────

    // Maximum distance from tree center to any leaf node (= visual radius of the tree)
    let treeMaxRadius = 0;
    Object.entries(this.nodes || {}).forEach(([id, pos]) => {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        const r = Math.hypot(pos.x - treeCx, pos.y - treeCy);
        treeMaxRadius = Math.max(treeMaxRadius, r);
      }
    });
    treeMaxRadius = Math.max(50, treeMaxRadius);

    // ── Label clearance ────────────────────────────────────────────────────────
    // Leaf labels are rendered radially outward from each leaf node.
    // To avoid the annotation ring occluding them, we estimate the radial space
    // consumed by the longest label and add it as a mandatory gap.
    //
    // Estimation strategy:
    //   • font size for circular layouts is 8–10 px (see getCircularLabelFontSize).
    //     We use 9 px as the average character width multiplier (≈ 0.55 × font-size
    //     for a proportional font, giving ~5 px/char), which is conservative enough
    //     to work for both dense and sparse trees.
    //   • We only consider leaf nodes that actually have labels (non-empty name).
    //   • The result is clamped to a reasonable range so tiny or huge trees don't
    //     produce absurd offsets.
    const showLabels = this.getShowLabels();
    let labelRadialClearance = 0;
    if (showLabels) {
      const LABEL_OFFSET_PX = this.getCircularLabelOffset(Object.keys(this.nodes || {}).length > 500);
      const CHAR_WIDTH_PX   = 5.2;   // empirical: ~0.55 × 9.5 px avg font size
      const LABEL_GAP_PX    = 6;     // breathing room between label tail and ring inner edge

      let maxLabelLen = 0;
      this.leafNodeIdSet.forEach(id => {
        const name = this.nodeNameById.get(id) || '';
        if (name.length > maxLabelLen) maxLabelLen = name.length;
      });

      const estimatedLabelWidth = maxLabelLen * CHAR_WIDTH_PX;
      labelRadialClearance = this.clamp(
        LABEL_OFFSET_PX + estimatedLabelWidth + LABEL_GAP_PX,
        16,   // minimum: even with no visible labels keep a small gap
        220   // maximum: guard against pathologically long taxon names
      );
    } else {
      labelRadialClearance = 16; // no labels → minimal gap
    }
    // ──────────────────────────────────────────────────────────────────────────

    // The annotation ring sits outside treeMaxRadius + label clearance
    const ringRadius = treeMaxRadius + labelRadialClearance + layerOffset;

    // Title at the top of the ring (angle = −90° = top)
    const titleRadius = ringRadius + trackWidth / 2 + 10;
    const titleAngle = -Math.PI / 2;
    group.append('text')
      .attr('x', treeCx + Math.cos(titleAngle) * titleRadius)
      .attr('y', treeCy + Math.sin(titleAngle) * titleRadius)
      .attr('fill', '#cbd5e1')
      .attr('font-size', '9px')
      .attr('font-weight', 600)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .text(annotation.name || annotation.type);

    // Sort leaves by angle relative to the true tree center
    const sortedLeaves = rows.sort((a, b) => {
      const angleA = Math.atan2(a.pos.y - treeCy, a.pos.x - treeCx);
      const angleB = Math.atan2(b.pos.y - treeCy, b.pos.x - treeCx);
      return angleA - angleB;
    });

    const sortedLeafCount = sortedLeaves.length;
    if (sortedLeafCount === 0) return;

    sortedLeaves.forEach((leaf, index) => {
      const leafAngle = Math.atan2(leaf.pos.y - treeCy, leaf.pos.x - treeCx);
      const nextLeaf = sortedLeaves[(index + 1) % sortedLeafCount];
      const nextAngle = Math.atan2(nextLeaf.pos.y - treeCy, nextLeaf.pos.x - treeCx);

      let startAngle = leafAngle;
      let endAngle = nextAngle < startAngle ? nextAngle + 2 * Math.PI : nextAngle;
      const minAngleWidth = 0.05;
      endAngle = startAngle + Math.max(minAngleWidth, endAngle - startAngle);

      // d3.arc() generates paths centered at (0, 0).
      // We apply `transform="translate(treeCx, treeCy)"` on every <path>
      // to place each arc correctly in node-coordinate space.
      const arc = d3.arc()
        .innerRadius(ringRadius)
        .outerRadius(ringRadius + trackWidth)
        .startAngle(startAngle)
        .endAngle(endAngle);

      const branchColor = this.getBranchColorForNode(leaf.id, config, cladeColorMap);
      const baseColor = this.getLinkedColor(branchColor, leaf.nodeData?.color, annotation);
      let fillColor = ensureContrast(baseColor, backgroundColor);

      if (annotation.type === 'HEATMAP' && leaf.nodeData?.value !== undefined) {
        const ratio = this.normalizeValue(leaf.nodeData.value, annotation.config?.minValue, annotation.config?.maxValue, 1);
        const hsl = d3.hsl(branchColor);
        const low = d3.hsl(hsl.h, this.clamp(hsl.s * 0.25, 0.14, 0.35), 0.2).formatHex();
        const high = d3.hsl(hsl.h, this.clamp(hsl.s * 1.05, 0.55, 0.95), 0.75).formatHex();
        fillColor = ensureContrast(d3.interpolateHsl(low, high)(ratio), backgroundColor);
      } else if (annotation.type === 'BARCHART' && leaf.nodeData?.value !== undefined) {
        const ratio = this.normalizeValue(leaf.nodeData.value, annotation.config?.minValue, annotation.config?.maxValue, 1);
        const hsl = d3.hsl(branchColor);
        fillColor = ensureContrast(
          d3.hsl(hsl.h, this.clamp(hsl.s * 0.9, 0.4, 0.95), this.clamp(0.36 + ratio * 0.33, 0.34, 0.76)).formatHex(),
          backgroundColor
        );
      }

      // ── KEY FIX: translate arc from SVG origin (0,0) to tree center ─────
      group.append('path')
        .attr('d', arc())
        .attr('transform', `translate(${treeCx}, ${treeCy})`)
        .attr('fill', fillColor)
        .attr('stroke', d3.hsl(fillColor).darker(0.75).formatHex())
        .attr('stroke-width', 0.5);
      // ────────────────────────────────────────────────────────────────────
    });
  }

  private getBranchColorForNode(nodeId: string, config: RenderConfig, cladeColorMap: Map<string, string> | null): string {
    const fallback = config.branchColor || '#8f96a3';
    const color = cladeColorMap?.get(nodeId) || fallback;
    return ensureContrast(color, config.backgroundColor || '#242424');
  }

  private buildPiePalette(baseColor: string, count: number): string[] {
    const hsl = d3.hsl(baseColor);
    const offsets = [0, 24, -24, 48, -48, 72, -72];
    return Array.from({ length: Math.max(1, count) }, (_, index) => {
      const offset = offsets[index % offsets.length];
      return d3.hsl(
        (hsl.h + offset + 360) % 360,
        this.clamp(hsl.s * 0.9, 0.45, 0.95),
        this.clamp(0.44 + (index % 3) * 0.09, 0.35, 0.76)
      ).formatHex();
    });
  }

  private normalizeValue(value: unknown, minValue?: number, maxValue?: number, defaultMax: number = 1): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const min = Number.isFinite(Number(minValue)) ? Number(minValue) : 0;
    const max = Number.isFinite(Number(maxValue)) ? Number(maxValue) : defaultMax;
    if (max <= min) return numeric > min ? 1 : 0;
    return this.clamp((numeric - min) / (max - min), 0, 1);
  }

  private blendColors(colorA: string, colorB: string, amount: number): string {
    return d3.interpolateRgb(colorA, colorB)(this.clamp(amount, 0, 1));
  }

  private getShowLabels(): boolean {
    let showLabels = true;
    if (typeof uiStore !== 'undefined') {
      uiStore.subscribe(state => { showLabels = state.showLabels; })();
    }
    return showLabels;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private median(values: number[]): number {
    if (values.length === 0) return 10;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  private rebuildNodeIndexes(tree: Tree): void {
    this.nodeNameById.clear();
    this.leafNodeIdSet.clear();

    const stack: any[] = [tree.root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node || !node.id) continue;
      this.nodeNameById.set(node.id, node.name || '');
      if (!node.children || node.children.length === 0) {
        this.leafNodeIdSet.add(node.id);
        continue;
      }
      node.children.forEach((child: any) => stack.push(child));
    }
  }

  private tree: any = null;
  private nodes: Record<string, { x: number; y: number }> | null = null;
  private layoutType: LayoutResult['type'] = 'rectangular';
  private nodeNameById = new Map<string, string>();
  private leafNodeIdSet = new Set<string>();
}

// Create renderer instance
export const createRenderer = (container: HTMLElement, config: RenderConfig): any => {
  const renderer = new SVGRenderer(container, config);
  
  const originalRender = renderer.render;
  renderer.render = function(tree: any, layoutResult: LayoutResult, config: RenderConfig) {
    this.tree = tree;
    this.nodes = layoutResult.nodes;
    this.layoutType = layoutResult.type;
    this.rebuildNodeIndexes(tree);
    originalRender.call(this, tree, layoutResult, config);
  };
  
  return renderer;
};