import { AlertTriangle } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import { EmptyPanel, NodeHeader, Row, Section } from './components';

export function CameraDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const cameras = useFlowStore((state) => state.cameras);
  const assignNodeCamera = useFlowStore((state) => state.assignNodeCamera);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);

  if (!node) {
    return <EmptyPanel />;
  }

  const camera = node.camera_id ? cameras.find((entry) => entry.id === node.camera_id) : null;

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={camera?.name ?? node.label} type="camera" />

      {camera && (
        <Section title="Camera Info">
          <div className="space-y-1.5 text-xs">
            <Row label="Name" value={camera.name} />
            <Row label="Max Handle" value={String(camera.max_handle)} />
            {camera.max_class && <Row label="Class" value={camera.max_class} />}
          </div>
        </Section>
      )}

      {!camera && node.camera_id && (
        <div className="flex items-center gap-2 rounded border border-red-400/30 bg-red-400/10 p-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs text-red-300">Camera has been removed from the scene</span>
        </div>
      )}

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Scene Camera">
        <select
          value={node.camera_id ?? ''}
          onChange={(event) => {
            if (event.target.value) {
              void assignNodeCamera(nodeId, event.target.value);
            }
          }}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        >
          <option value="">Select a scene camera</option>
          {cameras.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </Section>
    </div>
  );
}
