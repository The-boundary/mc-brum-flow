import type { NodeTypes } from '@xyflow/react';
import { CameraFlowNode } from './CameraFlowNode';
import { GroupFlowNode } from './GroupFlowNode';
import { ProcessingFlowNode } from './ProcessingFlowNode';
import { OverrideFlowNode } from './OverrideFlowNode';
import { OutputFlowNode } from './OutputFlowNode';

export const nodeTypes: NodeTypes = {
  camera: CameraFlowNode,
  group: GroupFlowNode,
  lightSetup: ProcessingFlowNode,
  toneMapping: ProcessingFlowNode,
  layerSetup: ProcessingFlowNode,
  aspectRatio: ProcessingFlowNode,
  stageRev: ProcessingFlowNode,
  deadline: ProcessingFlowNode,
  override: OverrideFlowNode,
  output: OutputFlowNode,
};
