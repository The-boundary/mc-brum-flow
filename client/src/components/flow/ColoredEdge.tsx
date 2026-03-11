import { memo } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

const COLORS = {
  camera: '#34d399',   // emerald-400
  group: '#fb923c',    // orange-400
  default: '#5acfd9',  // cyan
};

export const ColoredEdge = memo(({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: { sourceType?: string } }) => {
  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY,
    targetX, targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const sourceType = data?.sourceType ?? 'default';
  const color = sourceType === 'camera' ? COLORS.camera
    : sourceType === 'group' ? COLORS.group
    : COLORS.default;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: selected ? 2.5 : 1.5,
        opacity: selected ? 1 : 0.6,
      }}
    />
  );
});

ColoredEdge.displayName = 'ColoredEdge';
