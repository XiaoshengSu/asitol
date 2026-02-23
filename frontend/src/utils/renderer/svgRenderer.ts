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
    
    // 璁＄畻姣忎釜鑺傜偣鐨勬繁搴﹀眰绾?
    const nodeDepth = new Map<string, number>();
    const maxDepth = this.calculateNodeDepths(tree.root, 0, nodeDepth);
    const depthRange = Math.max(1, maxDepth);
    
    // 璋冭瘯锛氭鏌?nodeDepth 鏄犲皠鏄惁姝ｇ‘濉厖

    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, baseBranchWidth, cladeColorMap, nodeDepth, maxDepth);
      return;
    }

    // 璁＄畻鎵€鏈夊竷灞€鐨勫彾鑺傜偣
    const leafNodeIds = new Set(Object.keys(layoutResult.nodes).filter(id => isLeafNode(tree.root, id)));
    
    // 涓哄渾褰㈠拰寰勫悜甯冨眬璁＄畻鍙惰妭鐐?
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
          // 鏈夌埗鑺傜偣鏃讹紝鍩轰簬鐖惰妭鐐规柟鍚?
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 鏃犵埗鑺傜偣鏃讹紙鏍硅妭鐐癸級锛屽熀浜庝腑蹇冩柟鍚?
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
          // 鎸夌収鍙傝€冩晥鏋滃浘鐨勬柟寮忕粯鍒剁煩褰㈡爲鏍戞灊
          // 鎵€鏈夋爲鏋濋兘鏄洿瑙掑垎鍙夛紝姘村钩绾挎鏈濆彸
          
          // 妫€鏌ョ洰鏍囪妭鐐规槸鍚︿负鍙惰妭鐐?
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 瀵逛簬鍙惰妭鐐癸紝纭繚鏈変竴涓按骞冲悜鍙崇殑绾挎
            // 璁＄畻姘村钩绾挎鐨勭粓鐐箈鍧愭爣锛岀‘淇濇湞鍙?
            const horizontalEndX = Math.max(source.x, target.x) + 18; // 杞婚噺鍙冲欢锛岄伩鍏嶇煩褰㈡爲鏁翠綋澶栨孩
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 瀵逛簬闈炲彾鑺傜偣锛屼娇鐢ㄦ甯哥殑鐩磋鍒嗗弶
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'circular') {
          // 瀵逛簬鍦嗗舰甯冨眬锛屼娇鐢ㄧ煩褰㈠垎鍙?
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }
        
        if (layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
          // 瀵逛簬寰勫悜鍜屾棤鏍瑰竷灞€锛屼娇鐢ㄧ洿绾垮垎鏀?
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
        // 鍩轰簬鐩爣鑺傜偣娣卞害璁＄畻鏍戞灊瀹藉害锛屾牴鑺傜偣鏈€绮楋紝鍙惰妭鐐规渶缁?
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / depthRange);
        // 浣跨敤鏇存槑鏄剧殑瀹藉害鍙樺寲鑼冨洿
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

    // 涓烘瘡涓妭鐐规坊鍔犻€変腑鐘舵€?
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
        // 鍏堢Щ闄ゅ彲鑳藉瓨鍦ㄧ殑鏃ooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 鍒涘缓宸ュ叿鎻愮ず鍏冪礌
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
        
        // 鑾峰彇鑺傜偣淇℃伅
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>鑺傜偣鍚嶇О:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>鑺傜偣ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>瀛愯妭鐐规暟:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>鍒嗘敮闀垮害:</strong> ${node.length}</div>` : ''}
            <div><small>鐐瑰嚮鑺傜偣浠ヨ鑺傜偣涓轰腑蹇冩斁澶?/small></div>
            <div><small>鐐瑰嚮绌虹櫧澶勯噸缃缉鏀?/small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 榧犳爣鎮仠鏃堕珮浜妭鐐?
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', nodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 鏇存柊宸ュ叿鎻愮ず浣嶇疆
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 绉婚櫎鎵€鏈塼ooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 鎭㈠鑺傜偣鍘熷鏍峰紡
        this.applySelectedNodeStyles(nodeSize);
      })
      .on('click', (event, d) => {
        // 浠ラ€変腑鑺傜偣涓轰腑蹇冩斁澶?
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 楂樹寒閫変腑鐨勮妭鐐?
        this.applySelectedNodeStyles(nodeSize);
        
        // 鏇存柊uiStore涓殑閫変腑鐘舵€?

        // 闃绘浜嬩欢鍐掓场锛岀‘淇濋€変腑鐘舵€佷笉琚叾浠栦簨浠惰鐩?
        event.preventDefault();
      });

    this.applySelectedNodeStyles(nodeSize);
    
    // 娣诲姞鐐瑰嚮绌虹櫧澶勯噸缃缉鏀剧殑鍔熻兘
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 鏇存柊 uiStore 涓殑鐘舵€侊紝閲嶇疆缂╂斁鍜屽钩绉?
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 濡傛灉 uiStore 涓嶅彲鐢紝鐩存帴搴旂敤鍙樻崲
          this.updateTransform('');
        }
        // 淇濇寔閫変腑鐘舵€侊紝鍙噸缃缉鏀?
        // 娉ㄦ剰锛氳繖閲屼笉鎭㈠鑺傜偣鏍峰紡锛屽洜涓哄彲鑳芥湁鑺傜偣琚€変腑
      });

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      // 榛樿鍙樉绀哄彾鑺傜偣鏍囩锛岄伩鍏嶉噸鍙?
    let labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? this.selectCircularLabels(circularLeafNodes, centerX, centerY, isLargeTree)
      : circularLeafNodes; // 鐭╁舰甯冨眬鍙樉绀哄彾鑺傜偣
    
    // 瀵逛簬鐭╁舰甯冨眬锛岃繘涓€姝ヤ紭鍖栨爣绛惧瘑搴?
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
            // 鐭╁舰甯冨眬鏍规嵁鍙惰妭鐐规暟閲忚皟鏁村瓧浣撳ぇ灏忥紝浣跨敤鏇村皬鐨勫瓧浣撲互閬垮厤閲嶅彔
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
            // 瀵逛簬鐭╁舰鏍戯紝灏嗘爣绛炬斁鍦ㄥ垎鏀湯绔彸渚?
            return d[1].x + 22; // 淇濇寔鏍囩涓庡垎鏀棿闅旓紝鍚屾椂鍑忓皯瓒婄晫椋庨櫓
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
            // 瀵逛簬鐭╁舰鏍戯紝灏嗘爣绛惧瀭鐩村眳涓簬鍒嗘敮
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
    
    // 娓叉煋娉ㄩ噴鍥惧眰
    this.renderAnnotations(config, cladeColorMap);

    // 娓叉煋瀹屾垚鍚庯紝鏍规嵁 uiStore 涓殑閫変腑鐘舵€侀噸鏂板簲鐢ㄩ珮浜晥鏋?
    if (typeof uiStore !== 'undefined') {
      setTimeout(() => {
        let selectedNodes: string[] = [];
        uiStore.subscribe(state => selectedNodes = state.selectedNodes)();
        
        if (selectedNodes.length > 0) {
          // 楂樹寒閫変腑鐨勮妭鐐?
          selectedNodes.forEach(nodeId => {
            // 杩欓噷鍙互閫氳繃鍏朵粬鏂瑰紡瀹炵幇鑺傜偣楂樹寒
            // 鐢变簬鎴戜滑娌℃湁鐩存帴鐨勬柟娉曟潵鑾峰彇鑺傜偣鍏冪礌锛屾垜浠彲浠ラ€氳繃鏁版嵁缁戝畾鏉ュ疄鐜?
            // 娉ㄦ剰锛氳繖绉嶆柟娉曞彲鑳介渶瑕佽繘涓€姝ヤ紭鍖?
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
          // 瀵逛簬鍦嗗舰甯冨眬锛屼娇鐢ㄧ煩褰㈠垎鍙?
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }

        if (layoutResult.type === 'rectangular') {
          // 鎸夌収鍙傝€冩晥鏋滃浘鐨勬柟寮忕粯鍒剁煩褰㈡爲鏍戞灊
          // 鎵€鏈夋爲鏋濋兘鏄洿瑙掑垎鍙夛紝姘村钩绾挎鏈濆彸
          
          // 妫€鏌ョ洰鏍囪妭鐐规槸鍚︿负鍙惰妭鐐?
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 瀵逛簬鍙惰妭鐐癸紝纭繚鏈変竴涓按骞冲悜鍙崇殑绾挎
            // 璁＄畻姘村钩绾挎鐨勭粓鐐箈鍧愭爣锛岀‘淇濇湞鍙?
            const horizontalEndX = Math.max(source.x, target.x) + 18; // 杞婚噺鍙冲欢锛岄伩鍏嶇煩褰㈡爲鏁翠綋澶栨孩
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 瀵逛簬闈炲彾鑺傜偣锛屼娇鐢ㄦ甯哥殑鐩磋鍒嗗弶
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'radial') {
          // 瀵逛簬寰勫悜甯冨眬锛屼娇鐢ㄧ洿绾垮垎鏀?
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
        // 鍩轰簬鐩爣鑺傜偣娣卞害璁＄畻鏍戞灊瀹藉害锛屾牴鑺傜偣鏈€绮楋紝鍙惰妭鐐规渶缁?
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / Math.max(1, maxDepth));
        // 浣跨敤鏇存槑鏄剧殑瀹藉害鍙樺寲鑼冨洿
        const minWidth = branchWidth * 0.4;
        const maxWidth = branchWidth * 1.6;
        return Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
      })
      .attr('fill', 'none');

    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const largeTreeNodeData = layoutResult.type === 'circular' && leafNodes.length > 300 ? [] : leafNodes;

    // 涓哄ぇ鍨嬫爲鐨勮妭鐐规坊鍔犱氦浜掓晥鏋?
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
        // 鍏堢Щ闄ゅ彲鑳藉瓨鍦ㄧ殑鏃ooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 鍒涘缓宸ュ叿鎻愮ず鍏冪礌
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
        
        // 鑾峰彇鑺傜偣淇℃伅
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>鑺傜偣鍚嶇О:</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>鑺傜偣ID:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>瀛愯妭鐐规暟:</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>鍒嗘敮闀垮害:</strong> ${node.length}</div>` : ''}
            <div><small>鐐瑰嚮鑺傜偣浠ヨ鑺傜偣涓轰腑蹇冩斁澶?/small></div>
            <div><small>鐐瑰嚮绌虹櫧澶勯噸缃缉鏀?/small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 榧犳爣鎮仠鏃堕珮浜妭鐐?
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', largeNodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 鏇存柊宸ュ叿鎻愮ず浣嶇疆
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 绉婚櫎鎵€鏈塼ooltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 鎭㈠鑺傜偣鍘熷鏍峰紡
        this.applySelectedNodeStyles(largeNodeSize);
      })
      .on('click', (event, d) => {
        // 浠ラ€変腑鑺傜偣涓轰腑蹇冩斁澶?
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 楂樹寒閫変腑鐨勮妭鐐?
        this.applySelectedNodeStyles(largeNodeSize);
        
        // 鏇存柊uiStore涓殑閫変腑鐘舵€?

        // 闃绘浜嬩欢鍐掓场锛岀‘淇濋€変腑鐘舵€佷笉琚叾浠栦簨浠惰鐩?
        event.preventDefault();
      });
    
    // 娣诲姞鐐瑰嚮绌虹櫧澶勯噸缃缉鏀剧殑鍔熻兘
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 鏇存柊 uiStore 涓殑鐘舵€侊紝閲嶇疆缂╂斁鍜屽钩绉?
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 濡傛灉 uiStore 涓嶅彲鐢紝鐩存帴搴旂敤鍙樻崲
          this.updateTransform('');
        }
        // 淇濇寔閫変腑鐘舵€侊紝鍙噸缃缉鏀?
        // 娉ㄦ剰锛氳繖閲屼笉鎭㈠鑺傜偣鏍峰紡锛屽洜涓哄彲鑳芥湁鑺傜偣琚€変腑
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
          // 鏈夌埗鑺傜偣鏃讹紝鍩轰簬鐖惰妭鐐规柟鍚?
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 鏃犵埗鑺傜偣鏃讹紙鏍硅妭鐐癸級锛屽熀浜庝腑蹇冩柟鍚?
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

    this.renderAnnotations(config, cladeColorMap);
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
   * 閫掑綊璁＄畻姣忎釜鑺傜偣鐨勬繁搴﹀眰绾?
   * @param node 褰撳墠鑺傜偣
   * @param depth 褰撳墠娣卞害
   * @param nodeDepth 瀛樺偍鑺傜偣娣卞害鐨勬槧灏?
   * @returns 鏈€澶ф繁搴﹀€?
   */
  private calculateNodeDepths(
    node: any,
    depth: number,
    nodeDepth: Map<string, number>
  ): number {
    // 纭繚鑺傜偣鏈?id 灞炴€?
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
   * 浼樺寲鐭╁舰鏍戠殑鏍囩瀵嗗害锛岄伩鍏嶆爣绛鹃噸鍙?
   * @param labels 鍘熷鏍囩鏁版嵁
   * @param isLargeTree 鏄惁涓哄ぇ鍨嬫爲
   * @returns 浼樺寲鍚庣殑鏍囩鏁版嵁
   */
  private optimizeRectangularLabels(
    labels: Array<[string, { x: number; y: number }]>,
    isLargeTree: boolean
  ): Array<[string, { x: number; y: number }]> {
    // 瀵逛簬澶у瀷鏍戯紝閲囩敤鏈€婵€杩涚殑鏍囩闄愬埗绛栫暐
    if (labels.length > 100) {
      // 鍙繚鐣欑害40涓爣绛撅紝纭繚鍙鎬?
      const maxLabels = 40;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 60) {
      // 涓瀷鏍戯紝淇濈暀绾?0涓爣绛?
      const maxLabels = 50;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 30) {
      // 灏忓瀷鏍戯紝淇濈暀绾?0涓爣绛?
      const maxLabels = 60;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    }
    
    // 鎸?Y 鍧愭爣鎺掑簭鏍囩
    const sortedLabels = [...labels].sort((a, b) => a[1].y - b[1].y);
    
    // 閲囨牱鏍囩锛岀‘淇濆瀭鐩存柟鍚戜笂鏈夎冻澶熼棿璺?
    const optimizedLabels: Array<[string, { x: number; y: number }]> = [];
    // 澶у箙澧炲姞鏈€灏忓瀭鐩撮棿璺濓紝纭繚鏍囩涓嶉噸鍙?
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
   * 浠ラ€変腑鑺傜偣涓轰腑蹇冭繘琛屽尯鍩熸斁澶?
   * @param nodeId 閫変腑鑺傜偣鐨処D
   * @param layoutResult 甯冨眬缁撴灉
   * @param config 娓叉煋閰嶇疆
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
    
    // 璁＄畻骞崇Щ閲忥紝浣块€変腑鑺傜偣鎴愪负涓績
    const translateX = centerX - nodePos.x;
    const translateY = centerY - nodePos.y;
    
    // 璁＄畻缂╂斁姣斾緥锛屾斁澶?鍊?
    const scale = 2;
    
    // 鍏堟洿鏂?uiStore 涓殑閫変腑鐘舵€?
    if (typeof uiStore !== 'undefined') {
      uiStore.selectNode(nodeId);
    }
    
    // 鐒跺悗鏇存柊缂╂斁鍜屽钩绉荤姸鎬?
    if (typeof uiStore !== 'undefined') {
      // 璁＄畻鏂扮殑缂╂斁鍜屽钩绉荤姸鎬?
      const newZoom = scale;
      const newPan = { x: translateX, y: translateY };
      
      // 鏇存柊 uiStore 鐘舵€?
      uiStore.setZoom(newZoom);
      uiStore.setPan(newPan);
    } else {
      // 濡傛灉 uiStore 涓嶅彲鐢紝鐩存帴搴旂敤鍙樻崲
      const transform = `translate(${translateX}, ${translateY}) scale(${scale})`;
      this.updateTransform(transform);
    }
    
    // 淇濇寔閫変腑鑺傜偣鐨勯珮浜姸鎬?
    // 娉ㄦ剰锛氱敱浜庢垜浠槸鍦⊿VG鍙樻崲灞傞潰杩涜缂╂斁锛岃妭鐐圭殑DOM鍏冪礌骞舵病鏈夋敼鍙?
    // 鎵€浠ラ€変腑鐘舵€佷細鑷姩淇濇寔锛屼笉闇€瑕侀澶栨搷浣?
  }

  /**
   * 娓叉煋娉ㄩ噴鍥惧眰
   * @param config 娓叉煋閰嶇疆
   */
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

  /**
   * 娓叉煋鑹插甫娉ㄩ噴
   * @param group SVG缁勫厓绱?
   * @param annotation 娉ㄩ噴鏁版嵁
   * @param config 娓叉煋閰嶇疆
   */
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
    const position = annotation.config?.position === 'left' ? 'left' : 'right';
    const rows = this.getAnnotationRows(annotation);
    if (rows.length === 0) return;

    const rowHeight = this.getAnnotationRowHeight(rows);
    const layerGap = 10;
    const layerOffset = layerIndex * (trackWidth + layerGap);
    const baseX = this.getAnnotationBaseX(rows, position, config, trackWidth, layerOffset);
    const showValue = Boolean(annotation.config?.showLegend) && rows.length <= 36;
    const backgroundColor = config.backgroundColor || '#242424';
    const titleY = Math.max(10, rows[0].pos.y - rowHeight * 0.9);

    group.append('text')
      .attr('x', baseX)
      .attr('y', titleY)
      .attr('fill', '#cbd5e1')
      .attr('font-size', '9px')
      .attr('font-weight', 600)
      .text(annotation.name || annotation.type);

    rows.forEach(({ id, pos, nodeData }) => {
      const branchColor = this.getBranchColorForNode(id, config, cladeColorMap);
      const baseColor = this.getLinkedColor(branchColor, nodeData?.color, annotation);
      const y = pos.y - rowHeight / 2;
      let drawWidth = trackWidth;
      const drawHeight = Math.max(3, rowHeight * 0.82);
      let fillColor = ensureContrast(baseColor, backgroundColor);
      const strokeColor = d3.hsl(fillColor).darker(0.75).formatHex();
      let drawAsPie = false;

      if (annotation.type === 'HEATMAP') {
        const ratio = this.normalizeValue(nodeData?.value, annotation.config?.minValue, annotation.config?.maxValue, 1);
        const hsl = d3.hsl(branchColor);
        const low = d3.hsl(hsl.h, this.clamp(hsl.s * 0.25, 0.14, 0.35), 0.2).formatHex();
        const high = d3.hsl(hsl.h, this.clamp(hsl.s * 1.05, 0.55, 0.95), 0.75).formatHex();
        fillColor = ensureContrast(d3.interpolateHsl(low, high)(ratio), backgroundColor);
      } else if (annotation.type === 'BARCHART') {
        const ratio = this.normalizeValue(nodeData?.value, annotation.config?.minValue, annotation.config?.maxValue, 100);
        drawWidth = Math.max(2, trackWidth * ratio);
        group.append('rect')
          .attr('x', baseX)
          .attr('y', y)
          .attr('width', trackWidth)
          .attr('height', drawHeight)
          .attr('fill', 'rgba(148, 163, 184, 0.22)')
          .attr('rx', 2)
          .attr('ry', 2);

        const hsl = d3.hsl(branchColor);
        fillColor = ensureContrast(
          d3.hsl(hsl.h, this.clamp(hsl.s * 0.9, 0.4, 0.95), this.clamp(0.36 + ratio * 0.33, 0.34, 0.76)).formatHex(),
          backgroundColor
        );
      } else if (annotation.type === 'BINARY') {
        const truthy = Number(nodeData?.value) > 0 || nodeData?.value === true || String(nodeData?.value).toLowerCase() === 'true';
        drawWidth = Math.max(8, Math.min(trackWidth, 14));
        fillColor = truthy
          ? ensureContrast(this.blendColors(baseColor, branchColor, 0.62), backgroundColor)
          : d3.hsl(d3.hsl(branchColor).h, 0.1, 0.24).formatHex();
      } else if (annotation.type === 'PIECHART') {
        drawAsPie = true;
        const rawValues = Array.isArray(nodeData?.values)
          ? nodeData.values.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
          : [];
        const values = rawValues.length > 0 ? rawValues : [1];
        const pieRadius = this.clamp(Number(annotation.config?.radius ?? rowHeight * 0.56), 4, 11);
        const pieX = baseX + pieRadius;
        const pieY = pos.y;
        const palette = Array.isArray(nodeData?.colors) && nodeData.colors.length > 0
          ? nodeData.colors as string[]
          : this.buildPiePalette(branchColor, values.length);
        const arcGenerator = d3.arc<d3.PieArcDatum<number>>().innerRadius(0).outerRadius(pieRadius);
        const pieData = d3.pie<number>().value((value: number) => value)(values);

        group.append('circle')
          .attr('cx', pieX)
          .attr('cy', pieY)
          .attr('r', pieRadius)
          .attr('fill', 'rgba(148, 163, 184, 0.18)');

        pieData.forEach((arcDatum, arcIndex) => {
          const path = arcGenerator(arcDatum);
          if (!path) return;
          const paletteColor = palette[arcIndex % palette.length];
          const pieColor = ensureContrast(this.blendColors(paletteColor, branchColor, 0.35), backgroundColor);
          group.append('path')
            .attr('d', path)
            .attr('transform', `translate(${pieX}, ${pieY})`)
            .attr('fill', pieColor)
            .attr('stroke', 'rgba(15, 23, 42, 0.35)')
            .attr('stroke-width', 0.6);
        });

        group.append('circle')
          .attr('cx', pieX)
          .attr('cy', pieY)
          .attr('r', pieRadius)
          .attr('fill', 'none')
          .attr('stroke', 'rgba(226, 232, 240, 0.6)')
          .attr('stroke-width', 0.6);

        drawWidth = pieRadius * 2;
      }

      if (!drawAsPie) {
        group.append('rect')
          .attr('x', baseX)
          .attr('y', y)
          .attr('width', drawWidth)
          .attr('height', drawHeight)
          .attr('fill', fillColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', 0.7)
          .attr('rx', 2)
          .attr('ry', 2);
      }

      if (showValue) {
        const valueLabel = annotation.type === 'PIECHART'
          ? (Array.isArray(nodeData?.values) ? nodeData.values.join('/') : '')
          : (nodeData?.value ?? '');
        if (valueLabel !== '') {
          group.append('text')
            .attr('x', baseX + drawWidth + 4)
            .attr('y', pos.y)
            .attr('dominant-baseline', 'middle')
            .attr('text-anchor', 'start')
            .attr('fill', '#e2e8f0')
            .attr('font-size', '8px')
            .text(String(valueLabel));
        }
      }
    });
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
    const viewportPadding = 8;

    const rawX = position === 'left'
      ? minX - 18 - trackWidth - layerOffset
      : maxX + 24 + (this.layoutType === 'rectangular' ? labelReserve : 0) + layerOffset;

    return this.clamp(rawX, viewportPadding, Math.max(viewportPadding, config.width - trackWidth - viewportPadding));
  }

  private getLinkedColor(branchColor: string, annotationColor: unknown, annotation: AnnotationData): string {
    const color = typeof annotationColor === 'string' ? annotationColor : branchColor;
    const linkToBranch = annotation.config?.linkToBranchColor !== false;
    if (!linkToBranch) return color;
    return this.blendColors(color, branchColor, 0.55);
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
      uiStore.subscribe(state => {
        showLabels = state.showLabels;
      })();
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

// 纭繚鍦ㄦ覆鏌撳墠璁剧疆鏍戝拰鑺傜偣鏁版嵁
export const createRenderer = (container: HTMLElement, config: RenderConfig): any => {
  const renderer = new SVGRenderer(container, config);
  
  // 閲嶅啓render鏂规硶锛岀‘淇濊缃爲鍜岃妭鐐规暟鎹?
  const originalRender = renderer.render;
  renderer.render = function(tree: any, layoutResult: LayoutResult, config: RenderConfig) {
    this.tree = tree;
    this.nodes = layoutResult.nodes;
    originalRender.call(this, tree, layoutResult, config);
  };
  
  return renderer;
};


