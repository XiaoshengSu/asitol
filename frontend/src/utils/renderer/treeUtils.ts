import type { TreeNode } from '../../types/tree';

export const findNodeById = (node: TreeNode, id: string): TreeNode | null => {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const result = findNodeById(child, id);
      if (result) return result;
    }
  }
  return null;
};

export const isLeafNode = (node: TreeNode, id: string): boolean => {
  const targetNode = findNodeById(node, id);
  return !targetNode || !targetNode.children || targetNode.children.length === 0;
};
