import { useCallback } from 'react';
import { useStore, useReactFlow } from '@xyflow/react';
import { getMiniMapNodeColor } from './NodeFlowView';

/**
 * Custom minimap that reads from the ReactFlow store.
 * Works anywhere inside <ReactFlowProvider> — no need to be
 * a child of <ReactFlow>, so it can live in the detail panel.
 */
export function FlowMiniMap() {
  const nodes = useStore((s) => s.nodes);
  const viewport = useStore((s) => ({ x: s.transform[0], y: s.transform[1], zoom: s.transform[2] }));
  const rfWidth = useStore((s) => s.width);
  const rfHeight = useStore((s) => s.height);
  const { setViewport } = useReactFlow();

  // Bounding box of all nodes
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const w = node.measured?.width ?? (node.width as number | undefined) ?? 150;
    const h = node.measured?.height ?? (node.height as number | undefined) ?? 60;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }

  if (!isFinite(minX)) return null;

  const pad = 60;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const bbW = maxX - minX;
  const bbH = maxY - minY;

  // Viewport rectangle in graph coordinates
  const vpX = -viewport.x / viewport.zoom;
  const vpY = -viewport.y / viewport.zoom;
  const vpW = rfWidth / viewport.zoom;
  const vpH = rfHeight / viewport.zoom;

  // Stroke scales inversely with the viewBox so it looks consistent
  const strokeScale = bbW / 300;

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const ratioX = (e.clientX - rect.left) / rect.width;
      const ratioY = (e.clientY - rect.top) / rect.height;
      const graphX = minX + ratioX * bbW;
      const graphY = minY + ratioY * bbH;
      setViewport(
        {
          x: -(graphX - vpW / 2) * viewport.zoom,
          y: -(graphY - vpH / 2) * viewport.zoom,
          zoom: viewport.zoom,
        },
        { duration: 200 },
      );
    },
    [minX, minY, bbW, bbH, vpW, vpH, viewport.zoom, setViewport],
  );

  return (
    <svg
      viewBox={`${minX} ${minY} ${bbW} ${bbH}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full bg-surface-100 cursor-pointer"
      onClick={handleClick}
    >
      {/* Dim mask — everything outside the viewport */}
      <defs>
        <mask id="viewport-mask">
          <rect x={minX} y={minY} width={bbW} height={bbH} fill="white" />
          <rect x={vpX} y={vpY} width={vpW} height={vpH} fill="black" rx={4 * strokeScale} />
        </mask>
      </defs>

      {/* Nodes */}
      {nodes.map((node) => {
        const w = node.measured?.width ?? (node.width as number | undefined) ?? 150;
        const h = node.measured?.height ?? (node.height as number | undefined) ?? 60;
        return (
          <rect
            key={node.id}
            x={node.position.x}
            y={node.position.y}
            width={w}
            height={h}
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
        width={bbW}
        height={bbH}
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
  );
}
