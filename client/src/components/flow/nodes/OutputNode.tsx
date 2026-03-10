import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileOutput } from 'lucide-react';

export const OutputNode = memo(({ data }: { data: { label: string; shotId: string; format: string } }) => {
  return (
    <div className="rounded-lg border border-border bg-surface-200 px-3 py-2 min-w-[160px]">
      <div className="flex items-center gap-2">
        <FileOutput className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-fg-dim mt-0.5">{data.format}</div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-purple-400 !border-purple-600" />
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
