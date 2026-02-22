import * as d3 from 'd3';
import type { Tree, TreeNode } from '../../types/tree';

// 专业生信配色方案：基于科学期刊和科研软件的标准调色板
const PALETTES = {
  // 主调色板：专业、清晰、色盲友好
  primary: [
    '#3182BD', // 蓝色
    '#E6550D', // 橙色
    '#31A354', // 绿色
    '#756BB1', // 紫色
    '#636363', // 灰色
    '#DD8452', // 棕色
    '#80B1D3', // 浅蓝
    '#FC8D62', // 浅橙
    '#99D594', // 浅绿
    '#BCBDDC', // 浅紫
    '#BDBDBD', // 浅灰
    '#E5C494'  // 浅棕
  ],
  
  // 色盲友好调色板
  colorblind: [
    '#0072B2', // 蓝色
    '#009E73', // 绿色
    '#D55E00', // 橙色
    '#CC79A7', // 粉色
    '#F0E442', // 黄色
    '#56B4E9', // 浅蓝
    '#E69F00', // 金色
    '#999999'  // 灰色
  ],
  
  // 渐变色方案（用于连续数据）
  sequential: [
    '#EFF3FF',
    '#C6DBEF',
    '#9ECAE1',
    '#6BAED6',
    '#4292C6',
    '#2171B5',
    '#08519C',
    '#08306B'
  ],
  
  // 发散色方案（用于对比数据）
  diverging: [
    '#B2182B',
    '#D6604D',
    '#F4A582',
    '#FDDBC7',
    '#F7F7F7',
    '#D1E5F0',
    '#92C5DE',
    '#4393C3',
    '#2166AC'
  ],
  
  // 科研期刊和软件标准调色板
  // 基于用户提供的示例
  scientific: {
    prism: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#8C564B', '#E377C2', '#7F7F7F'],
    academy: ['#8C564B', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#9467BD', '#D62728', '#7F7F7F'],
    light: ['#17BECF', '#BCBD22', '#7F7F7F', '#E377C2', '#2CA02C', '#FF7F0E', '#1F77B4', '#D62728'],
    ggplot: ['#F8766D', '#C49A00', '#53B400', '#00C094', '#00B6EB', '#A58AFF', '#FB61D7', '#7CAE00'],
    NPG: ['#E64B35B2', '#4DBBD5B2', '#00A087B2', '#3C5488B2', '#F39B7F80', '#8491B480', '#91D1C280', '#DC0000B2'],
    AAAS: ['#3B4992', '#EE0000', '#008B45', '#631879', '#008280', '#BB0021', '#5F559B', '#A20056'],
    NEJM: ['#BC3C29', '#0072B5', '#E18727', '#20854E', '#7876B1', '#6F9ED4', '#FFDC91', '#EE4C97'],
    Lancet: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6'],
    JAMA: ['#374E55', '#DF8F44', '#00A1D5', '#B24745', '#79AF97', '#6A6599', '#80796B', '#E0A7C8'],
    Jco: ['#006393', '#70A6FF', '#D62828', '#00BB2D', '#FFBB00', '#9E0059', '#00B9E3', '#FF6B35'],
    GSEA: ['#666666', '#666666', '#666666', '#666666', '#666666', '#FF0000', '#FF0000', '#FF0000']
  }
};

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
  
  // 优先基于用户选择的颜色生成调色板
  // 这确保颜色选择器的颜色能够生效
  if (!Number.isNaN(base.h) && !Number.isNaN(base.s) && !Number.isNaN(base.l)) {
    // 基于基础色生成专业的分类调色板
    // 使用感知均匀的颜色空间和合理的色相分布
    const colors: string[] = [];
    const hueStep = 360 / count;
    const saturation = clamp(base.s === 0 ? 0.7 : base.s, 0.5, 0.8);
    const lightness = clamp(base.l === 0 ? 0.5 : base.l, 0.4, 0.6);
    
    for (let i = 0; i < count; i += 1) {
      // 确保色相分布均匀，避免相似颜色
      const hue = (base.h + i * hueStep) % 360;
      colors.push(d3.hsl(hue, saturation, lightness).formatHex());
    }
    return colors;
  }
  
  // 如果基础色无效，使用专业调色板
  if (count <= PALETTES.primary.length) {
    return PALETTES.primary.slice(0, count);
  }
  
  // 对于中等数量的颜色，使用色盲友好调色板
  if (count <= PALETTES.colorblind.length) {
    return PALETTES.colorblind.slice(0, count);
  }
  
  // 对于大量颜色，使用主调色板并循环
  return Array.from({ length: count }, (_, i) => 
    PALETTES.primary[i % PALETTES.primary.length]
  );
};

// 生成渐变色方案（用于连续数据或深度表示）
export const generateSequentialPalette = (count: number, startColor: string = '#3182BD', endColor: string = '#EFF3FF'): string[] => {
  const interpolator = d3.interpolateHsl(startColor, endColor);
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(1, count - 1);
    return d3.hsl(interpolator(t)).formatHex();
  });
};

// 生成发散色方案（用于对比数据）
export const generateDivergingPalette = (count: number, midpoint: number = 0.5): string[] => {
  const colors = PALETTES.diverging;
  if (count <= colors.length) {
    return colors.slice(0, count);
  }
  
  // 如果需要更多颜色，使用插值
  const leftInterpolator = d3.interpolateHsl(colors[0], colors[Math.floor(colors.length * midpoint)]);
  const rightInterpolator = d3.interpolateHsl(colors[Math.floor(colors.length * midpoint)], colors[colors.length - 1]);
  
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    if (t <= midpoint) {
      return d3.hsl(leftInterpolator(t / midpoint)).formatHex();
    } else {
      return d3.hsl(rightInterpolator((t - midpoint) / (1 - midpoint))).formatHex();
    }
  });
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
  
  // 生信专业配色策略
  // 优先为根节点的每个直接子分支分配不同颜色
  // 这是生信分析中最常见的需求：每个大分支一个颜色
  const ordered = children
    .slice()
    .sort((a, b) => countLeaves(b) - countLeaves(a));
  const palette = getCladePalette(ordered.length, baseColor);

  ordered.forEach((child, index) => {
    assignCladeColor(child, palette[index], map);
  });

  return map;
};

// 基于属性值的颜色映射（用于分类数据）
export const buildAttributeColorMap = (categories: string[], baseColor: string): Map<string, string> => {
  const map = new Map<string, string>();
  const palette = getCladePalette(categories.length, baseColor);
  
  categories.forEach((category, index) => {
    map.set(category, palette[index]);
  });
  
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
