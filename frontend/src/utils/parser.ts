import type { Tree, TreeNode } from '../types/tree';
import type { AnnotationData } from '../types/annotation';

// 生成唯一ID
const generateId = (): string => {
  return `id_${Math.random().toString(36).substr(2, 9)}`;
};

// 解析Newick格式的树
const parseNewick = (newick: string): Tree => {
  let index = 0;
  let nodeId = 0;

  const parseNode = (parentId?: string): TreeNode => {
    const id = `node_${nodeId++}`;
    let name = '';
    let branchLength: number | undefined;
    const children: TreeNode[] = [];

    // 跳过空白字符
    while (index < newick.length && /\s/.test(newick[index])) {
      index++;
    }

    // 解析子节点
    if (newick[index] === '(') {
      index++;
      while (index < newick.length && newick[index] !== ')') {
        children.push(parseNode(id));
        // 跳过逗号
        if (newick[index] === ',') {
          index++;
        }
      }
      if (index < newick.length && newick[index] === ')') {
        index++;
      }
    }

    // 解析节点名称
    while (index < newick.length && newick[index] !== ':' && newick[index] !== ',' && newick[index] !== ')') {
      name += newick[index];
      index++;
    }

    // 解析分支长度
    if (index < newick.length && newick[index] === ':') {
      index++;
      let lengthStr = '';
      while (index < newick.length && newick[index] !== ',' && newick[index] !== ')') {
        lengthStr += newick[index];
        index++;
      }
      const numeric = parseFloat(lengthStr);
      if (!Number.isNaN(numeric)) {
        branchLength = numeric;
      }
    }

    return {
      id,
      name: name.trim(),
      children: children.length > 0 ? children : undefined,
      parent: parentId,
      branchLength
    };
  };

  const root = parseNode();
  const nodeCount = countNodes(root);

  return {
    id: generateId(),
    name: 'Newick Tree',
    format: 'newick',
    nodeCount,
    root
  };
};

// 计算树的节点数量
const countNodes = (node: TreeNode): number => {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
};

// 解析注释数据
const parseAnnotation = (data: string, type: string): AnnotationData => {
  try {
    const parsed = JSON.parse(data);
    // 这里实现简单的注释数据解析
    // 实际项目中需要根据不同类型的注释文件格式进行解析
    return {
      id: generateId(),
      name: 'Annotation',
      type: type as any,
      data: parsed
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse annotation data: ${message}`);
  }
};

// 导出解析函数
export const parser = {
  parseNewick,
  parseAnnotation
};
