package parser

import (
	"errors"
	"io"
)

// Parser 定义树解析器接口
type Parser interface {
	// Parse 解析输入数据，返回树结构
	Parse(input io.Reader) (interface{}, error)
	
	// Format 将树结构转换为特定格式
	Format(tree interface{}) (string, error)
}

// ErrUnsupportedFormat 表示不支持的格式错误
var ErrUnsupportedFormat = errors.New("unsupported format")

// ErrInvalidInput 表示输入数据无效错误
var ErrInvalidInput = errors.New("invalid input")
