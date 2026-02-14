package parser

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
	"strings"

	"itol/internal/domain/models"
)

// NewickParser 实现Newick格式解析器
type NewickParser struct {}

// NewNewickParser 创建一个新的Newick解析器
func NewNewickParser() *NewickParser {
	return &NewickParser{}
}

// Parse 解析Newick格式输入
func (p *NewickParser) Parse(input io.Reader) (interface{}, error) {
	// 读取输入数据
	scanner := bufio.NewScanner(input)
	var newick string
	for scanner.Scan() {
		newick += scanner.Text()
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading input: %w", err)
	}

	// 移除分号和空白
	newick = strings.TrimSpace(newick)
	if strings.HasSuffix(newick, ";") {
		newick = newick[:len(newick)-1]
	}

	// 解析树结构
	tree := models.NewTree("newick")
	nodeID := 0

	// 递归解析子树
	root, err := p.parseSubtree(newick, &nodeID)
	if err != nil {
		return nil, fmt.Errorf("error parsing newick: %w", err)
	}

	// 设置根节点
	tree.SetRoot(root)
	return tree, nil
}

// parseSubtree 解析子树
func (p *NewickParser) parseSubtree(s string, nodeID *int) (*models.Node, error) {
	s = strings.TrimSpace(s)

	// 检查是否为空
	if s == "" {
		return nil, ErrInvalidInput
	}

	// 检查是否为嵌套子树
	if strings.HasPrefix(s, "(") {
		// 找到匹配的右括号
		bracketCount := 1
		endIdx := 1
		for ; endIdx < len(s); endIdx++ {
			if s[endIdx] == '(' {
				bracketCount++
			} else if s[endIdx] == ')' {
				bracketCount--
				if bracketCount == 0 {
					break
				}
			}
		}

		if bracketCount != 0 {
			return nil, ErrInvalidInput
		}

		// 解析子节点
		childrenStr := s[1:endIdx]
		children := []*models.Node{}

		// 分割子节点
		childStrs := p.splitChildren(childrenStr)
		for _, childStr := range childStrs {
			child, err := p.parseSubtree(childStr, nodeID)
			if err != nil {
				return nil, err
			}
			children = append(children, child)
		}

		// 解析当前节点信息
		var label string
		var branchLength float64
		var err error
		if endIdx+1 < len(s) {
			nodeInfo := s[endIdx+1:]
			label, branchLength, err = p.parseNodeInfo(nodeInfo)
			if err != nil {
				return nil, err
			}
		}

		// 创建节点
		id := fmt.Sprintf("node_%d", *nodeID)
		*nodeID++
		node := models.NewNode(id, label, branchLength)

		// 添加子节点
		for _, child := range children {
			node.AddChild(child)
		}

		return node, nil
	} else {
		// 解析叶节点
		label, branchLength, err := p.parseNodeInfo(s)
		if err != nil {
			return nil, err
		}

		// 创建节点
		id := fmt.Sprintf("node_%d", *nodeID)
		*nodeID++
		node := models.NewNode(id, label, branchLength)

		return node, nil
	}
}

// splitChildren 分割子节点字符串
func (p *NewickParser) splitChildren(s string) []string {
	var result []string
	var current string
	bracketCount := 0

	for _, r := range s {
		if r == ',' && bracketCount == 0 {
			result = append(result, strings.TrimSpace(current))
			current = ""
		} else {
			current += string(r)
			if r == '(' {
				bracketCount++
			} else if r == ')' {
				bracketCount--
			}
		}
	}

	if current != "" {
		result = append(result, strings.TrimSpace(current))
	}

	return result
}

// parseNodeInfo 解析节点信息（标签和分支长度）
func (p *NewickParser) parseNodeInfo(s string) (string, float64, error) {
	var label string
	var branchLength float64 = 0

	// 检查是否有分支长度
	colonIdx := strings.Index(s, ":")
	if colonIdx != -1 {
		// 解析标签
		label = strings.TrimSpace(s[:colonIdx])

		// 解析分支长度
		lengthStr := strings.TrimSpace(s[colonIdx+1:])
		if lengthStr != "" {
			length, err := strconv.ParseFloat(lengthStr, 64)
			if err != nil {
				return "", 0, fmt.Errorf("invalid branch length: %w", err)
			}
			branchLength = length
		}
	} else {
		// 只有标签
		label = strings.TrimSpace(s)
	}

	return label, branchLength, nil
}

// Format 将树结构转换为Newick格式
func (p *NewickParser) Format(tree interface{}) (string, error) {
	// 检查树类型
	t, ok := tree.(*models.Tree)
	if !ok {
		return "", ErrUnsupportedFormat
	}

	// 使用树的ToNewick方法
	return t.ToNewick(), nil
}
