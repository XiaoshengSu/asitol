import type { RenderConfig } from '../types/layout';
import { SVGRenderer } from './renderer/svgRenderer';

export const createRenderer = (container: HTMLElement, config: RenderConfig) => {
  return new SVGRenderer(container, config);
};

export { SVGRenderer };
