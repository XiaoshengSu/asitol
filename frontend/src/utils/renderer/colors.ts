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
  '#9B7FAE'
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const countLeaves = (node: TreeNode): number => {
  if (!node.children || node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
};

const getCladePalette = (count: number, baseColor: string): string[] => {
  const base = d3.hsl(baseColor);
  if (Number.isNaN(base.h) || Number.isNaN(base.s) || Number.isNaN(base.l)) {
    return DEFAULT_CLADE_PALETTE.slice(0, count);
  }
  const hue = base.h;
  const saturation = clamp(base.s === 0 ? 0.55 : base.s, 0.35, 0.85);
  const minLight = 0.32;
  const maxLight = 0.78;
  if (count <= 1) {
    return [d3.hsl(hue, saturation, clamp(base.l, minLight, maxLight)).formatHex()];
  }
  const colors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const lightness = minLight + (maxLight - minLight) * t;
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

export const buildCladeColorMap = (tree: Tree, baseColor: string): Map<string, string> => {
  const map = new Map<string, string>();
  const children = tree.root.children || [];
  if (children.length === 0) return map;

  const ordered = children
    .slice()
    .sort((a, b) => countLeaves(b) - countLeaves(a));
  const palette = getCladePalette(ordered.length, baseColor);

  ordered.forEach((child, index) => {
    assignCladeColor(child, palette[index], map);
  });

  return map;
};
