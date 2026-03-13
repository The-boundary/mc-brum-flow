import { Eye, EyeOff } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import { EmptyPanel, NodeHeader, NodeRef, Section } from './components';

export function GroupDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const flowEdges = useFlowStore((state) => state.flowEdges);
  const flowNodes = useFlowStore((state) => state.flowNodes);
  const resolvedPaths = useFlowStore((state) => state.resolvedPaths);
  const toggleHidePrevious = useFlowStore((state) => state.toggleHidePrevious);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);

  if (!node) {
    return <EmptyPanel />;
  }

  const incomingNodes = flowEdges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => flowNodes.find((entry) => entry.id === edge.source))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const pathsThrough = resolvedPaths.filter((path) => path.nodeIds.includes(nodeId));

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="group" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Visibility">
        <button
          type="button"
          onClick={() => toggleHidePrevious(nodeId)}
          className="flex w-full items-center gap-2 rounded border border-border bg-surface-300 px-2 py-1.5 text-xs transition hover:bg-surface-400"
        >
          {node.hide_previous ? (
            <>
              <EyeOff className="h-3.5 w-3.5 text-fg-dim" />
              <span>Previous nodes hidden</span>
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 text-fg-dim" />
              <span>Previous nodes visible</span>
            </>
          )}
        </button>
      </Section>

      <Section title={`Inputs (${incomingNodes.length})`}>
        {incomingNodes.length === 0 && <span className="text-[10px] text-fg-dim">No inputs connected</span>}
        {incomingNodes.map((entry) => (
          <NodeRef key={entry.id} nodeId={entry.id} label={entry.label} type={entry.type} />
        ))}
      </Section>

      <Section title={`Paths through (${pathsThrough.length})`}>
        {pathsThrough.length === 0 && <span className="text-[10px] text-fg-dim">No paths through this group</span>}
        {pathsThrough.slice(0, 10).map((path) => (
          <div key={path.pathKey} className="truncate py-0.5 font-mono text-[10px] text-fg-muted">
            {path.filename}
          </div>
        ))}
        {pathsThrough.length > 10 && (
          <div className="text-[10px] text-fg-dim">+{pathsThrough.length - 10} more</div>
        )}
      </Section>
    </div>
  );
}
