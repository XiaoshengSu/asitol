package tree

import (
	"fmt"
	"io"
	"math"

	"itol/internal/domain/models"
	"itol/internal/infrastructure/parser"
)

// Service 定义树服务接口
type Service interface {
	// ParseTree 解析树文件
	ParseTree(file io.Reader, format string) (*models.Tree, error)

	// CalculateLayout 计算树布局
	CalculateLayout(tree *models.Tree, layoutType string, config map[string]interface{}) (map[string]interface{}, error)
}

// TreeService 实现树服务
type TreeService struct {
	parsers map[string]parser.Parser
}

// NewTreeService 创建一个新的树服务
func NewTreeService() *TreeService {
	// 初始化解析器映射
	parsers := make(map[string]parser.Parser)
	parsers["newick"] = parser.NewNewickParser()

	return &TreeService{
		parsers: parsers,
	}
}

// ParseTree 解析树文件
func (s *TreeService) ParseTree(file io.Reader, format string) (*models.Tree, error) {
	// 检查格式是否支持
	p, ok := s.parsers[format]
	if !ok {
		return nil, fmt.Errorf("unsupported format: %s", format)
	}

	// 解析文件
	tree, err := p.Parse(file)
	if err != nil {
		return nil, fmt.Errorf("error parsing tree: %w", err)
	}

	// 类型断言
	t, ok := tree.(*models.Tree)
	if !ok {
		return nil, fmt.Errorf("invalid tree type")
	}

	return t, nil
}

// CalculateLayout 计算树布局
func (s *TreeService) CalculateLayout(tree *models.Tree, layoutType string, config map[string]interface{}) (map[string]interface{}, error) {
	// 检查树是否为空
	if tree == nil || tree.Root == nil {
		return nil, fmt.Errorf("tree is empty")
	}

	// 根据布局类型计算布局
	var layoutData map[string]interface{}
	var err error

	switch layoutType {
	case "circular":
		layoutData, err = s.calculateCircularLayout(tree, config)
	case "rectangular":
		layoutData, err = s.calculateRectangularLayout(tree, config)
	case "radial":
		layoutData, err = s.calculateRadialLayout(tree, config)
	case "unrooted":
		layoutData, err = s.calculateUnrootedLayout(tree, config)
	default:
		return nil, fmt.Errorf("unsupported layout type: %s", layoutType)
	}

	if err != nil {
		return nil, fmt.Errorf("error calculating layout: %w", err)
	}

	return layoutData, nil
}

// calculateCircularLayout 计算圆形布局
func (s *TreeService) calculateCircularLayout(tree *models.Tree, config map[string]interface{}) (map[string]interface{}, error) {
	// 实现圆形布局计算
	// 这里简化实现，实际需要更复杂的算法
	layout := make(map[string]interface{})
	nodePositions := make(map[string]map[string]float64)

	// 遍历树，为每个节点分配位置
	s.traverseCircular(tree.Root, 0, 0, 100, nodePositions)

	layout["type"] = "circular"
	layout["nodes"] = nodePositions
	layout["width"] = 800.0
	layout["height"] = 800.0

	return layout, nil
}

// traverseCircular 遍历树，计算圆形布局位置
func (s *TreeService) traverseCircular(node *models.Node, angle, depth, radius float64, positions map[string]map[string]float64) {
	// 计算节点位置
	x := radius * depth * float64(node.Depth) * float64(1) * float64(cos(angle))
	y := radius * depth * float64(node.Depth) * float64(1) * float64(sin(angle))

	positions[node.ID] = map[string]float64{
		"x":     x,
		"y":     y,
		"angle": angle,
		"depth": float64(node.Depth),
	}

	// 递归处理子节点
	if len(node.Children) > 0 {
		childAngle := angle - float64(len(node.Children)-1)*0.5
		for i, child := range node.Children {
			s.traverseCircular(child, childAngle+float64(i), depth+1, radius, positions)
		}
	}
}

// calculateRectangularLayout 计算矩形布局
func (s *TreeService) calculateRectangularLayout(tree *models.Tree, config map[string]interface{}) (map[string]interface{}, error) {
	// 实现矩形布局计算
	layout := make(map[string]interface{})
	nodePositions := make(map[string]map[string]float64)

	// 计算叶节点数量
	leafCount := tree.LeafCount

	// 遍历树，为每个节点分配位置
	leafIndex := 0
	s.traverseRectangular(tree.Root, 0, 0, float64(leafCount), &leafIndex, nodePositions)

	layout["type"] = "rectangular"
	layout["nodes"] = nodePositions
	layout["width"] = 800.0
	layout["height"] = 600.0

	return layout, nil
}

