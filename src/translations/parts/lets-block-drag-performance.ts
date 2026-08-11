export const en = {
  "lets-block-drag-performance.displayName": "Smoother native block dragging",
  "lets-block-drag-performance.description": "Reduce redundant native block drag updates while preserving SiYuan's placement and move behavior.",
  "lets-block-drag-performance.intervalTitle": "Minimum update interval (ms)",
  "lets-block-drag-performance.intervalDescription": "24 ms is balanced. Higher values reduce work further but make placement feedback update less often; allowed range: 16-80 ms.",
};

export const zhCN: typeof en = {
  "lets-block-drag-performance.displayName": "原生块拖动流畅度优化",
  "lets-block-drag-performance.description": "减少原生块拖动中的重复更新，同时保留思源原有的插入位置判断与移动行为。",
  "lets-block-drag-performance.intervalTitle": "最短更新间隔（毫秒）",
  "lets-block-drag-performance.intervalDescription": "24 毫秒较为均衡；数值越大，处理开销越低，但位置提示更新频率也会降低。允许范围为 16-80 毫秒。",
};
