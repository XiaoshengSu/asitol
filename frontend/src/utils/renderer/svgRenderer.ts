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

  private doRender(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    this.g.selectAll('*').remove();

    const centerX = config.width / 2;
    const centerY = config.height / 2;

    const nodeCount = Object.keys(layoutResult.nodes).length;
    const isLargeTree = nodeCount > 500;
    const useCladeColors = config.branchColorMode !== 'single' && (tree.root.children?.length || 0) > 1;
    const cladeColorMap = useCladeColors ? buildCladeColorMap(tree, config.branchColor || '#8f96a3') : null;

    const nodeSize = isLargeTree ? Math.max(1, (config.nodeSize || 4) * 0.6) : (config.nodeSize || 4);
    const branchWidth = isLargeTree ? Math.max(0.5, (config.branchWidth || 1) * 0.8) : (config.branchWidth || 1);

    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, branchWidth, cladeColorMap);
      return;
    }

    // 为圆形和径向布局计算叶节点
    const circularLeafIds = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? new Set(Object.keys(layoutResult.nodes).filter(id => isLeafNode(tree.root, id)))
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
          return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
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
      .attr('stroke-width', branchWidth)
      .attr('stroke-opacity', (layoutResult.type === 'circular' || layoutResult.type === 'radial') ? 0.75 : 1)
      .attr('fill', 'none');

    const allNodes = Object.entries(layoutResult.nodes);
    const circularLeafNodes = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? allNodes.filter(([id]) => isLeafNode(tree.root, id))
      : [];

    const nodeData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') && circularLeafNodes.length > 300
      ? allNodes.filter(([id]) => !isLeafNode(tree.root, id))
      : allNodes;

    this.g.selectAll('.node')
      .data(nodeData)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', nodeSize)
      .attr('fill', config.nodeColor || '#fff');

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      const labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
        ? this.selectCircularLabels(circularLeafNodes, centerX, centerY, isLargeTree)
        : allNodes;

      this.g.selectAll('.label')
        .data(labelData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', '#fff')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
          ? this.getCircularLabelFontSize(labelData.length, isLargeTree)
          : (isLargeTree ? '10px' : '12px'))
        .attr('text-anchor', () => 'start')
        .attr('x', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const x = d[1].x;
            const y = d[1].y;
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const ux = dir ? dir.ux : Math.cos(Math.atan2(y - centerY, x - centerX));
            return x + offset * ux;
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
  }

  private renderLargeTree(
    tree: Tree,
    layoutResult: LayoutResult,
    config: RenderConfig,
    centerX: number,
    centerY: number,
    nodeSize: number,
    branchWidth: number,
    cladeColorMap: Map<string, string> | null
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
          return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
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
      .attr('stroke-width', branchWidth * 0.8)
      .attr('fill', 'none');

    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const largeTreeNodeData = layoutResult.type === 'circular' && leafNodes.length > 300 ? [] : leafNodes;

    this.g.selectAll('.node')
      .data(largeTreeNodeData)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', nodeSize * 0.8)
      .attr('fill', config.nodeColor || '#fff');

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
}
