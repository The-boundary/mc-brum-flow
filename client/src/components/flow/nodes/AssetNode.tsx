import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Box } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

export const AssetNode = memo(({ data, id }: { data: { label: string; shotId: string; containerName: string }; id: string }) => {
  const selectShot = useFlowStore((s) => s.selectShot);
  const selectedShotId = useFlowStore((s) => s.selectedShotId);
  const isSelected = selectedShotId === data.shotId;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer transition-all ${
        isSelected
          ? 'border-brand bg-brand/10 shadow-[0_0_12px_rgba(90,207,217,0.2)]'
          : 'border-border bg-surface-200 hover:border-brand/50'
      }`}
      onClick={() => selectShot(data.shotId)}
    >
      <div className="flex items-center gap-2">
        <Box className="w-3.5 h-3.5 text-brand" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      {data.containerName && (
        <div className="text-[10px] text-fg-dim mt-0.5 truncate">{data.containerName}</div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-brand !border-brand-600" />
    </div>
  );
});

AssetNode.displayName = 'AssetNode';
