import type { Tree, LayoutResult } from '../../types/tree';
import type { RenderConfig } from '../../types/layout';
import { uiStore } from '../../stores/uiStore';
import { buildCladeColorMap } from './colors';
import { findNodeById } from './treeUtils';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement, config: RenderConfig) {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = config.width;
      this.canvas.height = config.height;
      this.canvas.style.backgroundColor = config.backgroundColor || '#242424';
      container.appendChild(this.canvas);

      this.ctx = this.canvas.getContext('2d')!;
    }
  }

  render(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    if (!this.canvas || !this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const currentZoom = 1;

    const nodeSize = Math.max(1, (config.nodeSize || 4) * currentZoom);
    const branchWidth = Math.max(0.5, (config.branchWidth || 1) * currentZoom);

    const useCladeColors = config.branchColorMode !== 'single' && (tree.root.children?.length || 0) > 1;
    const cladeColorMap = useCladeColors ? buildCladeColorMap(tree, config.branchColor || '#8f96a3') : null;
    this.ctx.lineWidth = branchWidth;
    layoutResult.links.forEach(link => {
      const source = layoutResult.nodes[link.source];
      const target = layoutResult.nodes[link.target];
      this.ctx.strokeStyle = cladeColorMap
        ? (cladeColorMap.get(link.target) || cladeColorMap.get(link.source) || (config.branchColor || '#888'))
        : (config.branchColor || '#888');

      if (this.isInViewport(source) || this.isInViewport(target)) {
        this.ctx.beginPath();

        if (layoutResult.type === 'rectangular') {
          this.ctx.moveTo(source.x, source.y);
          this.ctx.lineTo(target.x, source.y);
          this.ctx.lineTo(target.x, target.y);
        } else if (layoutResult.type === 'circular' || layoutResult.type === 'radial') {
          this.drawCurvedLink(source, target);
        } else {
          this.ctx.moveTo(source.x, source.y);
          this.ctx.lineTo(target.x, target.y);
        }

        this.ctx.stroke();
      }
    });

    this.ctx.fillStyle = config.nodeColor || '#fff';
    Object.entries(layoutResult.nodes).forEach(([, pos]) => {
      if (this.isInViewport(pos)) {
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, nodeSize, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    });

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (currentZoom > 0.5 && showLabels) {
      this.ctx.fillStyle = '#fff';
      this.ctx.font = `${Math.max(8, 12 * currentZoom)}px Arial`;
      this.ctx.textAlign = 'left';

      const nodeEntries = Object.entries(layoutResult.nodes);
      const labelDensity = Math.max(1, Math.floor(nodeEntries.length / 100));

      const labelDirection = new Map<string, { angle: number; ux: number; uy: number }>();
      if (layoutResult.type === 'circular') {
        const parentById = new Map<string, string>();
        layoutResult.links.forEach(link => parentById.set(link.target, link.source));
        nodeEntries.forEach(([nodeId, nodePos]) => {
          const parentId = parentById.get(nodeId);
          const parentPos = parentId ? layoutResult.nodes[parentId] : null;
          const dx = parentPos ? nodePos.x - parentPos.x : nodePos.x - this.canvas.width / 2;
          const dy = parentPos ? nodePos.y - parentPos.y : nodePos.y - this.canvas.height / 2;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(nodeId, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        });
      }

      nodeEntries.forEach(([id, pos], index) => {
        if (this.isInViewport(pos) && index % labelDensity === 0) {
          const node = findNodeById(tree.root, id);
          if (node?.name) {
            if (layoutResult.type === 'circular' || layoutResult.type === 'radial') {
              this.drawCircularLabel(node.name, pos, labelDirection.get(id));
            } else {
              this.ctx.fillText(node.name, pos.x + nodeSize + 4, pos.y + nodeSize / 2);
            }
          }
        }
      });
    }
  }

  private drawCurvedLink(source: { x: number; y: number }, target: { x: number; y: number }): void {
    const centerX = (source.x + target.x) / 2;
    const centerY = (source.y + target.y) / 2;

    const distToCenter = Math.sqrt(centerX * centerX + centerY * centerY);
    if (distToCenter > 0) {
      const controlOffset = 0.3;
      const controlX = centerX * (1 - controlOffset);
      const controlY = centerY * (1 - controlOffset);

      this.ctx.moveTo(source.x, source.y);
      this.ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    } else {
      this.ctx.moveTo(source.x, source.y);
      this.ctx.lineTo(target.x, target.y);
    }
  }

  private drawCircularLabel(text: string, pos: { x: number; y: number }, dir?: { angle: number; ux: number; uy: number }): void {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    const dx = pos.x - centerX;
    const dy = pos.y - centerY;
    const angle = dir ? dir.angle : Math.atan2(dy, dx);
    const ux = dir ? dir.ux : Math.cos(angle);
    const uy = dir ? dir.uy : Math.sin(angle);

    const labelOffset = 15;
    const labelX = pos.x + labelOffset * ux;
    const labelY = pos.y + labelOffset * uy;
    const rotation = angle;

    this.ctx.save();
    this.ctx.translate(labelX, labelY);
    this.ctx.rotate(rotation);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, 0, 0);
    this.ctx.restore();
  }

  private isInViewport(pos: { x: number; y: number }): boolean {
    if (!this.canvas) return false;

    const margin = 50;
    return pos.x >= -margin &&
      pos.x <= this.canvas.width + margin &&
      pos.y >= -margin &&
      pos.y <= this.canvas.height + margin;
  }

  updateTransform(transform: string): void {
    void transform;
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}
