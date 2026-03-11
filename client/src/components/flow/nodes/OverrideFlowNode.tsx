import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import { FlowNodeHandles } from '../FlowNodeHandles';

interface OverrideFlowData {
  label: string;
  config_id?: string;
  isPathHighlighted?: boolean;
  isPathDimmed?: boolean;
  inputHandleIds?: string[];
  outputHandleIds?: string[];
  [key: string]: unknown;
}

export const OverrideFlowNode = memo(({ id, data }: NodeProps & { data: OverrideFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const isSelected = selectedNodeId === id;
  const isPathHighlighted = data.isPathHighlighted === true;
  const isPathDimmed = data.isPathDimmed === true;

  const config = data.config_id ? nodeConfigs.find((c) => c.id === data.config_id) : null;
  const deltaCount = config ? Object.keys(config.delta).length : 0;

  return (
    <div
      className={`rounded-lg border-2 px-3 py-2 min-w-[150px] cursor-pointer transition-all ${
        isSelected
          ? 'border-red-400 bg-red-400/10 shadow-[0_0_12px_rgba(248,113,113,0.3)]'
          : isPathHighlighted
          ? 'border-red-400 bg-red-400/10 shadow-[0_0_10px_rgba(248,113,113,0.2)]'
          : 'border-red-500/50 bg-red-950/20 hover:border-red-400/70'
      } ${isPathDimmed ? 'opacity-30' : ''}`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-400/15 text-red-300 font-mono uppercase font-bold">
          Override
        </span>
        {deltaCount > 0 && (
          <span className="text-[9px] text-fg-dim">
            {deltaCount} field{deltaCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <FlowNodeHandles
        nodeId={id}
        inputHandleIds={data.inputHandleIds}
        outputHandleIds={data.outputHandleIds}
        inputClassName="!bg-red-400 !border-red-600"
        outputClassName="!bg-red-400 !border-red-600"
      />
    </div>
  );
});

OverrideFlowNode.displayName = 'OverrideFlowNode';
