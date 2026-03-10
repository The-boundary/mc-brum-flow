import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Camera } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

export const CameraNode = memo(({ data }: { data: { label: string; cameraId: string; dimmed?: boolean } }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectionKind = useFlowStore((s) => s.selectionKind);
  const selectionId = useFlowStore((s) => s.selectionId);
  const isSelected = selectionKind === 'camera' && selectionId === data.cameraId;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[140px] cursor-pointer transition-all ${
        isSelected
          ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
          : data.dimmed
          ? 'border-border/40 bg-surface-200/40 opacity-35'
          : 'border-border bg-surface-200 hover:border-amber-400/50'
      }`}
      onClick={(e) => { e.stopPropagation(); selectNode('camera', data.cameraId); }}
    >
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
