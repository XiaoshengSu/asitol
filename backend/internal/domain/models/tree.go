package models

import (
	"fmt"
	"strings"
)

// Tree 表示系统发育树
type Tree struct {
	Root       *Node            `json:"root"`        // 根节点
	Nodes      map[string]*Node `json:"nodes"`       // 节点映射（ID -> 节点）
	LeafCount  int              `json:"leaf_count"`  // 叶节点数量
	NodeCount  int              `json:"node_count"`  // 总节点数量
	Format     string           `json:"format"`      // 树格式
	MaxDepth   int              `json:"max_depth"`   // 最大深度
	MaxBranchLength float64     `json:"max_branch_length"` // 最大分支长度
}

// NewTree 创建一个新的树
func NewTree(format string) *Tree {
	return &Tree{
		Root:       nil,
		Nodes:      make(map[string]*Node),
		LeafCount:  0,
		NodeCount:  0,
		Format:     format,
		MaxDepth:   0,
		MaxBranchLength: 0,
	}
}

// SetRoot 设置根节点
func (t *Tree) SetRoot(root *Node) {
	t.Root = root
	t.Nodes = make(map[string]*Node)
	t.LeafCount = 0
	t.NodeCount = 0
	t.MaxDepth = 0
	t.MaxBranchLength = 0
	
	// 遍历树，更新节点信息
	t.traverse(root, 0)
}

// traverse 遍历树，更新节点信息
func (t *Tree) traverse(node *Node, depth int) {
	// 更新节点深度
	node.Depth = depth
	if depth > t.MaxDepth {
		t.MaxDepth = depth
	}
	
	// 更新最大分支长度
	if node.BranchLength > t.MaxBranchLength {
		t.MaxBranchLength = node.BranchLength
	}
	
	// 添加节点到映射
	t.Nodes[node.ID] = node
	t.NodeCount++
	
	// 检查是否为叶节点
	if node.IsLeaf {
		t.LeafCount++
	}
	
	// 递归遍历子节点
	for _, child := range node.Children {
		t.traverse(child, depth+1)
	}
}

// GetNode 通过ID获取节点
func (t *Tree) GetNode(id string) (*Node, bool) {
	node, ok := t.Nodes[id]
	return node, ok
}

// AddNode 添加节点到树
func (t *Tree) AddNode(node *Node) {
	t.Nodes[node.ID] = node
	t.NodeCount++
	if node.IsLeaf {
		t.LeafCount++
	}
}

// RemoveNode 从树中移除节点
func (t *Tree) RemoveNode(node *Node) bool {
	if node == t.Root {
		return false // 不能移除根节点
	}
	
	if parent := node.Parent; parent != nil {
		if parent.RemoveChild(node) {
			delete(t.Nodes, node.ID)
			t.NodeCount--
			if node.IsLeaf {
				t.LeafCount--
			}
			return true
		}
	}
	
	return false
}

// ToNewick 将树转换为Newick格式
func (t *Tree) ToNewick() string {
	if t.Root == nil {
		return ""
	}
	
	return t.nodeToNewick(t.Root) + ";"
}

// nodeToNewick 将节点转换为Newick格式
func (t *Tree) nodeToNewick(node *Node) string {
	var builder strings.Builder
	
	// 如果有子节点，递归处理
	if len(node.Children) > 0 {
		builder.WriteString("(")
		for i, child := range node.Children {
			if i > 0 {
				builder.WriteString(",")
			}
			builder.WriteString(t.nodeToNewick(child))
		}
		builder.WriteString(")")
	}
	
	// 写入节点标签
	if node.Label != "" {
		builder.WriteString(node.Label)
	}
	
	// 写入分支长度
	if node.BranchLength > 0 {
		builder.WriteString(fmt.Sprintf(":%g", node.BranchLength))
	}
	
	return builder.String()
}

// Validate 验证树的有效性
func (t *Tree) Validate() error {
	if t.Root == nil {
		return fmt.Errorf("tree has no root node")
	}
	
	if t.NodeCount == 0 {
		return fmt.Errorf("tree has no nodes")
	}
	
	// 检查节点ID唯一性
	seenIDs := make(map[string]bool)
	for id := range t.Nodes {
		if seenIDs[id] {
			return fmt.Errorf("duplicate node ID: %s", id)
		}
		seenIDs[id] = true
	}
	
	return nil
}
