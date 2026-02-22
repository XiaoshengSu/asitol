import * as d3 from 'd3';
import type { Tree, LayoutResult } from '../types/tree';
import type { RenderConfig } from '../types/layout';
import { uiStore } from '../stores/uiStore';

// SVG渲染器
class SVGRenderer {
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
    // 使用节流技术，避免频繁重绘
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }

    this.renderTimeout = window.setTimeout(() => {
      this.doRender(tree, layoutResult, config);
    }, 50);
  }

  private doRender(tree: Tree, layoutResult: LayoutResult, config: RenderConfig): void {
    // 清空现有内容
    this.g.selectAll('*').remove();

    const centerX = config.width / 2;
    const centerY = config.height / 2;
    
    // 计算节点数量，根据节点数量调整渲染参数
    const nodeCount = Object.keys(layoutResult.nodes).length;
    const isLargeTree = nodeCount > 500;
    
    // 根据树的大小调整节点大小和线宽
    const nodeSize = isLargeTree ? Math.max(1, (config.nodeSize || 4) * 0.6) : (config.nodeSize || 4);
    const branchWidth = isLargeTree ? Math.max(0.5, (config.branchWidth || 1) * 0.8) : (config.branchWidth || 1);

    // 对于超大型树，使用简化渲染
    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, branchWidth);
      return;
    }

    // 绘制连接线
    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];
        
        // 对于矩形布局，使用直角连接线
        if (layoutResult.type === 'rectangular') {
          // 先水平移动到目标节点的x坐标，再垂直移动到目标节点的y坐标
          return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
        } else if (layoutResult.type === 'circular') {
          const targetRadius = Math.hypot(target.x - centerX, target.y - centerY);
          const sourceAngle = Math.atan2(source.y - centerY, source.x - centerX);
          const targetAngle = Math.atan2(target.y - centerY, target.x - centerX);

          // 仿 iTOL：先沿半径方向，再走同心圆弧到子节点角度
          const sweep = this.shortestArcSweep(sourceAngle, targetAngle);
          return [
            `M ${source.x} ${source.y}`,
            `L ${centerX + targetRadius * Math.cos(sourceAngle)} ${centerY + targetRadius * Math.sin(sourceAngle)}`,
            `A ${targetRadius} ${targetRadius} 0 0 ${sweep > 0 ? 1 : 0} ${target.x} ${target.y}`
          ].join(' ');
        } else {
          // 对于其他布局，使用直线连接
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }
      })
      .attr('stroke', config.branchColor || '#888')
      .attr('stroke-width', branchWidth)
      .attr('fill', 'none');

    // 绘制节点
    this.g.selectAll('.node')
      .data(Object.entries(layoutResult.nodes))
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', nodeSize)
      .attr('fill', config.nodeColor || '#fff');

    // 获取标签显示状态
    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    // 绘制节点标签
    if (showLabels) {
      // 对于圆形布局，只显示叶节点的标签，形成完美圆环
      const labelData = layoutResult.type === 'circular' 
        ? Object.entries(layoutResult.nodes).filter(([id]) => this.isLeafNode(tree.root, id))
        : Object.entries(layoutResult.nodes);
      
      this.g.selectAll('.label')
        .data(labelData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', '#fff')
        .attr('font-size', isLargeTree ? '10px' : '12px')
        .attr('text-anchor', d => {
          // 对于圆形布局，根据节点位置设置文本锚点
          if (layoutResult.type === 'circular') {
            const x = d[1].x;
            const y = d[1].y;
            const angle = Math.atan2(y - centerY, x - centerX);
            
            // 确保文本锚点正确，使标签朝外
            if (Math.abs(angle) > Math.PI / 2) {
              return 'end';
            } else {
              return 'start';
            }
          }
          return 'start';
        })
        .attr('x', d => {
          // 对于圆形布局，根据节点位置和角度设置x坐标
          if (layoutResult.type === 'circular') {
            const x = d[1].x;
            const y = d[1].y;
            const angle = Math.atan2(y - centerY, x - centerX);
            
            // 沿径向向外偏移，确保标签朝外，形成圆环
            const offset = isLargeTree ? 12 : 15;
            return x + offset * Math.cos(angle);
          }
          return d[1].x + 8;
        })
        .attr('y', d => {
          // 对于圆形布局，根据节点位置和角度设置y坐标
          if (layoutResult.type === 'circular') {
            const x = d[1].x;
            const y = d[1].y;
            const angle = Math.atan2(y - centerY, x - centerX);
            
            // 沿径向向外偏移，确保标签朝外，形成圆环
            const offset = isLargeTree ? 12 : 15;
            return y + offset * Math.sin(angle);
          }
          return d[1].y + 3;
        })
        .attr('transform', d => {
          // 对于圆形布局，根据节点角度旋转文本
          if (layoutResult.type === 'circular') {
            const x = d[1].x;
            const y = d[1].y;
            const angle = Math.atan2(y - centerY, x - centerX);
            
            // 计算旋转角度，使文本方向朝外，与圆周切线一致
            let rotation = angle * (180 / Math.PI);
            
            // 对于左侧的标签，旋转180度，使文本可读
            if (Math.abs(angle) > Math.PI / 2) {
              rotation += 180;
            }
            
            return `rotate(${rotation}, ${x}, ${y})`;
          }
          return '';
        })
        .text(d => {
          const node = this.findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }
  }

  private renderLargeTree(tree: Tree, layoutResult: LayoutResult, config: RenderConfig, centerX: number, centerY: number, nodeSize: number, branchWidth: number): void {
    // 只绘制连接线和叶节点，跳过内部节点的绘制
    // 绘制连接线
    this.g.selectAll('.link')
      .data(layoutResult.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d => {
        const source = layoutResult.nodes[d.source];
        const target = layoutResult.nodes[d.target];
        
        // 对于圆形布局，使用简化的连接线
        if (layoutResult.type === 'circular') {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        } else if (layoutResult.type === 'rectangular') {
          return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
        } else {
          return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }
      })
      .attr('stroke', config.branchColor || '#888')
      .attr('stroke-width', branchWidth * 0.8)
      .attr('fill', 'none');

    // 只绘制叶节点
    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => this.isLeafNode(tree.root, id));
    
    this.g.selectAll('.node')
      .data(leafNodes)
      .enter()
      .append('circle')
      .attr('class', 'node')
      .attr('cx', d => d[1].x)
      .attr('cy', d => d[1].y)
      .attr('r', nodeSize * 0.8)
      .attr('fill', config.nodeColor || '#fff');

    // 获取标签显示状态
    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    // 只绘制叶节点的标签
    if (showLabels && layoutResult.type === 'circular') {
      this.g.selectAll('.label')
        .data(leafNodes)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('fill', '#fff')
        .attr('font-size', '8px')
        .attr('text-anchor', d => {
          const x = d[1].x;
          const y = d[1].y;
          const angle = Math.atan2(y - centerY, x - centerX);
          
          if (Math.abs(angle) > Math.PI / 2) {
            return 'end';
          } else {
            return 'start';
          }
        })
        .attr('x', d => {
          const x = d[1].x;
          const y = d[1].y;
          const angle = Math.atan2(y - centerY, x - centerX);
          const offset = 10;
          return x + offset * Math.cos(angle);
        })
        .attr('y', d => {
          const x = d[1].x;
          const y = d[1].y;
          const angle = Math.atan2(y - centerY, x - centerX);
          const offset = 10;
          return y + offset * Math.sin(angle);
        })
        .attr('transform', d => {
          const x = d[1].x;
          const y = d[1].y;
          const angle = Math.atan2(y - centerY, x - centerX);
          let rotation = angle * (180 / Math.PI);
          
          if (Math.abs(angle) > Math.PI / 2) {
            rotation += 180;
          }
          
          return `rotate(${rotation}, ${x}, ${y})`;
        })
        .text(d => {
          const node = this.findNodeById(tree.root, d[0]);
          return node?.name || '';
        });
    }
  }

  private isLeafNode(node: any, id: string): boolean {
    const targetNode = this.findNodeById(node, id);
    return !targetNode || !targetNode.children || targetNode.children.length === 0;
  }

  private findNodeById(node: any, id: string): any {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const result = this.findNodeById(child, id);
        if (result) return result;
      }
    }
    return null;
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

