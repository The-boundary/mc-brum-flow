import { useEffect, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';

import type { BranchLabelMeta } from './graphSemantics';

interface FlowNodeHandlesProps {
  nodeId: string;
  inputHandleIds?: string[];
  outputHandleIds?: string[];
  outputHandleLabels?: Record<string, BranchLabelMeta>;
  inputClassName: string;
  outputClassName: string;
}

function getHandleTop(index: number, count: number): string {
  if (count <= 1) return '50%';

  const inset = 24;
  const span = 100 - inset * 2;
  return `${inset + (span * index) / (count - 1)}%`;
}

function renderHandles(
  handleIds: string[],
  type: 'source' | 'target',
  position: Position,
  className: string,
  labels?: Record<string, BranchLabelMeta>,
  onHoverChange?: (handleId: string | null) => void
) {
  return handleIds.map((handleId, index) => (
    <Handle
      key={handleId}
      id={handleId}
      type={type}
      position={position}
      className={`flow-node__handle ${className}`}
      style={{ top: getHandleTop(index, handleIds.length) }}
      title={labels?.[handleId]?.label}
      onMouseEnter={() => onHoverChange?.(handleId)}
      onMouseLeave={() => onHoverChange?.(null)}
    />
  ));
}

export function FlowNodeHandles({
  nodeId,
  inputHandleIds = [],
  outputHandleIds = [],
  outputHandleLabels = {},
  inputClassName,
  outputClassName,
}: FlowNodeHandlesProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const [hoveredOutputHandleId, setHoveredOutputHandleId] = useState<string | null>(null);
  const showConnectAll = outputHandleIds.length >= 2;
  const handleSignature = `${nodeId}:${inputHandleIds.join('|')}:${outputHandleIds.join('|')}:${showConnectAll}`;
  const hoveredOutputHandle = hoveredOutputHandleId ? outputHandleLabels[hoveredOutputHandleId] : null;
  const hoveredOutputHandleIndex = hoveredOutputHandleId ? outputHandleIds.indexOf(hoveredOutputHandleId) : -1;

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [handleSignature, nodeId, updateNodeInternals]);

  return (
    <>
      {renderHandles(inputHandleIds, 'target', Position.Left, inputClassName)}
      {renderHandles(outputHandleIds, 'source', Position.Right, outputClassName, outputHandleLabels, setHoveredOutputHandleId)}
      {showConnectAll && (
        <Handle
          id="source-all"
          type="source"
          position={Position.Right}
          className="flow-node__handle !bg-white !border-white/60 !w-2.5 !h-2.5"
          style={{ top: '8px' }}
          title={`Connect all ${outputHandleIds.length} outputs`}
        />
      )}
      {hoveredOutputHandle && hoveredOutputHandleIndex >= 0 ? (
        <div
          className={`pointer-events-none absolute right-3 z-10 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[9px] shadow-md backdrop-blur-sm ${hoveredOutputHandle.tone === 'camera' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100' : hoveredOutputHandle.tone === 'group' ? 'border-orange-500/40 bg-orange-500/15 text-orange-100' : hoveredOutputHandle.tone === 'mixed' ? 'border-sky-500/40 bg-sky-500/15 text-sky-100' : 'border-border bg-surface-100/95 text-foreground'}`}
          style={{ top: getHandleTop(hoveredOutputHandleIndex, outputHandleIds.length), transform: 'translate(100%, -50%)' }}
        >
          {hoveredOutputHandle.label}
        </div>
      ) : null}
    </>
  );
}
