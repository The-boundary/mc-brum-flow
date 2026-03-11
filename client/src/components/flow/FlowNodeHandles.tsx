import { useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';

interface FlowNodeHandlesProps {
  nodeId: string;
  inputHandleIds?: string[];
  outputHandleIds?: string[];
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
  className: string
) {
  return handleIds.map((handleId, index) => (
    <Handle
      key={handleId}
      id={handleId}
      type={type}
      position={position}
      className={`flow-node__handle ${className}`}
      style={{ top: getHandleTop(index, handleIds.length) }}
    />
  ));
}

export function FlowNodeHandles({
  nodeId,
  inputHandleIds = [],
  outputHandleIds = [],
  inputClassName,
  outputClassName,
}: FlowNodeHandlesProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = `${nodeId}:${inputHandleIds.join('|')}:${outputHandleIds.join('|')}`;

  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [handleSignature, nodeId, updateNodeInternals]);

  return (
    <>
      {renderHandles(inputHandleIds, 'target', Position.Left, inputClassName)}
      {renderHandles(outputHandleIds, 'source', Position.Right, outputClassName)}
    </>
  );
}
