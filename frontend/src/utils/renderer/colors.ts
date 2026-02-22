import * as d3 from 'd3';
import type { Tree, TreeNode } from '../../types/tree';

const DEFAULT_CLADE_PALETTE = [
  '#4E8B8B',
  '#6574B8',
  '#7E8B5B',
  '#A46D7C',
  '#B38A4C',
  '#8f96a3',
  '#5C7FA3',
  '#C07F5A',
  '#5F8B74',
  '#9B7FAE',
  '#6B8E23',
  '#8B4513',
  '#483D8B',
  '#20B2AA',
  '#FF6347'
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const countLeaves = (node: TreeNode): number => {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
};

const getTreeDepth = (node: TreeNode): number => {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(child => getTreeDepth(child)));
};

const getCladePalette = (count: number, baseColor: string): string[] => {
  const base = d3.hsl(baseColor);
  if (Number.isNaN(base.h) || Number.isNaN(base.s) || Number.isNaN(base.l)) {
    return DEFAULT_CLADE_PALETTE.slice(0, count);
  }
  
  // 对于较少的颜色，使用基于基础色的亮度变化
  if (count <= 6) {
    const hue = base.h;
    const saturation = clamp(base.s === 0 ? 0.55 : base.s, 0.35, 0.85);
    const minLight = 0.32;
    const maxLight = 0.78;
    
    const colors: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const t = i / Math.max(1, count - 1);
      const lightness = minLight + (maxLight - minLight) * t;
      colors.push(d3.hsl(hue, saturation, lightness).formatHex());
    }
    return colors;
  }
  
  // 对于较多的颜色，使用不同的色相
  if (count <= DEFAULT_CLADE_PALETTE.length) {
    return DEFAULT_CLADE_PALETTE.slice(0, count);
  }
  
  // 对于更多的颜色，生成基于不同色相的调色板
  const colors: string[] = [];
  const hueStep = 360 / count;
  const saturation = clamp(base.s === 0 ? 0.6 : base.s, 0.4, 0.8);
  const lightness = clamp(base.l === 0 ? 0.5 : base.l, 0.35, 0.7);
  
  for (let i = 0; i < count; i += 1) {
    const hue = (base.h + i * hueStep) % 360;
    colors.push(d3.hsl(hue, saturation, lightness).formatHex());
  }
  return colors;
};

const assignCladeColor = (node: TreeNode, color: string, map: Map<string, string>): void => {
  map.set(node.id, color);
  if (node.children) {
    node.children.forEach(child => assignCladeColor(child, color, map));
  }
};

// 智能分支颜色分配：根据树的深度和大小自动调整颜色分配策略
export const buildCladeColorMap = (tree: Tree, baseColor: string): Map<string, string> => {
  const map = new Map<string, string>();
  const children = tree.root.children || [];
  if (children.length === 0) return map;

  const treeDepth = getTreeDepth(tree.root);
  const totalLeaves = countLeaves(tree.root);
  
  // 根据树的大小和深度决定颜色分配策略
  if (children.length <= 6 || totalLeaves <= 50) {
    // 对于较小的树或分支较少的树，使用根节点的直接子节点作为分组
    const ordered = children
      .slice()
      .sort((a, b) => countLeaves(b) - countLeaves(a));
    const palette = getCladePalette(ordered.length, baseColor);

    ordered.forEach((child, index) => {
      assignCladeColor(child, palette[index], map);
    });
  } else {
    // 对于较大的树，递归分配颜色到更深层次的分支
    const assignRecursiveColors = (node: TreeNode, depth: number, maxDepth: number, parentColor: string): void => {
      if (!node.children || node.children.length === 0) {
        map.set(node.id, parentColor);
        return;
      }
      
      // 只在适当的深度分配新颜色
      if (depth < maxDepth && node.children.length > 1) {
        const palette = getCladePalette(node.children.length, parentColor);
        node.children.forEach((child, index) => {
          assignRecursiveColors(child, depth + 1, maxDepth, palette[index]);
        });
      } else {
        // 对于较深的节点，使用父节点的颜色
        node.children.forEach(child => {
          assignRecursiveColors(child, depth + 1, maxDepth, parentColor);
        });
      }
      
      map.set(node.id, parentColor);
    };
    
    // 确定最大分配深度
    const maxColorDepth = Math.min(3, treeDepth - 1);
    const rootPalette = getCladePalette(children.length, baseColor);
    
    children.forEach((child, index) => {
      assignRecursiveColors(child, 1, maxColorDepth, rootPalette[index]);
    });
  }

  return map;
};

// 增强的颜色对比度检查
const getContrastRatio = (color1: string, color2: string): number => {
  const getLuminance = (color: string): number => {
    const c = d3.rgb(color);
    const [r, g, b] = [c.r, c.g, c.b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
};

// 确保颜色与背景有足够的对比度
export const ensureContrast = (color: string, backgroundColor: string = '#242424'): string => {
  const minContrast = 3.0;
  let contrast = getContrastRatio(color, backgroundColor);
  
  if (contrast >= minContrast) return color;
  
  // 调整颜色亮度以提高对比度
  const hsl = d3.hsl(color);
  let lightness = hsl.l;
  
  if (backgroundColor === '#242424') {
    // 深色背景，增加亮度
    while (contrast < minContrast && lightness < 0.9) {
      lightness += 0.05;
      const adjustedColor = d3.hsl(hsl.h, hsl.s, lightness).formatHex();
      contrast = getContrastRatio(adjustedColor, backgroundColor);
    }
  } else {
    // 浅色背景，减少亮度
    while (contrast < minContrast && lightness > 0.1) {
      lightness -= 0.05;
      const adjustedColor = d3.hsl(hsl.h, hsl.s, lightness).formatHex();
      contrast = getContrastRatio(adjustedColor, backgroundColor);
    }
  }
  
  return d3.hsl(hsl.h, hsl.s, lightness).formatHex();
};
