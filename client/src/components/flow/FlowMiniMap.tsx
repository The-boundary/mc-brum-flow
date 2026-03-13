import { useMemo, useRef, useState, useEffect } from 'react';
import { useFlowStore } from '@/stores/flowStore';
import { getFlowHandleLayout, getNodeHeight } from './flowLayout';
import { getMiniMapNodeColor } from './NodeFlowView';

const NODE_WIDTH = 180;

/**
 * Custom minimap built on the app's own Zustand flowStore.
 * No React Flow hooks needed — works anywhere in the component tree.
 */
export function FlowMiniMap() {
  const flowNodes = useFlowStore((s) => s.flowNodes);
  const flowEdges = useFlowStore((s) => s.flowEdges);
  const viewport = useFlowStore((s) => s.viewport);
  const updateViewport = useFlowStore((s) => s.updateViewport);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 380, h: 160 });

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Compute node sizes via handle layout
  const nodeSizes = useMemo(() => {
    const layout = getFlowHandleLayout(flowNodes, flowEdges);
    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of flowNodes) {
      const handles = layout.nodeHandles.get(node.id);
      const hCount = Math.max(handles?.inputHandleIds.length ?? 0, handles?.outputHandleIds.length ?? 0);
      sizes.set(node.id, { w: NODE_WIDTH, h: getNodeHeight(hCount) });
    }
    return sizes;
  }, [flowNodes, flowEdges]);

  // Bounding box of all nodes
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of flowNodes) {
    const size = nodeSizes.get(node.id) ?? { w: NODE_WIDTH, h: 60 };
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + size.w);
    maxY = Math.max(maxY, node.position.y + size.h);
  }

  if (!isFinite(minX)) {
    return <div ref={containerRef} className="w-full h-full bg-surface-100" />;
  }

  const pad = 60;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  let vbW = maxX - minX;
  let vbH = maxY - minY;

  // Expand viewBox to match container aspect ratio so SVG fills entire area
  const containerAR = containerSize.w / containerSize.h;
  const graphAR = vbW / vbH;

  if (graphAR > containerAR) {
    // Graph is wider than container — expand height
    const newH = vbW / containerAR;
    const extraH = newH - vbH;
    minY -= extraH / 2;
    vbH = newH;
  } else {
    // Graph is taller than container — expand width
    const newW = vbH * containerAR;
    const extraW = newW - vbW;
    minX -= extraW / 2;
    vbW = newW;
  }

  // Get the ReactFlow container element dimensions
  const rfEl = document.querySelector('.react-flow');
  const rfWidth = rfEl?.clientWidth ?? 800;
  const rfHeight = rfEl?.clientHeight ?? 600;

  // Viewport rectangle in graph coordinates
  const vpX = -viewport.x / viewport.zoom;
  const vpY = -viewport.y / viewport.zoom;
  const vpW = rfWidth / viewport.zoom;
  const vpH = rfHeight / viewport.zoom;

  // Stroke scales inversely with the viewBox so it looks consistent
  const strokeScale = vbW / 300;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const graphX = minX + ratioX * vbW;
    const graphY = minY + ratioY * vbH;
    updateViewport({
      x: -(graphX - vpW / 2) * viewport.zoom,
      y: -(graphY - vpH / 2) * viewport.zoom,
      zoom: viewport.zoom,
    });
  };

  return (
    <div ref={containerRef} className="w-full h-full">
      <svg
        viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
        className="w-full h-full bg-surface-100 cursor-pointer"
        onClick={handleClick}
      >
        {/* Dim mask — everything outside the viewport */}
        <defs>
          <mask id="viewport-mask">
            <rect x={minX} y={minY} width={vbW} height={vbH} fill="white" />
            <rect x={vpX} y={vpY} width={vpW} height={vpH} fill="black" rx={4 * strokeScale} />
          </mask>
        </defs>

        {/* Nodes */}
        {flowNodes.map((node) => {
          const size = nodeSizes.get(node.id) ?? { w: NODE_WIDTH, h: 60 };
          return (
            <rect
              key={node.id}
              x={node.position.x}
              y={node.position.y}
              width={size.w}
              height={size.h}
              fill={getMiniMapNodeColor(node.type)}
              stroke="rgba(15, 23, 42, 0.9)"
              strokeWidth={1 * strokeScale}
              rx={3 * strokeScale}
            />
          );
        })}

        {/* Dim overlay outside viewport */}
        <rect
          x={minX}
          y={minY}
          width={vbW}
          height={vbH}
          fill="rgba(2, 6, 23, 0.45)"
          mask="url(#viewport-mask)"
        />

        {/* Viewport border */}
        <rect
          x={vpX}
          y={vpY}
          width={vpW}
          height={vpH}
          fill="none"
          stroke="rgba(125, 211, 252, 0.95)"
          strokeWidth={1.5 * strokeScale}
          rx={4 * strokeScale}
        />
      </svg>
    </div>
  );
}
