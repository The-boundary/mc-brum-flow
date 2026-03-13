import type { NodeType } from '@shared/types';
import { useFlowStore } from '@/stores/flowStore';
import { NODE_TYPE_LABELS } from '../types';

export function NodeRef({ nodeId, label, type }: { nodeId: string; label: string; type: NodeType }) {
  const selectNode = useFlowStore((state) => state.selectNode);
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => selectNode(nodeId)}
      className="flex w-full items-center gap-1.5 py-0.5 text-left text-xs text-fg-muted transition-colors hover:text-brand"
    >
      <Icon className={`h-3 w-3 ${meta.color}`} />
      {label}
    </button>
  );
}
