import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Palette } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

const COLOR_MAP: Record<string, string> = {
  amber: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
  blue: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
  teal: 'text-teal-400 border-teal-400/30 bg-teal-400/5',
  purple: 'text-purple-400 border-purple-400/30 bg-purple-400/5',
};

const SELECTED_COLOR_MAP: Record<string, string> = {
  amber: 'border-amber-400 bg-amber-400/15 shadow-[0_0_12px_rgba(251,191,36,0.2)]',
  blue: 'border-blue-400 bg-blue-400/15 shadow-[0_0_12px_rgba(96,165,250,0.2)]',
  teal: 'border-teal-400 bg-teal-400/15 shadow-[0_0_12px_rgba(45,212,191,0.2)]',
  purple: 'border-purple-400 bg-purple-400/15 shadow-[0_0_12px_rgba(192,132,252,0.2)]',
};

export const SceneStateNode = memo(({ data }: { data: { label: string; stateId: string; color: string; dimmed?: boolean } }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectionKind = useFlowStore((s) => s.selectionKind);
  const selectionId = useFlowStore((s) => s.selectionId);
  const isSelected = selectionKind === 'sceneState' && selectionId === data.stateId;

  const colors = COLOR_MAP[data.color] ?? COLOR_MAP.teal;
  const selectedColors = SELECTED_COLOR_MAP[data.color] ?? SELECTED_COLOR_MAP.teal;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[140px] cursor-pointer transition-all ${
        isSelected
          ? selectedColors
          : data.dimmed
          ? `${colors} opacity-35`
          : `${colors} hover:brightness-125`
      }`}
      onClick={(e) => { e.stopPropagation(); selectNode('sceneState', data.stateId); }}
    >
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
