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

    const angle = (!node.children || node.children.length === 0)
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
    const radius = minRadius + (maxRadius - minRadius) * Math.min(1, Math.max(0, distanceFactor));

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
    const radius = Math.min(width, height) / 2 - padding;

    // 获取所有叶节点
    const leaves: TreeNode[] = [];
    this.collectLeaves(tree.root, leaves);

    // 计算每个叶节点的角度
    const leafAngle = (2 * Math.PI) / leaves.length;

    // 布局叶节点
    for (let i = 0; i < leaves.length; i++) {
      const angle = i * leafAngle;
      const nodeRadius = radius * 0.8; // 稍微缩小一点，留出空间
      const x = centerX + nodeRadius * Math.cos(angle);
      const y = centerY + nodeRadius * Math.sin(angle);
      nodes[leaves[i].id] = { x, y };
    }

    // 布局内部节点
    this.layoutInternalNodes(tree.root, nodes, links, centerX, centerY);

    return {
      id: generateId(),
      type: 'radial',
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

  private layoutInternalNodes(
    node: TreeNode,
    nodes: Record<string, { x: number; y: number }>,
    links: Array<{ source: string; target: string }>,
    centerX: number,
    centerY: number
  ): void {
    if (!node.children || node.children.length === 0) return;

    // 计算子节点的平均位置
    let sumX = 0;
    let sumY = 0;
    let validChildren = 0;
    for (const child of node.children) {
      links.push({ source: node.id, target: child.id });
      this.layoutInternalNodes(child, nodes, links, centerX, centerY);
      // 确保子节点已经在nodes对象中
      if (nodes[child.id]) {
        sumX += nodes[child.id].x;
        sumY += nodes[child.id].y;
        validChildren++;
      }
    }

    // 只有当有有效子节点时才计算位置
    if (validChildren > 0) {
      // 计算节点到中心的距离，使其位于子节点和中心之间
      const avgX = sumX / validChildren;
      const avgY = sumY / validChildren;
      
      // 计算到中心的向量
      const dx = avgX - centerX;
      const dy = avgY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 内部节点位于中心和子节点平均位置之间的25%处
      const internalDistance = distance * 0.25;
      const angle = Math.atan2(dy, dx);
      
      const x = centerX + internalDistance * Math.cos(angle);
      const y = centerY + internalDistance * Math.sin(angle);
      
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
