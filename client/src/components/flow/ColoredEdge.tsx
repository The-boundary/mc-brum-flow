import { memo } from 'react';
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
    isPathHighlighted?: boolean;
    isPathDimmed?: boolean;
    shouldAnimateFlow?: boolean;
  };
}) => {
  const [edgePath] = getSmoothStepPath({
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

  return (
    <>
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
    </>
  );
});

ColoredEdge.displayName = 'ColoredEdge';
