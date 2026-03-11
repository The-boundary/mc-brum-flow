import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Camera, AlertTriangle } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

interface CameraFlowData {
  label: string;
  camera_id?: string;
  isPathHighlighted?: boolean;
  isPathDimmed?: boolean;
  [key: string]: unknown;
}

export const CameraFlowNode = memo(({ id, data }: NodeProps & { data: CameraFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const cameras = useFlowStore((s) => s.cameras);
  const isSelected = selectedNodeId === id;
  const isPathHighlighted = data.isPathHighlighted === true;
  const isPathDimmed = data.isPathDimmed === true;

  const camera = data.camera_id ? cameras.find((c) => c.id === data.camera_id) : null;
  const isMissing = data.camera_id && !camera;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[150px] cursor-pointer transition-all ${
        isSelected
          ? 'border-emerald-400 bg-emerald-400/10 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
          : isPathHighlighted
          ? 'border-emerald-400/80 bg-emerald-400/10 shadow-[0_0_10px_rgba(52,211,153,0.18)]'
          : 'border-border bg-surface-200 hover:border-emerald-400/50'
      } ${isPathDimmed ? 'opacity-30' : ''}`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">
          {camera?.name ?? data.label}
        </span>
        {isMissing && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
      </div>
      {camera?.max_class && (
        <div className="mt-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 font-mono">
            {camera.max_class}
          </span>
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-emerald-400 !border-emerald-600"
      />
    </div>
  );
});

CameraFlowNode.displayName = 'CameraFlowNode';