// traverseRectangular 遍历树，计算矩形布局位置
func (s *TreeService) traverseRectangular(node *models.Node, x, y, leafCount float64, leafIndex *int, positions map[string]map[string]float64) {
	// 计算节点位置
	positions[node.ID] = map[string]float64{
		"x": x,
		"y": y,
	}

	// 递归处理子节点
	if node.IsLeaf {
		// 叶节点均匀分布
		y = float64(*leafIndex) * (600.0 / leafCount)
		*leafIndex++
	} else {
		// 内部节点位置为子节点的平均值
		childY := 0.0
		for i, child := range node.Children {
			childX := x + 100.0 // 固定水平间距
			s.traverseRectangular(child, childX, childY, leafCount, leafIndex, positions)
			if i == 0 {
				childY = positions[child.ID]["y"]
			}
		}

		// 更新内部节点的y坐标为子节点的平均值
		if len(node.Children) > 0 {
			minY := positions[node.Children[0].ID]["y"]
			maxY := positions[node.Children[0].ID]["y"]
			for _, child := range node.Children {
				if positions[child.ID]["y"] < minY {
					minY = positions[child.ID]["y"]
				}
				if positions[child.ID]["y"] > maxY {
					maxY = positions[child.ID]["y"]
				}
			}
			positions[node.ID]["y"] = (minY + maxY) / 2
		}
	}
}

// calculateRadialLayout 计算径向布局
func (s *TreeService) calculateRadialLayout(tree *models.Tree, config map[string]interface{}) (map[string]interface{}, error) {
	// 实现径向布局计算
	layout := make(map[string]interface{})
	nodePositions := make(map[string]map[string]float64)

	// 遍历树，为每个节点分配位置
	s.traverseRadial(tree.Root, 0, 0, 100, nodePositions)

	layout["type"] = "radial"
	layout["nodes"] = nodePositions
	layout["width"] = 800.0
	layout["height"] = 800.0

	return layout, nil
}

// traverseRadial 遍历树，计算径向布局位置
func (s *TreeService) traverseRadial(node *models.Node, angle, depth, radius float64, positions map[string]map[string]float64) {
	// 计算节点位置
	x := radius * float64(node.Depth) * float64(cos(angle))
	y := radius * float64(node.Depth) * float64(sin(angle))

	positions[node.ID] = map[string]float64{
		"x":     x,
		"y":     y,
		"angle": angle,
		"depth": float64(node.Depth),
	}

	// 递归处理子节点
	if len(node.Children) > 0 {
		childAngle := angle - float64(len(node.Children)-1)*0.5
		for i, child := range node.Children {
			s.traverseRadial(child, childAngle+float64(i), depth+1, radius, positions)
		}
	}
}

// calculateUnrootedLayout 计算无根树布局
func (s *TreeService) calculateUnrootedLayout(tree *models.Tree, config map[string]interface{}) (map[string]interface{}, error) {
	// 实现无根树布局计算
	layout := make(map[string]interface{})
	nodePositions := make(map[string]map[string]float64)

	// 遍历树，为每个节点分配位置
	s.traverseUnrooted(tree.Root, 0, 0, 100, nodePositions)

	layout["type"] = "unrooted"
	layout["nodes"] = nodePositions
	layout["width"] = 800.0
	layout["height"] = 800.0

	return layout, nil
}

// traverseUnrooted 遍历树，计算无根树布局位置
func (s *TreeService) traverseUnrooted(node *models.Node, x, y, radius float64, positions map[string]map[string]float64) {
	// 计算节点位置
	positions[node.ID] = map[string]float64{
		"x": x,
		"y": y,
	}

	// 递归处理子节点
	if len(node.Children) > 0 {
		for i, child := range node.Children {
			angle := float64(i) * (2 * 3.14159 / float64(len(node.Children)))
			childX := x + radius*float64(cos(angle))
			childY := y + radius*float64(sin(angle))
			s.traverseUnrooted(child, childX, childY, radius*0.8, positions)
		}
	}
}

// cos 计算余弦值
func cos(angle float64) float64 {
	return math.Cos(angle)
}

// sin 计算正弦值
func sin(angle float64) float64 {
	return math.Sin(angle)
}
