import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { FolderOpen, Eye, EyeOff } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import { FlowNodeHandles } from '../FlowNodeHandles';

interface GroupFlowData {
  label: string;
  hide_previous?: boolean;
  isPathHighlighted?: boolean;
  isPathDimmed?: boolean;
  inputHandleIds?: string[];
  outputHandleIds?: string[];
  [key: string]: unknown;
}

export const GroupFlowNode = memo(({ id, data }: NodeProps & { data: GroupFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const toggleHidePrevious = useFlowStore((s) => s.toggleHidePrevious);
  const flowEdges = useFlowStore((s) => s.flowEdges);
  const isSelected = selectedNodeId === id;
  const isPathHighlighted = data.isPathHighlighted === true;
  const isPathDimmed = data.isPathDimmed === true;

  // Count incoming connections
  const incomingCount = flowEdges.filter((e) => e.target === id).length;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[150px] cursor-pointer transition-all ${
        isSelected
          ? 'border-orange-400 bg-orange-400/10 shadow-[0_0_12px_rgba(251,146,60,0.25)]'
          : isPathHighlighted
          ? 'border-orange-400/80 bg-orange-400/10 shadow-[0_0_10px_rgba(251,146,60,0.18)]'
          : 'border-border bg-surface-200 hover:border-orange-400/50'
      } ${isPathDimmed ? 'opacity-30' : ''}`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <FolderOpen className="w-3.5 h-3.5 text-orange-400 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
        {incomingCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-400/15 text-orange-300 font-mono ml-auto">
            {incomingCount}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 mt-1">
        <button
          className="p-0.5 rounded hover:bg-surface-300 transition-colors"
          onClick={(e) => { e.stopPropagation(); toggleHidePrevious(id); }}
          title={data.hide_previous ? 'Show previous nodes' : 'Hide previous nodes'}
        >
          {data.hide_previous
            ? <EyeOff className="w-3 h-3 text-fg-dim" />
            : <Eye className="w-3 h-3 text-fg-dim" />
          }
        </button>
      </div>
      <FlowNodeHandles
        nodeId={id}
        inputHandleIds={data.inputHandleIds}
        outputHandleIds={data.outputHandleIds}
        inputClassName="!bg-orange-400 !border-orange-600"
        outputClassName="!bg-orange-400 !border-orange-600"
      />
    </div>
  );
});

GroupFlowNode.displayName = 'GroupFlowNode';
