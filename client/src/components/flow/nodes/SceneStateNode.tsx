import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Palette } from 'lucide-react';

const COLOR_MAP: Record<string, string> = {
  amber: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  blue: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  teal: 'text-teal-400 border-teal-400/30 bg-teal-400/5',
  purple: 'text-purple-400 border-purple-400/30 bg-purple-400/5',
};

export const SceneStateNode = memo(({ data }: { data: { label: string; stateId: string; color: string; dimmed?: boolean } }) => {
  const colors = COLOR_MAP[data.color] ?? COLOR_MAP.teal;

  return (
    <div className={`rounded-lg border px-3 py-2 min-w-[140px] transition-all ${colors} ${data.dimmed ? 'opacity-35' : ''}`}>
      <div className="flex items-center gap-2">
        <Palette className="w-3.5 h-3.5" />
        <span className="text-xs font-medium truncate">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-teal-400 !border-teal-600" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-teal-400 !border-teal-600" />
    </div>
  );
});

SceneStateNode.displayName = 'SceneStateNode';
