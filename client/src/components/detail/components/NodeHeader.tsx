import type { NodeType } from '@shared/types';
import { NODE_TYPE_LABELS } from '../types';

export function NodeHeader({ label, type }: { label: string; type: NodeType }) {
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${meta.color}`} />
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      </div>
      <div className="mt-0.5">
        <span className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</span>
      </div>
    </div>
  );
}
