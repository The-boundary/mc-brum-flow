import { memo, useState } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const COLORS = {
  single: '#34d399',
  grouped: '#fb923c',
};

export const ColoredEdge = memo(({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & {
  data?: {
    cameraCount?: number;
    hoverLabel?: string;
    isPathHighlighted?: boolean;
    isPathDimmed?: boolean;
    shouldAnimateFlow?: boolean;
  };
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const color = (data?.cameraCount ?? 0) > 1 ? COLORS.grouped : COLORS.single;
  const isPathHighlighted = data?.isPathHighlighted === true;
  const isPathDimmed = data?.isPathDimmed === true;
  const shouldAnimateFlow = data?.shouldAnimateFlow === true;
  const hoverLabel = data?.hoverLabel?.trim();

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {hoverLabel ? <title>{hoverLabel}</title> : null}
      </path>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected || isPathHighlighted ? 3 : 1.75,
          opacity: isPathDimmed ? 0.15 : selected || isPathHighlighted ? 1 : 0.75,
        }}
      />
      {shouldAnimateFlow && !isPathDimmed && (
        <BaseEdge
          id={`${id}-flow`}
          path={edgePath}
          className="flow-edge__highlight-dash"
          style={{
            stroke: 'rgba(255,255,255,0.55)',
            strokeWidth: 1.4,
            strokeDasharray: '8 10',
            opacity: 0.9,
            pointerEvents: 'none',
          }}
        />
      )}
      {hoverLabel && isHovered && !isPathDimmed && (
        <foreignObject
          x={labelX - 60}
          y={labelY - 28}
          width={120}
          height={24}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div className="inline-flex max-w-[160px] items-center justify-center rounded border border-border bg-surface-100/95 px-2 py-1 text-[10px] text-foreground shadow-lg backdrop-blur-sm">
            <span className="truncate">{hoverLabel}</span>
          </div>
        </foreignObject>
      )}
    </>
  );
});

ColoredEdge.displayName = 'ColoredEdge';
