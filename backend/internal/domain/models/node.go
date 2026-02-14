package models

// Node 表示树节点
type Node struct {
	ID           string             `json:"id"`            // 唯一标识符
	Label        string             `json:"label"`         // 节点标签
	BranchLength float64            `json:"branch_length"` // 分支长度
	Parent       *Node              `json:"-"`            // 父节点引用（不序列化）
	Children     []*Node            `json:"children"`      // 子节点列表
	Metadata     map[string]interface{} `json:"metadata"`    // 元数据映射
	Depth        int                `json:"depth"`         // 节点深度
	IsLeaf       bool               `json:"is_leaf"`       // 是否为叶节点
}

// NewNode 创建一个新的树节点
func NewNode(id, label string, branchLength float64) *Node {
	return &Node{
		ID:           id,
		Label:        label,
		BranchLength: branchLength,
		Children:     make([]*Node, 0),
		Metadata:     make(map[string]interface{}),
		Depth:        0,
		IsLeaf:       true,
	}
}

// AddChild 添加子节点
func (n *Node) AddChild(child *Node) {
	n.Children = append(n.Children, child)
	child.Parent = n
	child.Depth = n.Depth + 1
	n.IsLeaf = false
}

// RemoveChild 移除子节点
func (n *Node) RemoveChild(child *Node) bool {
	for i, c := range n.Children {
		if c.ID == child.ID {
			n.Children = append(n.Children[:i], n.Children[i+1:]...)
			child.Parent = nil
			if len(n.Children) == 0 {
				n.IsLeaf = true
			}
			return true
		}
	}
	return false
}

// GetPath 获取从根节点到当前节点的路径
func (n *Node) GetPath() []*Node {
	path := make([]*Node, 0)
	current := n
	for current != nil {
		path = append([]*Node{current}, path...)
		current = current.Parent
	}
	return path
}

// GetSubtreeSize 获取子树大小（包括当前节点）
func (n *Node) GetSubtreeSize() int {
	size := 1
	for _, child := range n.Children {
		size += child.GetSubtreeSize()
	}
	return size
}

// GetLeafCount 获取子树叶节点数量
func (n *Node) GetLeafCount() int {
	if n.IsLeaf {
		return 1
	}
	count := 0
	for _, child := range n.Children {
		count += child.GetLeafCount()
	}
	return count
}
