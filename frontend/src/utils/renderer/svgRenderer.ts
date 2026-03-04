import * as d3 from 'd3';
import type { Tree, LayoutResult, LayoutType } from '../../types/tree';
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

  private getSelectionHighlightColor(): string {
    if (typeof uiStore === 'undefined') return '#ff4d4f';

    let color: string | null = null;
    uiStore.subscribe(state => {
      color = state.selectionHighlightColor;
    })();
    return color || '#ff4d4f';
  }

  private applySelectedNodeStyles(baseRadius: number): void {
    const selectedNodeSet = this.getSelectedNodeSet();
    const selectedColor = this.getSelectionHighlightColor();

    this.g.selectAll<SVGPathElement, { source: string; target: string }>('.link')
      .attr('stroke', function (d) {
        const base = d3.select(this).attr('data-base-stroke') || d3.select(this).attr('stroke');
        if (!d3.select(this).attr('data-base-stroke')) {
          d3.select(this).attr('data-base-stroke', base || '#8f96a3');
        }
        return selectedNodeSet.has(d.target) ? selectedColor : (base || '#8f96a3');
      })
      .attr('stroke-width', function (d) {
        const baseWidth = Number(d3.select(this).attr('data-base-stroke-width') || d3.select(this).attr('stroke-width') || 1);
        if (!d3.select(this).attr('data-base-stroke-width')) {
          d3.select(this).attr('data-base-stroke-width', String(baseWidth));
        }
        return selectedNodeSet.has(d.target) ? Math.max(2.2, baseWidth * 1.6) : baseWidth;
      });

    this.g.selectAll<SVGCircleElement, [string, { x: number; y: number }]>('.node')
      .attr('stroke', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? selectedColor : 'transparent')
      .attr('stroke-width', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? 3 : 2)
      .attr('r', (d: [string, { x: number; y: number }]) => selectedNodeSet.has(d[0]) ? baseRadius * 1.45 : baseRadius);
  }

  /**
   * Compute the true geometric center of all rendered nodes.
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

  private autoCenter(config: RenderConfig): void {
    const allNodes = Object.values(this.nodes || {});
    if (allNodes.length === 0) return;

    const xs = allNodes.map(p => p.x);
    const ys = allNodes.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const PADDING = 80;
    const treeW = maxX - minX + PADDING * 2;
    const treeH = maxY - minY + PADDING * 2;

    const scaleX = config.width  / treeW;
    const scaleY = config.height / treeH;
    const scale  = Math.min(1, scaleX, scaleY);

    const treeCx = (minX + maxX) / 2;
    const treeCy = (minY + maxY) / 2;
    const tx = config.width  / 2 - treeCx * scale;
    const ty = config.height / 2 - treeCy * scale;

    if (typeof uiStore !== 'undefined') {
      uiStore.setZoom(scale);
      uiStore.setPan({ x: tx, y: ty });
    } else {
      this.g.attr('transform', `translate(${tx},${ty}) scale(${scale})`);
    }
  }

  /**
   * Build the SVG path `d` string for a single branch.
   *
   * ── Rectangular layout ────────────────────────────────────────────────────
   * Standard phylogenetic "right-angle elbow":
   *
   *   In a left-to-right rectangular phylogeny the convention is:
   *     • X-axis = evolutionary distance / depth (increases left → right)
   *     • Y-axis = leaf ordering (increases top → bottom)
   *
   *   A parent node at (source.x, source.y) connects to a child at
   *   (target.x, target.y) with two segments:
   *     1. A VERTICAL segment at source.x from source.y → target.y
   *        (the "stem" shared by all siblings in a clade)
   *     2. A HORIZONTAL segment at target.y from source.x → target.x
   *        (the "branch" extending to the child's depth)
   *
   *   This is the canonical form used by FigTree, iTOL, Dendroscope, etc.
   *   The previous code did horizontal-first (M sx sy → L tx sy → L tx ty),
   *   which draws the elbow in the wrong orientation and makes internal nodes
   *   appear disconnected from their siblings.
   *
   * ── Circular layout ───────────────────────────────────────────────────────
   * Professional circular phylogeny uses:
   *   1. A circular arc at the source radius from source.angle → target.angle
   *      (connects siblings along the same depth ring)
   *   2. A radial straight line from the arc endpoint outward to target
   *      (extends the branch to the child's radius)
   *
   * ── Radial layout ─────────────────────────────────────────────────────────
   * Radial (equal-angle / equal-daylight) unrooted-style layouts use straight
   * lines only — no arc segments.  The layout algorithm already positions nodes
   * so that straight lines produce the correct topology.
   *
   * ── Unrooted layout ───────────────────────────────────────────────────────
   * Straight lines only — identical to radial.
   */
  private buildBranchPath(
    source: { x: number; y: number },
    target: { x: number; y: number },
    layoutType: LayoutType,
    treeCx: number,
    treeCy: number
  ): string {
    switch (layoutType) {
      case 'rectangular': {
        // ── FIX ──────────────────────────────────────────────────────────────
        // Correct elbow: vertical at source.x first, then horizontal to
        // target.x.  This keeps sibling branches visually grouped at the
        // parent's X position and extends each child horizontally to its own
        // depth — matching every major phylogenetics viewer.
        //
        // Old (wrong):  M sx sy → L tx sy → L tx ty   (horizontal first)
        // New (correct): M sx sy → L sx ty → L tx ty  (vertical first)
        // ─────────────────────────────────────────────────────────────────────
        return `M ${source.x} ${source.y} L ${source.x} ${target.y} L ${target.x} ${target.y}`;
      }

      case 'circular': {
        // Arc segment: draw along the circumference at source's radius from
        // source's angle to target's angle, then go radially to target.
        const sourceR = Math.hypot(source.x - treeCx, source.y - treeCy);

        // Guard: if source is essentially at the center (root), just draw a
        // straight radial line.
        if (sourceR < 1e-3) {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        const sourceAngle = Math.atan2(source.y - treeCy, source.x - treeCx);
        const targetAngle = Math.atan2(target.y - treeCy, target.x - treeCx);

        // Normalize angle difference to (-π, π] to always take the shorter arc.
        let angleDiff = targetAngle - sourceAngle;
        while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        const sweepFlag    = angleDiff >= 0 ? 1 : 0;
        const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;

        // Point on the source-radius circle at the target's angle.
        const arcEndX = treeCx + sourceR * Math.cos(targetAngle);
        const arcEndY = treeCy + sourceR * Math.sin(targetAngle);

        // Skip arc for negligibly small angle differences to avoid degenerate
        // zero-length arc commands that can confuse some SVG renderers.
        const arcDist = Math.hypot(arcEndX - source.x, arcEndY - source.y);
        if (arcDist < 0.5) {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        return [
          `M ${source.x} ${source.y}`,
          `A ${sourceR} ${sourceR} 0 ${largeArcFlag} ${sweepFlag} ${arcEndX} ${arcEndY}`,
          `L ${target.x} ${target.y}`,
        ].join(' ');
      }

      case 'radial': {
        // ── FIX ──────────────────────────────────────────────────────────────
        // Radial (equal-angle) trees ARE rooted and use a cladogram-style
        // elbow rendered in polar coordinates:
        //   1. Arc at source radius (same as circular)
        //   2. Radial line to target
        //
        // Previously this fell through to the straight-line default, which
        // caused diagonal "shortcut" lines instead of proper right-angle
        // elbows in polar space.
        // ─────────────────────────────────────────────────────────────────────
        const sourceR = Math.hypot(source.x - treeCx, source.y - treeCy);

        if (sourceR < 1e-3) {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        const sourceAngle = Math.atan2(source.y - treeCy, source.x - treeCx);
        const targetAngle = Math.atan2(target.y - treeCy, target.x - treeCx);

        let angleDiff = targetAngle - sourceAngle;
        while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        const sweepFlag    = angleDiff >= 0 ? 1 : 0;
        const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;

        const arcEndX = treeCx + sourceR * Math.cos(targetAngle);
        const arcEndY = treeCy + sourceR * Math.sin(targetAngle);

        const arcDist = Math.hypot(arcEndX - source.x, arcEndY - source.y);
        if (arcDist < 0.5) {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }

        return [
          `M ${source.x} ${source.y}`,
          `A ${sourceR} ${sourceR} 0 ${largeArcFlag} ${sweepFlag} ${arcEndX} ${arcEndY}`,
          `L ${target.x} ${target.y}`,
        ].join(' ');
      }

      case 'unrooted':
      default:
        // Unrooted (e.g. equal-daylight, Reingold–Tilford unrooted) layouts
        // place nodes via force or angle algorithms that guarantee straight
        // lines represent correct branch topology.
        return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
    }
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

    // Precompute tree center once for circular/radial/unrooted branch paths and labels.
    const { cx: treeCx, cy: treeCy } = this.computeTreeCenter();

    // Radial label direction: vector from tree center outward through each node.
    const labelDirection = new Map<string, { angle: number; ux: number; uy: number }>();
    if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
      Object.entries(layoutResult.nodes).forEach(([id, pos]) => {
        const dx = pos.x - treeCx;
        const dy = pos.y - treeCy;
        const len = Math.hypot(dx, dy) || 1;
        labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
      });
    }

    // ── Branch paths ──────────────────────────────────────────────────────────
    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];
        return this.buildBranchPath(source, target, layoutResult.type, treeCx, treeCy);
      })
      .attr('stroke', d => {
        if (cladeColorMap) {
          const color = cladeColorMap.get(d.target) || cladeColorMap.get(d.source) || (config.branchColor || '#888');
          return ensureContrast(color);
        }
        return ensureContrast(config.branchColor || '#888');
      })
      .attr('stroke-width', d => {
        return this.getAdaptiveBranchWidth(d.source, d.target, tree.root.id, leafNodeIds, nodeDepth, depthRange, baseBranchWidth, layoutResult.type);
      })
      .attr('stroke-opacity', (layoutResult.type === 'circular' || layoutResult.type === 'radial') ? 0.75 : 1)
      .attr('fill', 'none');

    // ── Node circles ──────────────────────────────────────────────────────────
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
          const lengthValue = (node as any).branchLength ?? (node as any).length;
          const lengthHtml =
            lengthValue !== null && lengthValue !== undefined && lengthValue !== 0
              ? `<div><strong>Length:</strong> ${lengthValue}</div>`
              : '';
          tooltip.html(`
            <div><strong>Name:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>Children:</strong> ${node.children.length}</div>` : ''}
            ${lengthHtml}
            <div><small>Click to zoom in</small></div>
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

    // ── Labels ────────────────────────────────────────────────────────────────
    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      let labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
        ? this.selectCircularLabels(circularLeafNodes, treeCx, treeCy, isLargeTree)
        : circularLeafNodes;

      if (layoutResult.type === 'rectangular') {
        labelData = this.optimizeRectangularLabels(labelData, isLargeTree);
      }

      this.g.selectAll('.label')
        .data(labelData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', config.backgroundColor ? ensureContrast('#fff', config.backgroundColor) : '#fff')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', () => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            return this.getCircularLabelFontSize(labelData.length, isLargeTree);
          } else {
            if (labelData.length > 300) return '4px';
            if (labelData.length > 150) return '5px';
            if (labelData.length > 80)  return '6px';
            if (labelData.length > 40)  return '7px';
            return isLargeTree ? '8px' : '10px';
          }
        })
        .attr('text-anchor', () => 'start')
        .attr('x', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const ux = dir ? dir.ux : Math.cos(Math.atan2(d[1].y - treeCy, d[1].x - treeCx));
            return d[1].x + offset * ux;
          } else if (layoutResult.type === 'rectangular') {
            return d[1].x + 8;
          }
          return d[1].x + 8;
        })
        .attr('y', d => {
          if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
            const offset = this.getCircularLabelOffset(isLargeTree);
            const dir = labelDirection.get(d[0]);
            const uy = dir ? dir.uy : Math.sin(Math.atan2(d[1].y - treeCy, d[1].x - treeCx));
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
            const angle = dir ? dir.angle : Math.atan2(d[1].y - treeCy, d[1].x - treeCx);
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

    if (layoutResult.type === 'rectangular' || layoutResult.type === 'unrooted') {
      this.autoCenter(config);
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
    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const leafNodeIds = new Set(leafNodes.map(([id]) => id));

    // Precompute tree center for circular/radial arc paths and labels.
    const { cx: treeCx, cy: treeCy } = this.computeTreeCenter();

    // ── Branch paths ──────────────────────────────────────────────────────────
    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];
        return this.buildBranchPath(source, target, layoutResult.type, treeCx, treeCy);
      })
      .attr('stroke', d => {
        if (cladeColorMap) {
          const color = cladeColorMap.get(d.target) || cladeColorMap.get(d.source) || (config.branchColor || '#888');
          return ensureContrast(color);
        }
        return ensureContrast(config.branchColor || '#888');
      })
      .attr('stroke-width', d => {
        return this.getAdaptiveBranchWidth(
          d.source,
          d.target,
          tree.root.id,
          leafNodeIds,
          nodeDepth,
          Math.max(1, maxDepth),
          branchWidth,
          layoutResult.type
        );
      })
      .attr('fill', 'none');

    // ── Node circles ──────────────────────────────────────────────────────────
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
          const lengthValue = (node as any).branchLength ?? (node as any).length;
          const lengthHtml =
            lengthValue !== null && lengthValue !== undefined && lengthValue !== 0
              ? `<div><strong>Length:</strong> ${lengthValue}</div>`
              : '';
          tooltip.html(`
            <div><strong>Name:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>Children:</strong> ${node.children.length}</div>` : ''}
            ${lengthHtml}
            <div><small>Click to zoom in</small></div>
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

    // ── Labels ────────────────────────────────────────────────────────────────
    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    const labelDirection = new Map<string, { angle: number; ux: number; uy: number }>();
    if (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
      Object.entries(layoutResult.nodes).forEach(([id, pos]) => {
        const dx = pos.x - treeCx;
        const dy = pos.y - treeCy;
        const len = Math.hypot(dx, dy) || 1;
        labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
      });
    }

    if (showLabels && (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')) {
      const sampledLabels = this.selectCircularLabels(leafNodes, treeCx, treeCy, true);

      this.g.selectAll('.label')
        .data(sampledLabels)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', config.backgroundColor ? ensureContrast('#fff', config.backgroundColor) : '#fff')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', this.getCircularLabelFontSize(leafNodes.length, true))
        .attr('text-anchor', () => 'start')
        .attr('x', d => {
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const ux = dir ? dir.ux : Math.cos(Math.atan2(d[1].y - treeCy, d[1].x - treeCx));
          return d[1].x + offset * ux;
        })
        .attr('y', d => {
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const uy = dir ? dir.uy : Math.sin(Math.atan2(d[1].y - treeCy, d[1].x - treeCx));
          return d[1].y + offset * uy;
        })
        .attr('transform', d => {
          const offset = this.getCircularLabelOffset(true);
          const dir = labelDirection.get(d[0]);
          const angle = dir ? dir.angle : Math.atan2(d[1].y - treeCy, d[1].x - treeCx);
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

    if (layoutResult.type === 'rectangular' || layoutResult.type === 'unrooted') {
      this.autoCenter(config);
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
    const requiredSpacing = Math.max(4, fontSizePx * 0.7);
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
    const scale = 2;
    const translateX = centerX - nodePos.x * scale;
    const translateY = centerY - nodePos.y * scale;

    if (typeof uiStore !== 'undefined') {
      uiStore.setSelectionHighlightColor(null);
      uiStore.selectNode(nodeId);
      uiStore.setZoom(scale);
      uiStore.setPan({ x: translateX, y: translateY });
    } else {
      this.updateTransform(`translate(${translateX}, ${translateY}) scale(${scale})`);
    }
  }

  private getAdaptiveBranchWidth(
    sourceId: string,
    targetId: string,
    rootId: string,
    leafNodeIds: Set<string>,
    nodeDepth: Map<string, number>,
    depthRange: number,
    baseBranchWidth: number,
    layoutType: LayoutType
  ): number {
    const targetDepth = nodeDepth.get(targetId) || 0;
    const widthRatio = 1 - (targetDepth / Math.max(1, depthRange));

    let minWidth = baseBranchWidth * 0.5;
    let maxWidth = baseBranchWidth * 2;

    if (layoutType === 'circular' || layoutType === 'radial' || layoutType === 'unrooted') {
      minWidth = baseBranchWidth * 0.4;
      maxWidth = baseBranchWidth * 2.8;
    }

    let width = Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
    if (sourceId === rootId) {
      width *= 1.2;
    }
    if (leafNodeIds.has(targetId)) {
      width *= 0.72;
    }

    return this.clamp(width, baseBranchWidth * 0.35, baseBranchWidth * 3.2);
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

    if (this.layoutType === 'rectangular') {
      this.renderRectangularAnnotationStrip(group, annotation, config, cladeColorMap, rows, trackWidth, layerOffset, backgroundColor);
    } else {
      this.renderCircularAnnotationRing(group, annotation, config, cladeColorMap, trackWidth, layerOffset, backgroundColor);
    }
  }

  private renderRectangularAnnotationStrip(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    annotation: AnnotationData,
    config: RenderConfig,
    cladeColorMap: Map<string, string> | null,
    rows: Array<{ id: string; pos: { x: number; y: number }; nodeData: any }>,
    trackWidth: number,
    layerOffset: number,
    backgroundColor: string
  ): void {
    if (rows.length === 0) return;

    const showLabels = this.getShowLabels();
    const CHAR_WIDTH_PX = 6.4;
    const LABEL_START_OFFSET = 8;
    let maxLabelLen = 0;
    rows.forEach(row => {
      const name = this.nodeNameById.get(row.id) || '';
      if (name.length > maxLabelLen) maxLabelLen = name.length;
    });
    const labelReserve = showLabels ? this.clamp(maxLabelLen * CHAR_WIDTH_PX, 60, 260) : 0;
    const leafMaxX = Math.max(...rows.map(r => r.pos.x));
    const STRIP_GAP = 16;
    const baseX = leafMaxX + LABEL_START_OFFSET + labelReserve + STRIP_GAP + layerOffset;

    const rowSpacing = this.getAnnotationRowHeight(rows) / 0.72;
    const GROUP_GAP = 2;

    const isContinuous = annotation.type === 'HEATMAP' || annotation.type === 'BARCHART';
    const resolvedRows = rows.map(row => {
      const branchColor = this.getBranchColorForNode(row.id, config, cladeColorMap);
      const baseColor = this.getLinkedColor(branchColor, row.nodeData?.color, annotation);
      let fillColor = ensureContrast(baseColor, backgroundColor);

      if (annotation.type === 'HEATMAP' && row.nodeData?.value !== undefined) {
        const ratio = this.normalizeValue(row.nodeData.value, annotation.config?.minValue, annotation.config?.maxValue, 1);
        const hsl = d3.hsl(branchColor);
        const low  = d3.hsl(hsl.h, this.clamp(hsl.s * 0.25, 0.14, 0.35), 0.2).formatHex();
        const high = d3.hsl(hsl.h, this.clamp(hsl.s * 1.05, 0.55, 0.95), 0.75).formatHex();
        fillColor = ensureContrast(d3.interpolateHsl(low, high)(ratio), backgroundColor);
      } else if (annotation.type === 'BARCHART' && row.nodeData?.value !== undefined) {
        const ratio = this.normalizeValue(row.nodeData.value, annotation.config?.minValue, annotation.config?.maxValue, 1);
        const hsl = d3.hsl(branchColor);
        fillColor = ensureContrast(
          d3.hsl(hsl.h, this.clamp(hsl.s * 0.9, 0.4, 0.95), this.clamp(0.36 + ratio * 0.33, 0.34, 0.76)).formatHex(),
          backgroundColor
        );
      }
      return { ...row, fillColor };
    });

    const titleY = resolvedRows[0].pos.y - rowSpacing - 4;
    group.append('text')
      .attr('x', baseX + trackWidth / 2)
      .attr('y', titleY)
      .attr('fill', '#cbd5e1')
      .attr('font-size', '9px')
      .attr('font-weight', 600)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'auto')
      .text(annotation.name || annotation.type);

    if (isContinuous) {
      resolvedRows.forEach(row => {
        const rectH = Math.max(2, rowSpacing - 1);
        group.append('rect')
          .attr('x', baseX)
          .attr('y', row.pos.y - rectH / 2)
          .attr('width', trackWidth)
          .attr('height', rectH)
          .attr('fill', row.fillColor)
          .attr('stroke', d3.hsl(row.fillColor).darker(0.6).formatHex())
          .attr('stroke-width', 0.3)
          .attr('rx', 0);
      });
    } else {
      type Run = { fillColor: string; startY: number; endY: number };
      const runs: Run[] = [];
      let cur: Run | null = null;

      resolvedRows.forEach((row, i) => {
        const halfRow = rowSpacing / 2;
        const top    = row.pos.y - halfRow;
        const bottom = row.pos.y + halfRow;

        if (!cur || cur.fillColor !== row.fillColor) {
          if (cur) runs.push(cur);
          cur = { fillColor: row.fillColor, startY: top, endY: bottom };
        } else {
          cur.endY = bottom;
        }
        if (i === resolvedRows.length - 1 && cur) runs.push(cur);
      });

      runs.forEach((run) => {
        const inset = runs.length > 1 ? GROUP_GAP / 2 : 0;
        const y = run.startY + inset;
        const h = Math.max(2, run.endY - run.startY - inset * 2);
        const fill = run.fillColor;
        group.append('rect')
          .attr('x', baseX)
          .attr('y', y)
          .attr('width', trackWidth)
          .attr('height', h)
          .attr('fill', fill)
          .attr('stroke', d3.hsl(fill).darker(0.5).formatHex())
          .attr('stroke-width', 0.4)
          .attr('rx', 2);
      });
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

  private getLinkedColor(branchColor: string, annotationColor: unknown, annotation: AnnotationData): string {
    const color = typeof annotationColor === 'string' ? annotationColor : branchColor;
    const linkToBranch = annotation.config?.linkToBranchColor !== false;
    if (!linkToBranch) return color;
    return this.blendColors(color, branchColor, 0.55);
  }

  private renderCircularAnnotationRing(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    annotation: AnnotationData,
    config: RenderConfig,
    cladeColorMap: Map<string, string> | null,
    trackWidth: number,
    layerOffset: number,
    backgroundColor: string
  ): void {
    let rows = this.getAnnotationRows(annotation);
    rows = rows.filter(row => this.leafNodeIdSet.has(row.id));
    if (rows.length === 0) return;

    const { cx: treeCx, cy: treeCy } = this.computeTreeCenter();

    let treeMaxRadius = 0;
    Object.entries(this.nodes || {}).forEach(([id, pos]) => {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        const r = Math.hypot(pos.x - treeCx, pos.y - treeCy);
        treeMaxRadius = Math.max(treeMaxRadius, r);
      }
    });
    treeMaxRadius = Math.max(50, treeMaxRadius);

    const showLabels = this.getShowLabels();
    let labelRadialClearance = 0;
    if (showLabels) {
      const LABEL_OFFSET_PX = this.getCircularLabelOffset(Object.keys(this.nodes || {}).length > 500);
      const CHAR_WIDTH_PX   = 5.2;
      const LABEL_GAP_PX    = 6;

      let maxLabelLen = 0;
      this.leafNodeIdSet.forEach(id => {
        const name = this.nodeNameById.get(id) || '';
        if (name.length > maxLabelLen) maxLabelLen = name.length;
      });

      const estimatedLabelWidth = maxLabelLen * CHAR_WIDTH_PX;
      labelRadialClearance = this.clamp(
        LABEL_OFFSET_PX + estimatedLabelWidth + LABEL_GAP_PX,
        16,
        220
      );
    } else {
      labelRadialClearance = 16;
    }

    const ringRadius = treeMaxRadius + labelRadialClearance + layerOffset;

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

      group.append('path')
        .attr('d', arc as any)
        .attr('transform', `translate(${treeCx}, ${treeCy})`)
        .attr('fill', fillColor)
        .attr('stroke', d3.hsl(fillColor).darker(0.75).formatHex())
        .attr('stroke-width', 0.5);
    });

    if (annotation.config?.showTitle === true) {
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
    }
  }

  private getBranchColorForNode(nodeId: string, config: RenderConfig, cladeColorMap: Map<string, string> | null): string {
    const fallback = config.branchColor || '#8f96a3';
    const color = cladeColorMap?.get(nodeId) || fallback;
    return ensureContrast(color, config.backgroundColor || '#242424');
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

  public rebuildNodeIndexes(tree: Tree): void {
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

  public tree: any = null;
  public nodes: Record<string, { x: number; y: number }> | null = null;
  public layoutType: LayoutResult['type'] = 'rectangular';
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