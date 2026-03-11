import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { FileOutput } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import { FlowNodeHandles } from '../FlowNodeHandles';

interface OutputFlowData {
  label: string;
  enabled?: boolean;
  config_id?: string;
  isPathHighlighted?: boolean;
  isPathDimmed?: boolean;
  inputHandleIds?: string[];
  [key: string]: unknown;
}

export const OutputFlowNode = memo(({ id, data }: NodeProps & { data: OutputFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);
  const isSelected = selectedNodeId === id;
  const isPathHighlighted = data.isPathHighlighted === true;
  const isPathDimmed = data.isPathDimmed === true;

  const config = data.config_id ? nodeConfigs.find((c) => c.id === data.config_id) : null;
  const format = (config?.delta?.format as string) ?? 'EXR';
  const pathsToThis = resolvedPaths.filter((path) => path.outputNodeId === id);
  const enabledCount = pathsToThis.filter((path) => path.enabled).length;
  const hasResolvedPaths = pathsToThis.length > 0;
  const isFullyDisabled = hasResolvedPaths && enabledCount === 0;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer transition-all ${
        isSelected
          ? 'border-fuchsia-400 bg-fuchsia-400/10 shadow-[0_0_12px_rgba(232,121,249,0.25)]'
          : isPathHighlighted
          ? 'border-fuchsia-400/80 bg-fuchsia-400/10 shadow-[0_0_10px_rgba(232,121,249,0.18)]'
          : !isFullyDisabled
          ? 'border-border bg-surface-200 hover:border-fuchsia-400/50'
          : 'border-border/40 bg-surface-200/40 opacity-70'
      } ${isPathDimmed ? 'opacity-30' : ''}`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <FileOutput className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
        {hasResolvedPaths && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-fuchsia-400/15 text-fuchsia-300 font-mono">
            {enabledCount}/{pathsToThis.length}
          </span>
        )}
      </div>
      <div className="mt-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-400/15 text-fuchsia-300 font-mono">
          {format}
        </span>
      </div>
      <FlowNodeHandles
        nodeId={id}
        inputHandleIds={data.inputHandleIds}
        inputClassName="!bg-fuchsia-400 !border-fuchsia-600"
        outputClassName="!bg-fuchsia-400 !border-fuchsia-600"
      />
    </div>
  );
});

OutputFlowNode.displayName = 'OutputFlowNode';
