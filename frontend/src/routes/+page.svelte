<script lang="ts">
  import { goto } from '$app/navigation';
  import TailwindTest from '../components/ui/TailwindTest.svelte';
</script>

<div class="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
  <div class="max-w-md w-full bg-gray-800 rounded-lg shadow-xl p-8 space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold text-white mb-2">AS iTOL</h1>
      <p class="text-gray-400 text-sm">Interactive Tree Of Life</p>
      <p class="text-gray-500 text-xs mt-2">系统发育树可视化与注释工具</p>
    </div>

    <div class="space-y-4">
      <TailwindTest />
      
      <button
        class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-md transition-colors"
        on:click={() => goto('/editor')}
      >
        开始使用
      </button>

      <div class="pt-4 border-t border-gray-700">
        <h3 class="text-sm font-medium text-gray-300 mb-2">功能特点</h3>
        <ul class="text-xs text-gray-400 space-y-1">
          <li class="flex items-center gap-2">
            <span class="text-blue-400">•</span>
            支持多种树布局（矩形、圆形、径向、无根）
          </li>
          <li class="flex items-center gap-2">
            <span class="text-blue-400">•</span>
            丰富的注释图层系统
          </li>
          <li class="flex items-center gap-2">
            <span class="text-blue-400">•</span>
            高性能渲染引擎
          </li>
          <li class="flex items-center gap-2">
            <span class="text-blue-400">•</span>
            直观的用户界面
          </li>
          <li class="flex items-center gap-2">
            <span class="text-blue-400">•</span>
            支持多种导出格式
          </li>
        </ul>
      </div>
    </div>
  </div>

  <div class="mt-8 text-xs text-gray-500">
    © 2026 IOTA iTOL - 系统发育树可视化工具
  </div>
</div>