// Canvas渲染器
class CanvasRenderer {
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
    
    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 获取当前变换矩阵（简化实现，实际应该从外部传入）
    const currentZoom = 1; // 实际项目中应该从UI状态获取

    // 调整节点大小和线宽，根据缩放级别
    const nodeSize = Math.max(1, (config.nodeSize || 4) * currentZoom);
    const branchWidth = Math.max(0.5, (config.branchWidth || 1) * currentZoom);

    // 绘制连接线
    this.ctx.strokeStyle = config.branchColor || '#888';
    this.ctx.lineWidth = branchWidth;
    layoutResult.links.forEach(link => {
      const source = layoutResult.nodes[link.source];
      const target = layoutResult.nodes[link.target];
      
      // 视图裁剪：只绘制视口内的连接线
      if (this.isInViewport(source) || this.isInViewport(target)) {
        this.ctx.beginPath();
        
        // 对于矩形布局，使用直角连接线
        if (layoutResult.type === 'rectangular') {
          // 先水平移动到目标节点的x坐标，再垂直移动到目标节点的y坐标
          this.ctx.moveTo(source.x, source.y);
          this.ctx.lineTo(target.x, source.y);
          this.ctx.lineTo(target.x, target.y);
        } else if (layoutResult.type === 'circular' || layoutResult.type === 'radial') {
          // 对于圆形和径向布局，使用曲线连接
          this.drawCurvedLink(source, target);
        } else {
          // 对于其他布局，使用直线连接
          this.ctx.moveTo(source.x, source.y);
          this.ctx.lineTo(target.x, target.y);
        }
        
        this.ctx.stroke();
      }
    });

