import { useFlowStore } from '@/stores/flowStore';
import { EmptyPanel } from './components';
import { CameraDetail } from './CameraDetail';
import { GroupDetail } from './GroupDetail';
import { OutputDetail } from './OutputDetail';
import { ProcessingDetail } from './ProcessingDetail';

export function DetailPanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const flowNodes = useFlowStore((state) => state.flowNodes);

  if (!selectedNodeId) {
    return <EmptyPanel />;
  }

  // Handle split output virtual nodes: "realId__split__index"
  const splitMatch = selectedNodeId.match(/^(.+)__split__(\d+)$/);
  const realNodeId = splitMatch ? splitMatch[1] : selectedNodeId;
  const splitIndex = splitMatch ? Number.parseInt(splitMatch[2], 10) : null;

  const node = flowNodes.find((entry) => entry.id === realNodeId);
  if (!node) {
    return <EmptyPanel />;
  }

  switch (node.type) {
    case 'camera':
      return <CameraDetail nodeId={node.id} />;
    case 'group':
      return <GroupDetail nodeId={node.id} />;
    case 'output':
      return <OutputDetail nodeId={node.id} splitIndex={splitIndex} />;
    default:
      return <ProcessingDetail nodeId={node.id} />;
  }
}
