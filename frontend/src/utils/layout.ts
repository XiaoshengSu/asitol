import type { Tree, LayoutConfig, LayoutResult, TreeNode } from '../types/tree';
import type { LayoutParams, LayoutAlgorithm } from '../types/layout';

// 生成唯一ID
const generateId = (): string => {
  return `id_${Math.random().toString(36).substr(2, 9)}`;
};

// 矩形布局算法
class RectangularLayout implements LayoutAlgorithm {
  compute(params: LayoutParams): LayoutResult {
    const { tree, width, height, padding } = params;
    const nodes: Record<string, { x: number; y: number }> = {};
    const links: Array<{ source: string; target: string }> = [];

    // 计算树的高度和宽度
    const treeHeight = this.calculateTreeHeight(tree.root);
    const treeWidth = this.calculateTreeWidth(tree.root);

    // 计算节点间距
    const yStep = (height - 2 * padding) / treeHeight;
    const xStep = (width - 2 * padding) / treeWidth;

    // 计算根节点的居中位置
    const rootX = padding;
    const rootY = height / 2;

    // 递归计算节点位置
    this.layoutNode(tree.root, rootX, rootY, xStep, yStep, nodes, links);

    return {
      id: generateId(),
      type: 'rectangular',
      nodes,
      links
    };
  }

  private calculateTreeHeight(node: TreeNode): number {
    if (!node.children || node.children.length === 0) return 1;
    return node.children.reduce((sum, child) =>
      sum + this.calculateTreeHeight(child), 0
    );
  }

  private calculateTreeWidth(node: TreeNode): number {
    if (!node.children || node.children.length === 0) return 1;
    return 1 + node.children.reduce((max, child) =>
      Math.max(max, this.calculateTreeWidth(child)), 0
    );
  }

  private layoutNode(
    node: TreeNode,
    x: number,
    y: number,
    xStep: number,
    yStep: number,
    nodes: Record<string, { x: number; y: number }>,
    links: Array<{ source: string; target: string }>
  ): number {
    nodes[node.id] = { x, y };

    if (!node.children || node.children.length === 0) {
      return 1;
    }

    // 计算所有子树的高度
    const childHeights = node.children.map(child => this.calculateTreeHeight(child));
    const totalHeight = childHeights.reduce((sum, height) => sum + height, 0);

    // 布局子节点
    let currentY = y - (totalHeight - 1) * yStep / 2;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      links.push({ source: node.id, target: child.id });
      const subtreeHeight = this.layoutNode(child, x + xStep, currentY, xStep, yStep, nodes, links);
      currentY += subtreeHeight * yStep;
    }

    return totalHeight;
  }
}

// 圆形布局算法
class CircularLayout implements LayoutAlgorithm {
  compute(params: LayoutParams): LayoutResult {
    const { tree, width, height, padding } = params;
    const nodes: Record<string, { x: number; y: number }> = {};
    const links: Array<{ source: string; target: string }> = [];

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - padding;
    const minRadius = Math.max(8, padding * 0.5);

    const leaves: TreeNode[] = [];
    this.collectLeaves(tree.root, leaves);

    const leafAngles = new Map<string, number>();
    const leafCount = Math.max(1, leaves.length);
    const angleStep = (2 * Math.PI) / leafCount;

    leaves.forEach((leaf, index) => {
      leafAngles.set(leaf.id, index * angleStep - Math.PI / 2);
    });

    const rootDistance = this.maxDistanceToRoot(tree.root);

    this.layoutByPolar(
      tree.root,
      centerX,
      centerY,
      maxRadius,
      minRadius,
      rootDistance,
      leafAngles,
      nodes,
      links,
      0
    );

    return {
      id: generateId(),
      type: 'circular',
      nodes,
      links
    };
  }