    // 绘制节点
    this.ctx.fillStyle = config.nodeColor || '#fff';
    Object.entries(layoutResult.nodes).forEach(([id, pos]) => {
      // 视图裁剪：只绘制视口内的节点
      if (this.isInViewport(pos)) {
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, nodeSize, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    });

    // 获取标签显示状态
    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    // 绘制节点标签（根据缩放级别和标签显示状态控制标签密度）
    if (currentZoom > 0.5 && showLabels) { // 只在缩放级别足够大且标签显示状态为true时显示标签
      this.ctx.fillStyle = '#fff';
      this.ctx.font = `${Math.max(8, 12 * currentZoom)}px Arial`;
      this.ctx.textAlign = 'left';
      
      // 对于大规模树，只显示部分标签
      const nodeEntries = Object.entries(layoutResult.nodes);
      const labelDensity = Math.max(1, Math.floor(nodeEntries.length / 100)); // 最多显示100个标签
      
      nodeEntries.forEach(([id, pos], index) => {
        // 视图裁剪：只绘制视口内的标签
        if (this.isInViewport(pos) && index % labelDensity === 0) {
          const node = this.findNodeById(tree.root, id);
          if (node?.name) {
            // 根据布局类型调整标签位置
            if (layoutResult.type === 'circular' || layoutResult.type === 'radial') {
              // 对于圆形和径向布局，标签沿圆周方向排列
              this.drawCircularLabel(node.name, pos);
            } else {
              // 对于其他布局，标签正常排列
              this.ctx.fillText(node.name, pos.x + nodeSize + 4, pos.y + nodeSize / 2);
            }
          }
        }
      });
    }
  }

  private drawCurvedLink(source: { x: number; y: number }, target: { x: number; y: number }): void {
    // 计算连接线的中点
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    
    // 计算控制点，使曲线向中心弯曲
    const centerX = (source.x + target.x) / 2;
    const centerY = (source.y + target.y) / 2;
    
    // 计算到中心的距离
    const distToCenter = Math.sqrt(centerX * centerX + centerY * centerY);
    if (distToCenter > 0) {
      // 向中心方向移动控制点
      const controlOffset = 0.3; // 控制点偏移比例
      const controlX = centerX * (1 - controlOffset);
      const controlY = centerY * (1 - controlOffset);
      
      // 使用贝塞尔曲线绘制
      this.ctx.moveTo(source.x, source.y);
      this.ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    } else {
      // 如果在中心，使用直线连接
      this.ctx.moveTo(source.x, source.y);
      this.ctx.lineTo(target.x, target.y);
    }
  }

  private drawCircularLabel(text: string, pos: { x: number; y: number }): void {
    // 计算标签位置，使其沿圆周方向排列
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    // 计算到中心的向量
    const dx = pos.x - centerX;
    const dy = pos.y - centerY;
    const angle = Math.atan2(dy, dx);
    
    // 计算标签位置，稍微向外偏移
    const labelOffset = 15; // 标签偏移距离
    const labelX = pos.x + labelOffset * Math.cos(angle);
    const labelY = pos.y + labelOffset * Math.sin(angle);
    
    // 保存当前状态
    this.ctx.save();
    
    // 移动到标签位置
    this.ctx.translate(labelX, labelY);
    
    // 旋转文本，使其与圆周切线方向一致
    // 根据角度调整旋转方向，确保文本始终可读
    let rotation = angle;
    if (Math.abs(angle) > Math.PI / 2) {
      // 左侧标签，旋转180度，使文本朝向中心
      rotation += Math.PI;
    }
    
    this.ctx.rotate(rotation);
    
    // 设置文本对齐方式
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    // 绘制文本
    this.ctx.fillText(text, 0, 0);
    
    // 恢复当前状态
    this.ctx.restore();
  }

  private isInViewport(pos: { x: number; y: number }): boolean {
    if (!this.canvas) return false;
    
    // 稍微扩大视口范围，避免边缘节点被裁剪
    const margin = 50;
    return pos.x >= -margin && 
           pos.x <= this.canvas.width + margin && 
           pos.y >= -margin && 
           pos.y <= this.canvas.height + margin;
  }

  private findNodeById(node: any, id: string): any {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const result = this.findNodeById(child, id);
        if (result) return result;
      }
    }
    return null;
  }

  updateTransform(transform: string): void {
    // Canvas变换需要通过ctx.transform实现
    // 这里简化处理，实际项目中需要解析transform字符串
  }

  resize(width: number, height: number): void {
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }
}

// 渲染器工厂函数
export const createRenderer = (container: HTMLElement, config: RenderConfig) => {
  if (config.mode === 'svg') {
    return new SVGRenderer(container, config);
  } else {
    return new CanvasRenderer(container, config);
  }
};
