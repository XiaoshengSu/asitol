// 注释类型
export type AnnotationType = 'COLORSTRIP' | 'HEATMAP' | 'BARCHART' | 'PIECHART' | 'BINARY' | 'STRIP' | 'ALIGNMENT' | 'CONNECTIONS' | 'POPUP';

// 注释数据类型
export interface AnnotationData {
  id: string;
  name: string;
  type: AnnotationType;
  data: Record<string, any>;
  config?: AnnotationConfig;
}

// 注释配置类型
export interface AnnotationConfig {
  colorScheme?: string[];
  minValue?: number;
  maxValue?: number;
  width?: number;
  height?: number;
  opacity?: number;
  showLabels?: boolean;
  [key: string]: any;
}

// 图层类型
export interface Layer {
  id: string;
  name: string;
  type: AnnotationType;
  data: AnnotationData;
  visible: boolean;
  order: number;
  config: AnnotationConfig;
}