  private collectLeaves(node: TreeNode, leaves: TreeNode[]): void {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
      return;
    }
    for (const child of node.children) {
      this.collectLeaves(child, leaves);
    }
  }

  private maxDistanceToRoot(node: TreeNode, distance = 0): number {
    const currentDistance = distance + Math.max(0, node.branchLength || 0);

    if (!node.children || node.children.length === 0) {
      return currentDistance;
    }

    return node.children.reduce(
      (max, child) => Math.max(max, this.maxDistanceToRoot(child, currentDistance)),
      currentDistance
    );
  }

  private layoutByPolar(
    node: TreeNode,
    centerX: number,
    centerY: number,
    maxRadius: number,
    minRadius: number,
    maxDistance: number,
    leafAngles: Map<string, number>,
    nodes: Record<string, { x: number; y: number }>,
    links: Array<{ source: string; target: string }>,
    accumulatedDistance: number
  ): number {
    const selfDistance = accumulatedDistance + Math.max(0, node.branchLength || 0);
    const isLeaf = !node.children || node.children.length === 0;

    const angle = isLeaf
      ? (leafAngles.get(node.id) || -Math.PI / 2)
      : node.children
          .map(child => this.layoutByPolar(
            child,
            centerX,
            centerY,
            maxRadius,
            minRadius,
            maxDistance,
            leafAngles,
            nodes,
            links,
            selfDistance
          ))
          .reduce((sum, childAngle) => sum + childAngle, 0) / node.children.length;

    if (node.children) {
      for (const child of node.children) {
        links.push({ source: node.id, target: child.id });
      }
    }

    const distanceFactor = maxDistance > 0 ? selfDistance / maxDistance : 0;
    // 叶节点固定在最外层圆环上，内部节点保留深度分层，避免叶端参差导致外环不完整
    const radius = isLeaf
      ? maxRadius
      : minRadius + (maxRadius - minRadius) * Math.min(0.92, Math.max(0, distanceFactor));

    nodes[node.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };

    return angle;
  }
}

// 径向布局算法
class RadialLayout implements LayoutAlgorithm {
  compute(params: LayoutParams): LayoutResult {
    const { tree, width, height, padding } = params;
    const nodes: Record<string, { x: number; y: number }> = {};
    const links: Array<{ source: string; target: string }> = [];

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - padding;

    // 收集所有叶节点
    const leaves: TreeNode[] = [];
    this.collectLeaves(tree.root, leaves);
    const leafCount = leaves.length;
    
    // 计算树的深度
    const treeDepth = this.calculateTreeDepth(tree.root);
    
    // 计算半径步长，确保内部节点有足够空间
    const radiusStep = maxRadius / Math.max(2, treeDepth);
    
    // 为叶节点分配角度，从顶部开始，确保严格均匀分布
    const angleStep = (2 * Math.PI) / leafCount;
    const leafAngles = new Map<string, number>();
    leaves.forEach((leaf, index) => {
      // 从顶部开始，顺时针分配角度
      const angle = index * angleStep - Math.PI / 2;
      leafAngles.set(leaf.id, angle);
    });

    // 首先布局所有叶节点，严格分布在最大半径的圆周上
    for (const leaf of leaves) {
      const angle = leafAngles.get(leaf.id) || 0;
      const x = centerX + maxRadius * Math.cos(angle);
      const y = centerY + maxRadius * Math.sin(angle);
      nodes[leaf.id] = { x, y };
    }

    // 计算每个内部节点的角度范围
    const nodeAngles = new Map<string, { min: number; max: number }>();
    this.calculateNodeAngles(tree.root, leafAngles, nodeAngles);

    // 布局内部节点，基于角度范围和深度
    this.layoutInternalNodes(
      tree.root, 
      centerX, 
      centerY, 
      maxRadius, 
      radiusStep, 
      0, // 初始深度
      nodeAngles, 
      nodes, 
      links
    );

    return {
      id: generateId(),
      type: 'radial',
      nodes,
      links
    };
  }

  private calculateTreeDepth(node: TreeNode): number {
    if (!node.children || node.children.length === 0) {
      return 1;
    }
    return 1 + Math.max(...node.children.map(child => this.calculateTreeDepth(child)));
  }

