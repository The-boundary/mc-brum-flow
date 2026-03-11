import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sun, Contrast, Layers, RectangleHorizontal, Gauge, Server, type LucideIcon } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

const NODE_STYLES: Record<string, { color: string; borderSelected: string; bgSelected: string; shadow: string; hoverBorder: string; badgeBg: string; badgeText: string; handleBg: string; handleBorder: string; icon: LucideIcon; label: string }> = {
  lightSetup:  { color: 'amber',  borderSelected: 'border-amber-400', bgSelected: 'bg-amber-400/10', shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.25)]', hoverBorder: 'hover:border-amber-400/50', badgeBg: 'bg-amber-400/15', badgeText: 'text-amber-300', handleBg: '!bg-amber-400', handleBorder: '!border-amber-600', icon: Sun, label: 'Light Setup' },
  toneMapping: { color: 'blue',   borderSelected: 'border-blue-400', bgSelected: 'bg-blue-400/10', shadow: 'shadow-[0_0_12px_rgba(96,165,250,0.25)]', hoverBorder: 'hover:border-blue-400/50', badgeBg: 'bg-blue-400/15', badgeText: 'text-blue-300', handleBg: '!bg-blue-400', handleBorder: '!border-blue-600', icon: Contrast, label: 'Tone Mapping' },
  layerSetup:  { color: 'cyan',   borderSelected: 'border-cyan-400', bgSelected: 'bg-cyan-400/10', shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.25)]', hoverBorder: 'hover:border-cyan-400/50', badgeBg: 'bg-cyan-400/15', badgeText: 'text-cyan-300', handleBg: '!bg-cyan-400', handleBorder: '!border-cyan-600', icon: Layers, label: 'Layer Setup' },
  aspectRatio: { color: 'teal',   borderSelected: 'border-teal-400', bgSelected: 'bg-teal-400/10', shadow: 'shadow-[0_0_12px_rgba(45,212,191,0.25)]', hoverBorder: 'hover:border-teal-400/50', badgeBg: 'bg-teal-400/15', badgeText: 'text-teal-300', handleBg: '!bg-teal-400', handleBorder: '!border-teal-600', icon: RectangleHorizontal, label: 'Aspect Ratio' },
  stageRev:    { color: 'green',  borderSelected: 'border-green-400', bgSelected: 'bg-green-400/10', shadow: 'shadow-[0_0_12px_rgba(74,222,128,0.25)]', hoverBorder: 'hover:border-green-400/50', badgeBg: 'bg-green-400/15', badgeText: 'text-green-300', handleBg: '!bg-green-400', handleBorder: '!border-green-600', icon: Gauge, label: 'Stage Rev' },
  deadline:    { color: 'purple', borderSelected: 'border-purple-400', bgSelected: 'bg-purple-400/10', shadow: 'shadow-[0_0_12px_rgba(192,132,252,0.25)]', hoverBorder: 'hover:border-purple-400/50', badgeBg: 'bg-purple-400/15', badgeText: 'text-purple-300', handleBg: '!bg-purple-400', handleBorder: '!border-purple-600', icon: Server, label: 'Deadline' },
};

const NODE_HIGHLIGHT_STYLES: Record<string, { border: string; bg: string; shadow: string }> = {
  lightSetup:  { border: 'border-amber-400/80', bg: 'bg-amber-400/10', shadow: 'shadow-[0_0_10px_rgba(251,191,36,0.18)]' },
  toneMapping: { border: 'border-blue-400/80', bg: 'bg-blue-400/10', shadow: 'shadow-[0_0_10px_rgba(96,165,250,0.18)]' },
  layerSetup:  { border: 'border-cyan-400/80', bg: 'bg-cyan-400/10', shadow: 'shadow-[0_0_10px_rgba(34,211,238,0.18)]' },
  aspectRatio: { border: 'border-teal-400/80', bg: 'bg-teal-400/10', shadow: 'shadow-[0_0_10px_rgba(45,212,191,0.18)]' },
  stageRev:    { border: 'border-green-400/80', bg: 'bg-green-400/10', shadow: 'shadow-[0_0_10px_rgba(74,222,128,0.18)]' },
  deadline:    { border: 'border-purple-400/80', bg: 'bg-purple-400/10', shadow: 'shadow-[0_0_10px_rgba(192,132,252,0.18)]' },
};

interface ProcessingFlowData {
  label: string;
  nodeType: string;
  config_id?: string;
  isPathHighlighted?: boolean;
  isPathDimmed?: boolean;
  [key: string]: unknown;
}

export const ProcessingFlowNode = memo(({ id, data, type }: NodeProps & { data: ProcessingFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const isSelected = selectedNodeId === id;
  const isPathHighlighted = data.isPathHighlighted === true;
  const isPathDimmed = data.isPathDimmed === true;

  const nodeType = (type as string) || data.nodeType;
  const style = NODE_STYLES[nodeType] ?? NODE_STYLES.lightSetup;
  const highlightStyle = NODE_HIGHLIGHT_STYLES[nodeType] ?? NODE_HIGHLIGHT_STYLES.lightSetup;
  const Icon = style.icon;

  const config = data.config_id ? nodeConfigs.find((c) => c.id === data.config_id) : null;
  const deltaCount = config ? Object.keys(config.delta).length : 0;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[150px] cursor-pointer transition-all ${
        isSelected
          ? `${style.borderSelected} ${style.bgSelected} ${style.shadow}`
          : isPathHighlighted
          ? `${highlightStyle.border} ${highlightStyle.bg} ${highlightStyle.shadow}`
          : `border-border bg-surface-200 ${style.hoverBorder}`
      } ${isPathDimmed ? 'opacity-30' : ''}`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${style.badgeText} shrink-0`} />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${style.badgeBg} ${style.badgeText} font-mono`}>
          {style.label}
        </span>
        {deltaCount > 0 && (
          <span className="text-[9px] text-fg-dim">
            {deltaCount} override{deltaCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-2.5 !h-2.5 ${style.handleBg} ${style.handleBorder}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-2.5 !h-2.5 ${style.handleBg} ${style.handleBorder}`}
      />
    </div>
  );
});

ProcessingFlowNode.displayName = 'ProcessingFlowNode';
