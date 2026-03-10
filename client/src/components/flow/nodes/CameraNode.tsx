import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Camera } from 'lucide-react';

export const CameraNode = memo(({ data }: { data: { label: string; cameraId: string; dimmed?: boolean } }) => {
  return (
    <div className={`rounded-lg border border-border bg-surface-200 px-3 py-2 min-w-[140px] transition-all ${data.dimmed ? 'opacity-35' : ''}`}>
      <div className="flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-amber-400 !border-amber-600" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-amber-400 !border-amber-600" />
    </div>
  );
});

CameraNode.displayName = 'CameraNode';
