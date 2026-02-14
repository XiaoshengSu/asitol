package main

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"itol/internal/domain/models"
	"itol/internal/service/tree"
)

// APIResponse 定义API响应结构
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func main() {
	// 创建Gin引擎
	r := gin.Default()

	// 初始化树服务
	treeService := tree.NewTreeService()

	// 设置CORS中间件
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})

	// 健康检查端点
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, APIResponse{
			Success: true,
			Message: "Server is healthy",
		})
	})

	// 解析树端点
	r.POST("/api/tree/parse", func(c *gin.Context) {
		// 获取文件
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   "No file uploaded",
			})
			return
		}

		// 获取文件格式
		format := c.PostForm("format")
		if format == "" {
			// 根据文件扩展名猜测格式
			ext := strings.ToLower(filepath.Ext(file.Filename))
			switch ext {
			case ".nwk", ".newick":
				format = "newick"
			case ".nex", ".nexus":
				format = "nexus"
			case ".xml", ".phyloxml":
				format = "phyloxml"
			default:
				c.JSON(http.StatusBadRequest, APIResponse{
					Success: false,
					Error:   "Format not specified and cannot be guessed from file extension",
				})
				return
			}
		}

		// 打开文件
		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, APIResponse{
				Success: false,
				Error:   "Error opening file",
			})
			return
		}
		defer src.Close()

		// 解析树
		parsedTree, err := treeService.ParseTree(src, format)
		if err != nil {
			c.JSON(http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   fmt.Sprintf("Error parsing tree: %v", err),
			})
			return
		}

		c.JSON(http.StatusOK, APIResponse{
			Success: true,
			Data:    parsedTree,
		})
	})

	// 计算布局端点
	r.POST("/api/tree/layout", func(c *gin.Context) {
		var req struct {
			Tree       interface{}            `json:"tree"`
			LayoutType string                  `json:"layout_type"`
			Config     map[string]interface{} `json:"config"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   "Invalid request body",
			})
			return
		}

		// 这里需要将req.Tree转换为*models.Tree类型
		// 为了简化，我们假设前端会发送正确的树结构
		// 实际生产环境中需要更严格的类型检查和转换

		// 暂时使用一个模拟的树结构进行测试
		// 后续需要实现从JSON到Tree对象的转换
		mockTree := &models.Tree{
			Root: &models.Node{
				ID:     "root",
				Label:  "Root",
				IsLeaf: false,
				Children: []*models.Node{
					{
						ID:     "leaf1",
						Label:  "Leaf 1",
						IsLeaf: true,
					},
					{
						ID:     "leaf2",
						Label:  "Leaf 2",
						IsLeaf: true,
					},
				},
			},
			LeafCount: 2,
		}

		// 计算布局
		layout, err := treeService.CalculateLayout(mockTree, req.LayoutType, req.Config)
		if err != nil {
			c.JSON(http.StatusBadRequest, APIResponse{
				Success: false,
				Error:   fmt.Sprintf("Error calculating layout: %v", err),
			})
			return
		}

		c.JSON(http.StatusOK, APIResponse{
			Success: true,
			Data:    layout,
		})
	})

	// 启动服务器
	fmt.Println("Server starting on port 8080...")
	if err := r.Run(":8080"); err != nil {
		fmt.Printf("Error starting server: %v\n", err)
	}
}