  private collectLeaves(node: TreeNode, leaves: TreeNode[]): void {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
      return;
    }
    for (const child of node.children) {
      this.collectLeaves(child, leaves);
    }
  }

  private calculateNodeAngles(
    node: TreeNode,
    leafAngles: Map<string, number>,
    nodeAngles: Map<string, { min: number; max: number }>
  ): void {
    if (!node.children || node.children.length === 0) {
      // 叶节点的角度范围就是自身的角度
      const angle = leafAngles.get(node.id) || 0;
      nodeAngles.set(node.id, { min: angle, max: angle });
      return;
    }

    // 递归计算子节点的角度范围
    let minAngle = Infinity;
    let maxAngle = -Infinity;
    
    for (const child of node.children) {
      this.calculateNodeAngles(child, leafAngles, nodeAngles);
      const childAngleRange = nodeAngles.get(child.id);
      if (childAngleRange) {
        minAngle = Math.min(minAngle, childAngleRange.min);
        maxAngle = Math.max(maxAngle, childAngleRange.max);
      }
    }

    // 存储当前节点的角度范围
    nodeAngles.set(node.id, { min: minAngle, max: maxAngle });
  }

  private layoutInternalNodes(
    node: TreeNode,
    centerX: number,
    centerY: number,
    maxRadius: number,
    radiusStep: number,
    depth: number,
    nodeAngles: Map<string, { min: number; max: number }>,
    nodes: Record<string, { x: number; y: number }>,
    links: Array<{ source: string; target: string }>
  ): void {
    if (!node.children || node.children.length === 0) {
      return;
    }

    // 递归布局子节点
    for (const child of node.children) {
      this.layoutInternalNodes(
        child, 
        centerX, 
        centerY, 
        maxRadius, 
        radiusStep, 
        depth + 1, 
        nodeAngles, 
        nodes, 
        links
      );
      links.push({ source: node.id, target: child.id });
    }

    // 计算当前节点的位置
    const angleRange = nodeAngles.get(node.id);
    if (angleRange) {
      // 使用角度范围的中间值作为节点角度
      const angle = (angleRange.min + angleRange.max) / 2;
      
      // 计算节点半径：基于深度，确保内部节点在适当位置
      const radius = maxRadius - (depth * radiusStep);
      const finalRadius = Math.max(radiusStep, radius); // 确保最小半径
      
      // 计算节点位置
      const x = centerX + finalRadius * Math.cos(angle);
      const y = centerY + finalRadius * Math.sin(angle);
      
      nodes[node.id] = { x, y };
    }
  }
}

// 无根树布局算法
class UnrootedLayout implements LayoutAlgorithm {
  compute(params: LayoutParams): LayoutResult {
    const { tree, width, height, padding } = params;
    const nodes: Record<string, { x: number; y: number }> = {};
    const links: Array<{ source: string; target: string }> = [];

    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - padding;

    // 使用基于距离的布局算法
    this.layoutNode(tree.root, centerX, centerY, maxRadius, 0, 2 * Math.PI, nodes, links);

    return {
      id: generateId(),
      type: 'unrooted',
      nodes,
      links
    };
  }

  private layoutNode(
    node: TreeNode,
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    nodes: Record<string, { x: number; y: number }>,
    links: Array<{ source: string; target: string }>
  ): void {
    // 为当前节点分配位置
    nodes[node.id] = { x, y };

    if (!node.children || node.children.length === 0) {
      return;
    }

    // 计算子节点的数量
    const childCount = node.children.length;
    
    // 为每个子节点分配角度范围
    const angleStep = (endAngle - startAngle) / childCount;

    // 递归布局子节点
    for (let i = 0; i < childCount; i++) {
      const child = node.children[i];
      links.push({ source: node.id, target: child.id });

      // 计算子节点的角度
      const childAngle = startAngle + (i + 0.5) * angleStep;
      
      // 计算子节点的距离，基于分支长度
      const branchLength = child.branchLength || 0.1;
      const childRadius = Math.max(20, radius * 0.7 * (1 + branchLength));
      
      // 计算子节点的坐标
      const childX = x + childRadius * Math.cos(childAngle);
      const childY = y + childRadius * Math.sin(childAngle);

      // 递归布局子节点
      this.layoutNode(child, childX, childY, childRadius * 0.8, 
        startAngle + i * angleStep, 
        startAngle + (i + 1) * angleStep, 
        nodes, links);
    }
  }
}

// 工厂函数：创建布局算法实例
export const createLayoutAlgorithm = (type: 'rectangular' | 'circular' | 'radial' | 'unrooted'): LayoutAlgorithm => {
  switch (type) {
    case 'rectangular':
      return new RectangularLayout();
    case 'circular':
      return new CircularLayout();
    case 'radial':
      return new RadialLayout();
    case 'unrooted':
      return new UnrootedLayout();
    default:
      return new RectangularLayout();
  }
};
