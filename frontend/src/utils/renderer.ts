import type { RenderConfig } from '../types/layout';
import { CanvasRenderer } from './renderer/canvasRenderer';
import { SVGRenderer } from './renderer/svgRenderer';

export const createRenderer = (container: HTMLElement, config: RenderConfig) => {
  if (config.mode === 'svg') {
    return new SVGRenderer(container, config);
  }
  return new CanvasRenderer(container, config);
};

export { CanvasRenderer, SVGRenderer };
