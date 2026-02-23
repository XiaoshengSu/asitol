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
    
    // 闁荤姳绶ょ槐鏇㈡偩鐠囨畫鎺曠疀鎼淬劌娈濋梺鐓庢惈閸婂宕戦敐澶嬪剭闁告洦鍓涚粻鎺楀箹鏉堝墽鐣遍柣顏呭閻?
    const nodeDepth = new Map<string, number>();
    const maxDepth = this.calculateNodeDepths(tree.root, 0, nodeDepth);
    const depthRange = Math.max(1, maxDepth);
    
    // 闁荤姴顑呴崯鎶芥儊椤栫偞鏅慨姗嗗弾濮婇箖鏌?nodeDepth 闂佸搫瀚慨鎾儍閻樿鍙婃い鏍ㄧ閸庡﹥鎱ㄥ┑鎾舵偧闁炽儲蓱缁诲懘顢曢姀鐘茬

    if (nodeCount > 1000) {
      this.renderLargeTree(tree, layoutResult, config, centerX, centerY, nodeSize, baseBranchWidth, cladeColorMap, nodeDepth, maxDepth);
      return;
    }

    // 闁荤姳绶ょ槐鏇㈡偩婵犳艾绠ラ柍褜鍓熷鍨緞婵犲嫷浼岄柣蹇曞亹閸嬫捇鏌ｉ妸銉ヮ仼鐟滀即绠栭幊鐐哄磼濠婂啩鍖?
    const leafNodeIds = new Set(Object.keys(layoutResult.nodes).filter(id => isLeafNode(tree.root, id)));
    
    // 婵炴垶鎸搁幖顐€掗幑鎰╀汗闁靛繒濮电€氳尙鈧灚婢樼€氼剟骞冨鍛殰闁告劑鍔庡﹢浼存偣娓氬﹦纾块柣锝咁煼瀹曪綁骞嗛弶璇炬繈鏌?
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
          // 闂佸搫鐗嗛ˇ閬嶅春濡ゅ懏鍤嶉柛灞剧矊娴狀垶鏌￠崘顓у晣缂佽鲸绻堝畷鐑樻姜閹殿喛澹橀梺缁樼墬閸庡吋淇婇銏″€烽悷娆忓閻撴瑩鏌?
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 闂佸搫鍟版慨鐑藉春濡ゅ懏鍤嶉柛灞剧矊娴狀垶鏌￠崘顓у晣缂佽鲸鐟╁鐣屾兜閸涱厙婵嬫煟閹邦喗顏熺紒杈ㄥ哺閺佸秶浠﹂悾灞芥暏婵炲瓨绮岀花濂告嚈閹达絿鐤€闁告劏鏅滈悡娆撴煕?
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
          // 闂佸湱顭堥ˇ閬嶅矗鎼淬劌鐭楅柛灞剧妇閸嬫捇宕橀埡鍌涚彙闂佸搫顑嗙划灞矫瑰鈧幆鍐礋椤掍胶鍘甸悗娈垮枛缁绘帞鍒掗鐐茬闁告挷鑳堕崣鎰喐閼割剙鐏柣鏍ㄧ叀瀵粙骞嬮悙鍏稿枈
          // 闂佸湱顣介崑鎾绘煛閸繍妲归柣鏍ㄧ叀瀵鈹戠€ｎ亜骞嬮梺鍝勫閸ㄥ啿煤鐠恒劍鍠嗛柟鐑樺灥閻庡鏌涘▎蹇ｆ缂佽鲸绻傞～婵嬪级閹达附灏欑紓浣哄亾鐎笛囶敊瀹€鍕珘婵犻潧妫楃粈?
          
          // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姢婵炶弓鍗冲浠嬪炊椤忓嫀婵嬫煟閹邦垼娼愭俊鍙夋倐瀹曘儵鏁傞懗顖滎槹闂佸憡鐟﹂崕鍏间繆椤撱垺鍊?
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 闁诲海鏁婚埀顒佺〒閼归箖鏌涘▎鎰姸濠碘槅鍙冮幃娆撴儌閸濄儳顦紒缁㈠弾閸犳洜鎹㈠璺哄珘濠㈣泛顦遍鍗炩槈閹垮啩绨奸柟绋款樀閻涱噣宕橀崣澶娾偓濠氭煕濞嗗繒锛嶆繛鍫熷灩閻ヮ亪骞愭惔顔兼杸
            // 闁荤姳绶ょ槐鏇㈡偩鐠囧樊娼╅柡澶嬪灴閹割剛绱掗悙顒€顕滄い鏂跨焸閹啴宕熼鐘电厜闂佺粯鍔楅悾褔鏌涜閸旀牠鎮ラ敐澶嬫櫖鐎光偓閳ь剟鍨惧Ο鑽も攳婵犻潧娲︾弧鍌炴煕?
            const horizontalEndX = Math.max(source.x, target.x) + 18;
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 闁诲海鏁婚埀顒佺〒閼归箖姊婚崼銏犱粶鐟滀即绠栭幊鐐哄磼濠婂啩鍖栭梺鎸庣☉婵傛梹绻涢崶顒佸仺闁靛瀵岄崝鈧柣銏╁灠閹芥粌鈻撻幋锔藉剮缁炬儳顑愬锟犳煕閹烘垶顥滅€?
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'circular') {
          // 闁诲海鏁婚埀顒佺〒閼归箖鏌涢敃鈧Λ妤呮嚋閹殿喗鏆滈柛鎰╁妿濠€浼存煥濞戞ê顨欏┑鐐叉喘閹粙濡歌閸欐劗鎲搁懜顒€鐏╅柛銊ラ叄瀹?
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }
        
        if (layoutResult.type === 'radial' || layoutResult.type === 'unrooted') {
          // 闁诲海鏁婚埀顒佺〒閼瑰墽鈧灚婢樼€氼剟骞冨鍫濇そ閻忕偟鍋撻敓銉╂煛瀹ュ洦鍤€缂佹棃顥撴禒锕傚焵椤掑嫭鏅悘鐐靛帶閳诲繘鏌ｉ～顒€濡挎繛鑼舵硶閻ヮ亪宕归鑲┾偓濠氭煛閳?
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
        // 闂佺硶鏅炲銊ц姳椤掑嫭鍎庢い鏃傛櫕閸ㄥジ鏌ら崫鍕偓濠氬磻閿濆惓搴ㄥ础閻愬樊鍞洪柣鐘辩筏缁辨洟鎮炬繝姘唨闁瑰鍋熸禍浼存倵绾懏顥夐悗瑙勫▕閺佸秶浠﹂崜褍顥戦梺鐓庢惈閸婂宕戦敐澶婂珘闁逞屽墰閸掓帒螖鐎ｎ剛顦梺鍛婄懄閸庡吋淇婇銏″€烽悷娆忓娴犳绱?
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / depthRange);
        // 婵炶揪缍€濞夋洟寮妶澶婂嵆閻庢稒蓱椤牠鏌￠崟顐⑩挃婵炲牊鍨归埀顒傤攰濡嫮鈧濞婂畷锝呂熼崫鍕靛殭闂佽偐鍘ч崯顐⒚?
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

    // 婵炴垶鎸鹃崕銈夋儊閳╁啰鈻旀い蹇撴搐铻￠梺缁樺姌椤宕告繝鍥х闁绘鍎甸崑鎾村緞婢跺骸骞€闂佺粯顭堥崺鏍焵?
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
        // 闂佺绻愰悧蹇庣昂闂傚倸瀚ㄩ崐鏇°亹閺屻儲鍤勯柦妯侯槺閹界娀鏌涢敂鍝勫婵炲牊鍨垮顕€鈥旂花鍗璴tip
        d3.selectAll('.tree-tooltip').remove();
        
        // 闂佸憡甯楃粙鎴犵磽閹炬剚鍟呴柕澶堝劚瀵版棃鏌熺紒妯哄闁靛洦宀稿畷妤呭礃椤忓棭妲?
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
        
        // 闂佸吋鍎抽崲鑼躲亹閸ヮ剚鍤嶉柛灞剧矊娴狀垰菐閸ワ絽澧插ù?
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>闂佺厧鎼崐濠氬磻閿濆瑙︾€广儱娉?</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>闂佺厧鎼崐濠氬磻椤ゅ粚:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>闁诲孩绋掗崝妯讳繆椤撱垺鍊烽悷娆忓濞?</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>闂佸憡甯掑Λ娆撳极椤曗偓濮婂綊宕归纰卞敽:</strong> ${node.length}</div>` : ''}
            <div><small>闂佺粯鍔楅幊鎾诲吹椤曗偓閹崇偤宕掑鍐у寲婵炲濮伴崕鎾敋濮樿埖鍤嶉柛灞剧矊娴狀垰鈽夐幘瑙勩€冮柤鍨灱缁犳盯宕橀埡鍌涙緬婵?/small></div>
            <div><small>闂佺粯鍔楅幊鎾诲吹椤斿墽鐭氶柧蹇氼潐椤忋倕顭跨捄鍝勵伃闁革絽鎽滅槐鏃堫敊閸撗呯闂佽　鍋?/small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 婵崿鍛ｉ柣鏍电秮楠炲啴顢楅埀顒佺閻樿绫嶉柛顐ｆ礈瑜邦垰霉濠婂骸鏋﹀┑鈽嗗弮閹?
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', nodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 闂佸搫娲ら悺銊╁蓟婵犲偆鍟呴柕澶堝劚瀵版棃鏌熺紒妯哄闁靛洦纰嶉幏鍛吋閸モ晜鐎?
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 缂備礁顦…宄扳枍鎼淬劌绠ラ柍褜鍓熷鍨箙缁扁偓oltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 闂佽鍘归崹褰捤囬弻銉﹀殟闁稿本绮屾禒顖炴煕濡厧鏋庢い顐ｅ姍瀵棄鐣￠幍顔绢攨
        this.applySelectedNodeStyles(nodeSize);
      })
      .on('click', (event, d) => {
        // 婵炲濮伴崕鐢稿焵椤掆偓椤︻噣鎳欓幋锔藉殟闁稿本绮屾禒顖氣槈閹捐銆冮柤鍨灱缁犳盯宕橀埡鍌涙緬婵?
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 婵°倕鍊圭湁閻庡灚甯￠弻鍛緞婢跺骸骞€闂佹眹鍔岀€氼垱淇婇銏″€?
        this.applySelectedNodeStyles(nodeSize);
        
        // 闂佸搫娲ら悺銊╁蓟婵℃Store婵炴垶鎼╅崢鎯р枔閹达附鐒诲璺侯槼閸橆剟鏌ｅΟ鍨厫闁?

        // 闂傚倸鍟扮划顖烆敆濞戞瑧顩查悗锝傛櫆椤愪粙鏌涢幇顓炵瑲闁革附妞介弫宥呯暆閳ь剟鍨惧Ο鑽も攳婵犻潧顑傞崑鎾村緞婢跺骸骞€闂佺粯顭堥崺鏍焵椤戞寧顦风紒妤€顦遍幃顕€顢曢姀鐘茬翻婵炲濮甸悧鏃傝姳閵婏妇顩烽柟顖炲亰濞差剟鏌?
        event.preventDefault();
      });

    this.applySelectedNodeStyles(nodeSize);
    
    // 濠电儑缍€椤曆勬叏閻愮儤鍊烽柣鐔告緲濮ｅ﹦绱掑畝鍐╊仩婵炲憞鍕窞闁告洦鍨板▍銏㈢磽閸愭儳鏋ょ紓鍌氼樀瀵劑宕滆閻ｉ亶鏌涢弮鍌氭灆闁?
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 闂佸搫娲ら悺銊╁蓟?uiStore 婵炴垶鎼╅崢鎯р枔閹达附鍋愰柤鍝ヮ暯閸嬫挻绗熸繝鍕槷闂備焦褰冪粔鍫曟偪閸℃瑧纾介柍鍝勫€归弶褰掓煕濠婂啳瀚伴梺瑙ｆ櫇缁?
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 婵犵鈧啿鈧綊鎮?uiStore 婵炴垶鎸哥粔纾嬨亹閺屻儲鍋ㄦい顓熷笧缁€澶愭煟閳轰胶鎽犻悽顖氱摠閹棃寮崒娑欐闂佸憡鐟﹁摫鐎?
          this.updateTransform('');
        }
        // 婵烇絽娲︾换鍐偓鍨閺屽懏寰勬径搴″箑闂佺粯顭堥崺鏍焵椤戣法绛忕紒杈ㄧ箞瀹曪綁顢旈崼婵囶仧缂傚倸鍠氶崰姘辩磽婢舵劕缁?
        // 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯虹－缁犲綊姊洪幓鎺戭殭缂佹顦甸獮渚€濮€閻欌偓濡插鏌ら崫鍕偓濠氬磻閿濆鍐€鐎瑰嫭澹嗙涵鈧梺鎸庣☉閼活垰煤濠婂嫮鈻旈柛婵嗗鐠佹煡鏌ょ€圭姴袚婵犫偓娓氣偓閹崇偤宕掑鍐у寲闁荤偞鍑归崑濠囧焵椤掆偓椤︻噣鎳?
      });

    let showLabels = true;
    uiStore.subscribe(state => showLabels = state.showLabels)();

    if (showLabels) {
      // 婵帗绋掗…鍫ヮ敇婵犳艾鐭楁い蹇撴噺閳绘梻绱掗埀顒勫传閸曨偊鐛庨梺鐓庢惈閸婂宕戦敐澶婂唨闁搞儮鏅╅崝顕€鏌ㄥ☉妯肩劯濞村皷鏅犲畷妤€顓兼径濠冾仧闂?
    let labelData = (layoutResult.type === 'circular' || layoutResult.type === 'radial' || layoutResult.type === 'unrooted')
      ? this.selectCircularLabels(circularLeafNodes, centerX, centerY, isLargeTree)
      : circularLeafNodes; // 闂佹椿鍘搁弲娑㈡嚋閹殿喗鏆滈柛鎰╁妿濠€浼存煕濞嗘ü绨兼俊顖氼槺缁牓宕崟顐︾崕闂佺厧鎼崐濠氬磻?
    
    // 闁诲海鏁婚埀顒佺〒閼归箖鏌ｉ娑欐珔闁煎憡澹嗛弫顕€宕橀妸褎鎷遍梺鎸庣☉閻胶鎹㈠Ο鑽も枖闁逞屽墮椤垽濡烽妶鍥ф灎闂佸憡鐗楅悧妤呮偉閿濆洨椹抽柟顖嗗懏顫氶柟?
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
            // 闂佹椿鍘搁弲娑㈡嚋閹殿喗鏆滈柛鎰╁妿濠€浼存煛瀹ュ牜娼愮€规挷绶氬畷锝夊箚閺夎婵嬫煟閹邦垼娼愰柡鍡欏枛閺屽矁绠涘杈啀闂佽桨鐒﹀娆撴偤瑜庨幏鍛村箻閻愭垝娴烽柣蹇撶箰妤犲繒妲愬┑鍥ㄥ閻犳亽鍔嶉弳蹇涙煛閸ャ劍缍戦柣顭戝墴閹啴宕熼銈嗘喕婵炶揪绲鹃幐閿嬬閹烘鐒奸柛顭戝枛鐢娊姊洪幓鎺斝㈢憸?
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
            // 闁诲海鏁婚埀顒佺〒閼归箖鏌ｉ娑欐珔闁奸晲鍗冲浠嬪箣椤栨粎顦柣蹇撶箰濡瑩鎮ラ敐鍥╅┏闁绘劦鍓氶弶褰掓煕閿斿搫濡奸柛銊ラ叄瀵劑顢涘☉娆愮潣缂備焦妫忛崹鎷屻亹閸涘﹦鐟?
            return d[1].x + 22;
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
            // 闁诲海鏁婚埀顒佺〒閼归箖鏌ｉ娑欐珔闁奸晲鍗冲浠嬪箣椤栨粎顦柣蹇撶箰濡瑩鎮ラ敐鍥╅┏闁诡垎鍛亾椤撱垺鍎庨柡澶嬪灩濠€宄扳槈閹垮啫骞掔紒顭戝墴瀹曟岸宕卞Ο缁樻
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
    
    // 濠电偞鎸稿鍫曟偂鐎ｎ亖鏋栭柕濞炬櫅濞呯偤鏌涢妷锕€鍔ら柣?
    if (config.annotationDisplayMode !== 'legend') {
      this.renderAnnotations(config, cladeColorMap);
    }

    // 濠电偞鎸稿鍫曟偂鐎ｎ兘鍋撻悷鐗堟拱闁搞劍宀稿畷銉︽償椤栨粎顦梺鍝勭Х椤鐣?uiStore 婵炴垶鎼╅崢鎯р枔閹达附鐒诲璺侯槼閸橆剟鏌ｅΟ鍨厫闁逞屽厸缁舵岸宕抽幖浣告闁哄娉曠€瑰鏌ｉ～顒€濮傞柣婵愬枟缁傚秹顢欓懞銉︾彙闂?
    if (typeof uiStore !== 'undefined') {
      setTimeout(() => {
        let selectedNodes: string[] = [];
        uiStore.subscribe(state => selectedNodes = state.selectedNodes)();
        
        if (selectedNodes.length > 0) {
          // 婵°倕鍊圭湁閻庡灚甯￠弻鍛緞婢跺骸骞€闂佹眹鍔岀€氼垱淇婇銏″€?
          selectedNodes.forEach(nodeId => {
            // 闁哄鏅滈悷鈺呭闯閻戣棄鐭楁い鏍ㄧ懁缁ㄤ即姊洪锝勪孩缂佽鍟村畷妤呭嫉閻㈢敻鎼ㄩ梺鍝勫€婚幊鎾舵閿涘嫧鍋撻崷顓炰户妤犵偛娲幊鐐哄磼濠婂啩鍖栨俊銈呭€圭湁閻?
            // 闂佹眹鍨硅ぐ澶岃姳椤掑嫬绠ｉ柟瀛樼矋缁附绻涚仦绋垮⒉婵犫偓娓氣偓閹嫮鈧稒锚婢跺秹鏌ｉ妸銉ヮ仾闁哄瞼鍠庨埢鏃堝即閻旀悂妾烽梺鍏煎劤閸㈣尪銇愰崶顒佸殟闁稿本绮屾禒顖炴煕韫囨挸鏆熺紒鈧畝鍕櫖閻忕偞鍎抽悘澶娒归悪鈧崜娆掋亹閸欏顩烽柕澶嗘杹閸嬫挸顫濆畷鍥╃暫闂佽桨鑳舵晶妤€鐣垫担铏圭＜闁瑰瓨绻勯弳浼存煛婢跺牆鍔氶柣銈呭閹?
            // 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯虹－缁犲湱绱掓径濠勑ｉ柡宀€鍠庨埢鏃堝即閻愯尪顔夐梺鐓庡帠缁瑥銆掗崜浣瑰暫濞达絿鏅粻璇测槈閹绢垰浜惧┑顔界缚閸庢壆妲愰銏犵?
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
          // 闁诲海鏁婚埀顒佺〒閼归箖鏌涢敃鈧Λ妤呮嚋閹殿喗鏆滈柛鎰╁妿濠€浼存煥濞戞ê顨欏┑鐐叉喘閹粙濡歌閸欐劗鎲搁懜顒€鐏╅柛銊ラ叄瀹?
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
        }

        if (layoutResult.type === 'rectangular') {
          // 闂佸湱顭堥ˇ閬嶅矗鎼淬劌鐭楅柛灞剧妇閸嬫捇宕橀埡鍌涚彙闂佸搫顑嗙划灞矫瑰鈧幆鍐礋椤掍胶鍘甸悗娈垮枛缁绘帞鍒掗鐐茬闁告挷鑳堕崣鎰喐閼割剙鐏柣鏍ㄧ叀瀵粙骞嬮悙鍏稿枈
          // 闂佸湱顣介崑鎾绘煛閸繍妲归柣鏍ㄧ叀瀵鈹戠€ｎ亜骞嬮梺鍝勫閸ㄥ啿煤鐠恒劍鍠嗛柟鐑樺灥閻庡鏌涘▎蹇ｆ缂佽鲸绻傞～婵嬪级閹达附灏欑紓浣哄亾鐎笛囶敊瀹€鍕珘婵犻潧妫楃粈?
          
          // 濠碘槅鍋€閸嬫捇鏌＄仦璇插姢婵炶弓鍗冲浠嬪炊椤忓嫀婵嬫煟閹邦垼娼愭俊鍙夋倐瀹曘儵鏁傞懗顖滎槹闂佸憡鐟﹂崕鍏间繆椤撱垺鍊?
          const isTargetLeaf = !findNodeById(tree.root, d.target)?.children || findNodeById(tree.root, d.target)?.children.length === 0;
          
          if (isTargetLeaf) {
            // 闁诲海鏁婚埀顒佺〒閼归箖鏌涘▎鎰姸濠碘槅鍙冮幃娆撴儌閸濄儳顦紒缁㈠弾閸犳洜鎹㈠璺哄珘濠㈣泛顦遍鍗炩槈閹垮啩绨奸柟绋款樀閻涱噣宕橀崣澶娾偓濠氭煕濞嗗繒锛嶆繛鍫熷灩閻ヮ亪骞愭惔顔兼杸
            // 闁荤姳绶ょ槐鏇㈡偩鐠囧樊娼╅柡澶嬪灴閹割剛绱掗悙顒€顕滄い鏂跨焸閹啴宕熼鐘电厜闂佺粯鍔楅悾褔鏌涜閸旀牠鎮ラ敐澶嬫櫖鐎光偓閳ь剟鍨惧Ο鑽も攳婵犻潧娲︾弧鍌炴煕?
            const horizontalEndX = Math.max(source.x, target.x) + 18;
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y} L ${horizontalEndX} ${target.y}`;
          } else {
            // 闁诲海鏁婚埀顒佺〒閼归箖姊婚崼銏犱粶鐟滀即绠栭幊鐐哄磼濠婂啩鍖栭梺鎸庣☉婵傛梹绻涢崶顒佸仺闁靛瀵岄崝鈧柣銏╁灠閹芥粌鈻撻幋锔藉剮缁炬儳顑愬锟犳煕閹烘垶顥滅€?
            return `M ${source.x} ${source.y} L ${target.x} ${source.y} L ${target.x} ${target.y}`;
          }
        }

        if (layoutResult.type === 'radial') {
          // 闁诲海鏁婚埀顒佺〒閼瑰墽鈧灚婢樼€氼剟骞冨鍛殰闁告劑鍔庡﹢浼存煥濞戞ê顨欏┑鐐叉喘閹粙濡歌缁绢垳绱掗幆褏浠㈤柛銊ラ叄瀵?
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
        // 闂佺硶鏅炲銊ц姳椤掑嫭鍎庢い鏃傛櫕閸ㄥジ鏌ら崫鍕偓濠氬磻閿濆惓搴ㄥ础閻愬樊鍞洪柣鐘辩筏缁辨洟鎮炬繝姘唨闁瑰鍋熸禍浼存倵绾懏顥夐悗瑙勫▕閺佸秶浠﹂崜褍顥戦梺鐓庢惈閸婂宕戦敐澶婂珘闁逞屽墰閸掓帒螖鐎ｎ剛顦梺鍛婄懄閸庡吋淇婇銏″€烽悷娆忓娴犳绱?
        const targetDepth = nodeDepth.get(d.target) || 0;
        const widthRatio = 1 - (targetDepth / Math.max(1, maxDepth));
        // 婵炶揪缍€濞夋洟寮妶澶婂嵆閻庢稒蓱椤牠鏌￠崟顐⑩挃婵炲牊鍨归埀顒傤攰濡嫮鈧濞婂畷锝呂熼崫鍕靛殭闂佽偐鍘ч崯顐⒚?
        const minWidth = branchWidth * 0.4;
        const maxWidth = branchWidth * 1.6;
        return Math.max(minWidth, minWidth + (maxWidth - minWidth) * widthRatio);
      })
      .attr('fill', 'none');

    const leafNodes = Object.entries(layoutResult.nodes).filter(([id]) => isLeafNode(tree.root, id));
    const largeTreeNodeData = layoutResult.type === 'circular' && leafNodes.length > 300 ? [] : leafNodes;

    // 婵炴垶鎸搁幖顐﹀Φ閸ヮ剙鍨傞悗锝庡亞閸╂劙鏌ｉ妸銉ヮ伂濠碘槅鍙冮幃娆戞喆閸曨偅缍夐梺鍛婃⒒婵啿顫濋敂鐣岊洸闁圭儤鎸诲▍蹇涙煛?
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
        // 闂佺绻愰悧蹇庣昂闂傚倸瀚ㄩ崐鏇°亹閺屻儲鍤勯柦妯侯槺閹界娀鏌涢敂鍝勫婵炲牊鍨垮顕€鈥旂花鍗璴tip
        d3.selectAll('.tree-tooltip').remove();
        
        // 闂佸憡甯楃粙鎴犵磽閹炬剚鍟呴柕澶堝劚瀵版棃鏌熺紒妯哄闁靛洦宀稿畷妤呭礃椤忓棭妲?
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
        
        // 闂佸吋鍎抽崲鑼躲亹閸ヮ剚鍤嶉柛灞剧矊娴狀垰菐閸ワ絽澧插ù?
        const node = findNodeById(tree.root, d[0]);
        if (node) {
          const tooltipContent = `
            <div><strong>闂佺厧鎼崐濠氬磻閿濆瑙︾€广儱娉?</strong> ${node.name || 'Unnamed'}</div>
            <div><strong>闂佺厧鎼崐濠氬磻椤ゅ粚:</strong> ${node.id}</div>
            ${node.children && node.children.length > 0 ? `<div><strong>闁诲孩绋掗崝妯讳繆椤撱垺鍊烽悷娆忓濞?</strong> ${node.children.length}</div>` : ''}
            ${node.length ? `<div><strong>闂佸憡甯掑Λ娆撳极椤曗偓濮婂綊宕归纰卞敽:</strong> ${node.length}</div>` : ''}
            <div><small>闂佺粯鍔楅幊鎾诲吹椤曗偓閹崇偤宕掑鍐у寲婵炲濮伴崕鎾敋濮樿埖鍤嶉柛灞剧矊娴狀垰鈽夐幘瑙勩€冮柤鍨灱缁犳盯宕橀埡鍌涙緬婵?/small></div>
            <div><small>闂佺粯鍔楅幊鎾诲吹椤斿墽鐭氶柧蹇氼潐椤忋倕顭跨捄鍝勵伃闁革絽鎽滅槐鏃堫敊閸撗呯闂佽　鍋?/small></div>
          `;
          tooltip.html(tooltipContent);
        }
        
        // 婵崿鍛ｉ柣鏍电秮楠炲啴顢楅埀顒佺閻樿绫嶉柛顐ｆ礈瑜邦垰霉濠婂骸鏋﹀┑鈽嗗弮閹?
        d3.select(event.currentTarget)
          .attr('stroke', '#ffcc00')
          .attr('r', largeNodeSize * 1.5);
      })
      .on('mousemove', (event) => {
        // 闂佸搫娲ら悺銊╁蓟婵犲偆鍟呴柕澶堝劚瀵版棃鏌熺紒妯哄闁靛洦纰嶉幏鍛吋閸モ晜鐎?
        d3.select('.tree-tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      })
      .on('mouseout', (event) => {
        // 缂備礁顦…宄扳枍鎼淬劌绠ラ柍褜鍓熷鍨箙缁扁偓oltip
        d3.selectAll('.tree-tooltip').remove();
        
        // 闂佽鍘归崹褰捤囬弻銉﹀殟闁稿本绮屾禒顖炴煕濡厧鏋庢い顐ｅ姍瀵棄鐣￠幍顔绢攨
        this.applySelectedNodeStyles(largeNodeSize);
      })
      .on('click', (event, d) => {
        // 婵炲濮伴崕鐢稿焵椤掆偓椤︻噣鎳欓幋锔藉殟闁稿本绮屾禒顖氣槈閹捐銆冮柤鍨灱缁犳盯宕橀埡鍌涙緬婵?
        event.stopPropagation();
        this.zoomToNode(d[0], layoutResult, config);
        
        // 婵°倕鍊圭湁閻庡灚甯￠弻鍛緞婢跺骸骞€闂佹眹鍔岀€氼垱淇婇銏″€?
        this.applySelectedNodeStyles(largeNodeSize);
        
        // 闂佸搫娲ら悺銊╁蓟婵℃Store婵炴垶鎼╅崢鎯р枔閹达附鐒诲璺侯槼閸橆剟鏌ｅΟ鍨厫闁?

        // 闂傚倸鍟扮划顖烆敆濞戞瑧顩查悗锝傛櫆椤愪粙鏌涢幇顓炵瑲闁革附妞介弫宥呯暆閳ь剟鍨惧Ο鑽も攳婵犻潧顑傞崑鎾村緞婢跺骸骞€闂佺粯顭堥崺鏍焵椤戞寧顦风紒妤€顦遍幃顕€顢曢姀鐘茬翻婵炲濮甸悧鏃傝姳閵婏妇顩烽柟顖炲亰濞差剟鏌?
        event.preventDefault();
      });
    
    // 濠电儑缍€椤曆勬叏閻愮儤鍊烽柣鐔告緲濮ｅ﹦绱掑畝鍐╊仩婵炲憞鍕窞闁告洦鍨板▍銏㈢磽閸愭儳鏋ょ紓鍌氼樀瀵劑宕滆閻ｉ亶鏌涢弮鍌氭灆闁?
    this.g.append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', config.width)
      .attr('height', config.height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .on('click', () => {
        // 闂佸搫娲ら悺銊╁蓟?uiStore 婵炴垶鎼╅崢鎯р枔閹达附鍋愰柤鍝ヮ暯閸嬫挻绗熸繝鍕槷闂備焦褰冪粔鍫曟偪閸℃瑧纾介柍鍝勫€归弶褰掓煕濠婂啳瀚伴梺瑙ｆ櫇缁?
        if (typeof uiStore !== 'undefined') {
          uiStore.setZoom(1);
          uiStore.setPan({ x: 0, y: 0 });
        } else {
          // 婵犵鈧啿鈧綊鎮?uiStore 婵炴垶鎸哥粔纾嬨亹閺屻儲鍋ㄦい顓熷笧缁€澶愭煟閳轰胶鎽犻悽顖氱摠閹棃寮崒娑欐闂佸憡鐟﹁摫鐎?
          this.updateTransform('');
        }
        // 婵烇絽娲︾换鍐偓鍨閺屽懏寰勬径搴″箑闂佺粯顭堥崺鏍焵椤戣法绛忕紒杈ㄧ箞瀹曪綁顢旈崼婵囶仧缂傚倸鍠氶崰姘辩磽婢舵劕缁?
        // 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯虹－缁犲綊姊洪幓鎺戭殭缂佹顦甸獮渚€濮€閻欌偓濡插鏌ら崫鍕偓濠氬磻閿濆鍐€鐎瑰嫭澹嗙涵鈧梺鎸庣☉閼活垰煤濠婂嫮鈻旈柛婵嗗鐠佹煡鏌ょ€圭姴袚婵犫偓娓氣偓閹崇偤宕掑鍐у寲闁荤偞鍑归崑濠囧焵椤掆偓椤︻噣鎳?
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
          // 闂佸搫鐗嗛ˇ閬嶅春濡ゅ懏鍤嶉柛灞剧矊娴狀垶鏌￠崘顓у晣缂佽鲸绻堝畷鐑樻姜閹殿喛澹橀梺缁樼墬閸庡吋淇婇銏″€烽悷娆忓閻撴瑩鏌?
          const dx = pos.x - parentPos.x;
          const dy = pos.y - parentPos.y;
          const len = Math.hypot(dx, dy) || 1;
          labelDirection.set(id, { angle: Math.atan2(dy, dx), ux: dx / len, uy: dy / len });
        } else {
          // 闂佸搫鍟版慨鐑藉春濡ゅ懏鍤嶉柛灞剧矊娴狀垶鏌￠崘顓у晣缂佽鲸鐟╁鐣屾兜閸涱厙婵嬫煟閹邦喗顏熺紒杈ㄥ哺閺佸秶浠﹂悾灞芥暏婵炲瓨绮岀花濂告嚈閹达絿鐤€闁告劏鏅滈悡娆撴煕?
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
    this.g.attr('transform', transform);
  }

  resize(width: number, height: number): void {
    this.svg.attr('width', width).attr('height', height);
  }

  /**
   * 闂備緡鍋呯敮鎺旂礊婵犲嫭濯奸柨娑樺閺嗩剚鎱ㄩ敐鍛闂佸弶绮撻幊鐐哄磼濠婂啩鍖栭梺姹囧妼鐎氼厾鎹㈡担瑙勫劅闁挎洍鍋撻柣顏呭閻?
   * @param node 閻熸粎澧楅幐鍛婃櫠閻樼粯鍤嶉柛灞剧矊娴?
   * @param depth 閻熸粎澧楅幐鍛婃櫠閻樼潿搴ㄥ础閻愬樊鍞?
   * @param nodeDepth 闁诲孩绋掗敋闁稿绉归幊鐐哄磼濠婂啩鍖栧┑鐑囩到瀹曨剛鈧濞婇幆鍐礋椤掍絿渚€鎮?
   * @returns 闂佸搫鐗冮崑鎾愁熆閸棗瀚粻鎺楀箹鏉堝墽鐣遍柍?
   */
  private calculateNodeDepths(
    node: any,
    depth: number,
    nodeDepth: Map<string, number>
  ): number {
    // 缂佺虎鍙庨崰鏇犳崲濮樿埖鍤嶉柛灞剧矊娴狀垶鏌?id 闁诲繒鍋熼崑鐐哄焵?
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
   * 婵炴潙鍚嬮敋閻庡灚鐓￠幆宀勫煛娴ｈ棄鐓傞梺鍝勭У閸ㄧ懓鈻撻幋锕€鍐€闁搞儮鏅╅崝顕€鎮楅棃娑欘棞閻庤濞婇弫宥呯暆閸曨亞绱氶梺绋跨箰缁夌敻鎮ラ敐鍥╅┏濡わ絽鍟▍銏ゆ煕?
   * @param labels 闂佸憡顭囬崰搴綖閹版澘鍐€闁搞儮鏅╅崝顕€鏌℃担鍝勵暭鐎?
   * @param isLargeTree 闂佸搫瀚烽崹浼村箚娴ｅ湱鈻旈柛婵嗗娴滐綁鏌涢妸銉剱闁?
   * @returns 婵炴潙鍚嬮敋閻庡灚鐓″畷銉︽償閿濆棛鏆犻梺鍝勭Т濞层劑顢楅悜钘夋瀬闁绘鐗嗙粊?
   */
  private optimizeRectangularLabels(
    labels: Array<[string, { x: number; y: number }]>,
    isLargeTree: boolean
  ): Array<[string, { x: number; y: number }]> {
    // 闁诲海鏁婚埀顒佺〒閼规儳顭块崼鍡楀暟閳ь剛鍏樺浠嬪箣椤栨粎顦梻浣瑰絻濞层劑寮妶澶婂珘闁逞屽墮閳规垿鍩€椤掍焦浜ゆ繛鎴炵閻ｉ亶鏌″鍛窛妞ゆ帞鍏樺浠嬪箛椤掆偓閻撴垹绱掑☉娆戝⒈闁?
    if (labels.length > 100) {
      // 闂佸憡鐟禍娆戞崲濮樿埖鍋╂繛鍡樺灥椤?0婵炴垶鎼╂禍婵嬫偉閿濆洨椹抽柟鎯ф噽缁€澶岀棯椤撗冩灆缂佺粯宀稿畷锝夘敍濠垫劕娈洪梺?
      const maxLabels = 40;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 60) {
      // 婵炴垶鎼╅崢濂告倵閻戣棄鍐€闁规惌鍨崇粈澶娗庨崶銊х畼闁哄棌鍋撶紓?0婵炴垶鎼╂禍婵嬫偉閿濆洨椹?
      const maxLabels = 50;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    } else if (labels.length > 30) {
      // 闁诲繐绻愮换鎰版倵閻戣棄鍐€闁规惌鍨崇粈澶娗庨崶銊х畼闁哄棌鍋撶紓?0婵炴垶鎼╂禍婵嬫偉閿濆洨椹?
      const maxLabels = 60;
      const step = Math.ceil(labels.length / maxLabels);
      return labels.filter((_, index) => index % step === 0);
    }
    
    // 闂?Y 闂佺鍕闁绘牭缍侀獮鎺楀箳閹寸姷顣查梺鍝勭Т濞层劑顢?
    const sortedLabels = [...labels].sort((a, b) => a[1].y - b[1].y);
    
    // 闂備焦褰冨ú锕傛偋闁秴鍐€闁搞儮鏅╅崝顕€鏌ㄥ☉妯肩伇闁炽儲蓱缁屽崬鈹戦崱娆屽亾椤撱垺鍎庨悗娑櫳戦悡娆撴煕濮橆厼鐏ｇ紒妤€鍊垮鍨緞鎼粹€虫灆婵犮垹澧庨崰鏍涚捄銊﹀磯?
    const optimizedLabels: Array<[string, { x: number; y: number }]> = [];
    // 婵犮垹鐖㈤崘顏嗘毌婵犫拃鍛粶濠殿喚鍋ゅ鐢稿焵椤掑倷鐒婇煫鍥ㄦ尵閳ь剦鍙冮幆鍕箻椤旀枻绱甸柣鐘靛劋缁绘劗妲愬┑鍫熷厹妞ゆ棁宕电粻浠嬫煛瀹ュ懏宸濇い鎺楁敱缁嬪顓兼径濠冾仧闂?
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
   * 婵炲濮伴崕鐢稿焵椤掆偓椤︻噣鎳欓幋锔藉殟闁稿本绮屾禒顖氣槈閹捐銆冮柤鍨灱缁犳盯宕橀鐘殿啋闁荤偞绋戦懟顖滀焊椤栫偛鏄ラ柣鏂挎啞閺夌懓顭?
   * @param nodeId 闂備緡鍋勯ˇ顕€鎳欓幋锔藉殟闁稿本绮屾禒顖炴煟閵娿儱娈珼
   * @param layoutResult 闁汇埄鍨伴崯顐︽儑椤掑倻纾奸柟鎯ь嚟娴?
   * @param config 濠电偞鎸稿鍫曟偂鐎ｎ喗鐓€鐎广儱娲ㄩ弸?
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
    
    // 闁荤姳绶ょ槐鏇㈡偩婵犳氨宓佺€规洖娉﹂埡鍛厒闊洢鍎崇粈澶娒归敐鍛仴闁逞屽墮椤︻噣鎳欓幋锔藉殟闁稿本绮屾禒顖炴煙鐎涙ê濮冮悹鎰枑缁嬪顢橀悙闈涱洭
    const translateX = centerX - nodePos.x;
    const translateY = centerY - nodePos.y;
    
    // 闁荤姳绶ょ槐鏇㈡偩閼姐倗纾介柍鍝勫€归弶瑙勬叏閿濆棙鐓ｇ紒韬插劦閺佸秶浠﹂悙顒佹緬婵?闂?
    const scale = 2;
    
    // 闂佺绻愰悧濠偯洪崸妤€妫?uiStore 婵炴垶鎼╅崢鎯р枔閹达附鐒诲璺侯槼閸橆剟鏌ｅΟ鍨厫闁?
    if (typeof uiStore !== 'undefined') {
      uiStore.selectNode(nodeId);
    }
    
    // 闂佺粯甯熷▔娑㈠箖濡ゅ懎鍗抽悗娑櫳戦悡鈧紓鍌氬€甸弲婊堝棘娓氣偓瀹曨亞浠︽禒瀣皺缂備礁顦冲畷鍨叏閹间礁绠?
    if (typeof uiStore !== 'undefined') {
      // 闁荤姳绶ょ槐鏇㈡偩婵犳艾妫橀柟娈垮枟閻ｈ京绱撻崒妤佹珕闁哄倷绶氬畷顏嗕沪娴犲灏欑紓浣割槼瀹曞灚鎱ㄩ幖浣哥畱?
      const newZoom = scale;
      const newPan = { x: translateX, y: translateY };
      
      // 闂佸搫娲ら悺銊╁蓟?uiStore 闂佺粯顭堥崺鏍焵?
      uiStore.setZoom(newZoom);
      uiStore.setPan(newPan);
    } else {
      // 婵犵鈧啿鈧綊鎮?uiStore 婵炴垶鎸哥粔纾嬨亹閺屻儲鍋ㄦい顓熷笧缁€澶愭煟閳轰胶鎽犻悽顖氱摠閹棃寮崒娑欐闂佸憡鐟﹁摫鐎?
      const transform = `translate(${translateX}, ${translateY}) scale(${scale})`;
      this.updateTransform(transform);
    }
    
    // 婵烇絽娲︾换鍐偓鍨閺屽懏寰勬径搴″箑闂佺厧鎼崐濠氬磻閿濆鍎嶉柛鏇ㄥ灣瑜邦垰霉濠婂骸鏋ゅ┑顔芥倐楠炩偓?
    // 濠电偛顦崝宥夊礈娴煎瓨鏅慨妯块哺閺嗙姴霉濠婂啫顒㈤柛銊︾矋缁傛帡顢楁担鍓愶箓鏌涢敂鐟扳棦VG闂佸憡鐟﹁摫鐎规洝灏欐禒锕傚磼閻愬瓨銆冮柡澶嗘櫆缁嬫牠銆侀幋鐘电＝闁冲搫鍊归弶褰掓煥濞戞鐒峰┑鈽嗗弮閹瑩宕烽鐔烘殸DOM闂佺绻愰崯鎵矆瀹€鍕祦闁煎摜鏁稿楣冩煛閸繍妲归柡浣搞偢瀹?
    // 闂佸湱顣介崑鎾趁归悩顔煎姦闁逞屽墮椤︻噣鎳欓幋锔藉亹闁煎摜顣介崑鎾存媴妞嬪海鐛ラ梺鐓庮殠娴滄粍鎱ㄩ埡鍌溾攳婵犻潧娲ら惁顕€鏌ㄥ☉妯侯殭缂佹顦靛Λ渚€鍩€椤掑倹鍟哄〒姘ｅ亾妞ゃ倕鍊瑰鍕冀閵婏附鍎ユ繛?
  }

  /**
   * 濠电偞鎸稿鍫曟偂鐎ｎ亖鏋栭柕濞炬櫅濞呯偤鏌涢妷锕€鍔ら柣?
   * @param config 濠电偞鎸稿鍫曟偂鐎ｎ喗鐓€鐎广儱娲ㄩ弸?
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
   * 濠电偞鎸稿鍫曟偂鐎ｎ喗鍤岄柟缁樺笧閺併劍绻涙径鍫濆闁?
   * @param group SVG缂傚倷绀佺€氼剟宕㈤幘鑸殿潟?
   * @param annotation 濠电偛顦崝鎴﹀闯閹绢喖鏋侀柣妤€鐗嗙粊?
   * @param config 濠电偞鎸稿鍫曟偂鐎ｎ喗鐓€鐎广儱娲ㄩ弸?
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

// 缂佺虎鍙庨崰鏇犳崲濮樿泛鎹堕柕濠忕畳椤╊偊鏌＄仦鐐碍濠⒀呭Х閹峰宕滆閺嬪倿鏌″鍡楃仴闁硅渹鍗抽幊鐐哄磼濠婂啩鍖栭梺杞拌兌婢ф鐣?
export const createRenderer = (container: HTMLElement, config: RenderConfig): any => {
  const renderer = new SVGRenderer(container, config);
  
  // 闂備焦褰冪粔鎾疮閹兼吂nder闂佸搫鍊介～澶屾兜閸洘鏅€光偓閳ь剟鍨惧Ο鑽も攳婵犻潧顭崯搴ｇ磽閸愭儳鏋熼柣鏍ㄧ叀瀹曨亜鐣濋崘銊庢繈鏌ｉ幇顖ｆ綈闁哄棛鍠栭獮?
  const originalRender = renderer.render;
  renderer.render = function(tree: any, layoutResult: LayoutResult, config: RenderConfig) {
    this.tree = tree;
    this.nodes = layoutResult.nodes;
    originalRender.call(this, tree, layoutResult, config);
  };
  
  return renderer;
};



