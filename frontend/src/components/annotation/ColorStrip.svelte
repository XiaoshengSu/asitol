<script lang="ts">
  import type { AnnotationData, AnnotationConfig } from '../../types/annotation';

  export let data: AnnotationData;
  export let config: AnnotationConfig;
  export let width: number = 200;
  export let height: number = 20;

  // 生成颜色映射
  const getColor = (value: string): string => {
    const colorScheme = config.colorScheme || ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
    const index = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colorScheme.length;
    return colorScheme[index];
  };
</script>

<div class="bg-gray-800 p-2 rounded">
  <h4 class="text-xs font-medium text-gray-300 mb-2">{data.name}</h4>
  <div class="flex flex-col gap-1">
    {#each Object.entries(data.data) as [key, value]}
      <div class="flex items-center gap-2">
        <div
          class="w-3 h-3 rounded"
          style="background-color: {getColor(String(value))}"
        ></div>
        <span class="text-xs text-gray-300">{key}</span>
        <span class="text-xs text-gray-400">{String(value)}</span>
      </div>
    {/each}
  </div>
</div>
