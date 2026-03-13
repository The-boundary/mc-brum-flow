import {
  AlertTriangle,
  Camera,
  Contrast,
  FileOutput,
  FolderOpen,
  Gauge,
  Layers,
  RectangleHorizontal,
  Server,
  Sun,
} from 'lucide-react';
import type { NodeType } from '@shared/types';

export type ParameterKind = 'int' | 'float' | 'bool' | 'string' | 'enum' | 'color' | 'ref';

export const NODE_TYPE_LABELS: Record<NodeType, { label: string; color: string; icon: typeof Camera }> = {
  camera: { label: 'Camera', color: 'text-emerald-400', icon: Camera },
  group: { label: 'Group', color: 'text-orange-400', icon: FolderOpen },
  lightSetup: { label: 'Light Setup', color: 'text-amber-400', icon: Sun },
  toneMapping: { label: 'Tone Mapping', color: 'text-blue-400', icon: Contrast },
  layerSetup: { label: 'Layer Setup', color: 'text-cyan-400', icon: Layers },
  aspectRatio: { label: 'Aspect Ratio', color: 'text-teal-400', icon: RectangleHorizontal },
  stageRev: { label: 'Stage Rev', color: 'text-green-400', icon: Gauge },
  override: { label: 'Override', color: 'text-red-400', icon: AlertTriangle },
  deadline: { label: 'Deadline', color: 'text-purple-400', icon: Server },
  output: { label: 'Output', color: 'text-fuchsia-400', icon: FileOutput },
};

export interface ParameterDefinition {
  key: string;
  label: string;
  type: ParameterKind;
  defaultValue: unknown;
  min?: number;
  max?: number;
  options?: string[];
}

export interface ParameterGroupDefinition {
  category: string;
  label: string;
  definitions: ParameterDefinition[];
}

export interface EditableFieldSpec {
  label: string;
  candidates: string[];
  fallbackKey: string;
  type: 'int' | 'float';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const STAGE_REV_FIELDS: EditableFieldSpec[] = [
  {
    label: 'Longest Edge',
    candidates: ['longest_edge'],
    fallbackKey: 'longest_edge',
    type: 'int',
    min: 1,
    max: 12000,
    step: 100,
    defaultValue: 3000,
  },
];

export const TONE_MAPPING_FIELDS: EditableFieldSpec[] = [
  {
    label: 'Contrast',
    candidates: ['ContrastOperatorPlugin.colorMappingOperator_contrast', 'contrast'],
    fallbackKey: 'ContrastOperatorPlugin.colorMappingOperator_contrast',
    type: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    defaultValue: 1,
  },
  {
    label: 'Saturation',
    candidates: ['SaturationOperatorPlugin.colorMappingOperator_saturation', 'saturation'],
    fallbackKey: 'SaturationOperatorPlugin.colorMappingOperator_saturation',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.05,
    defaultValue: 0,
  },
  {
    label: 'White Balance',
    candidates: ['WhiteBalanceImprovedOperatorPlugin.colorMappingOperator_colorTemperature', 'whiteBalance'],
    fallbackKey: 'WhiteBalanceImprovedOperatorPlugin.colorMappingOperator_colorTemperature',
    type: 'float',
    min: 1000,
    max: 40000,
    step: 100,
    defaultValue: 6500,
  },
  {
    label: 'Green / Magenta Tint',
    candidates: ['GreenMagentaTintOperatorPlugin.colorMappingOperator_greenMagentaTint', 'greenMagentaTint'],
    fallbackKey: 'GreenMagentaTintOperatorPlugin.colorMappingOperator_greenMagentaTint',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
  },
  {
    label: 'Exposure',
    candidates: ['SimpleExposureOperatorPlugin.colorMappingOperator_simpleExposure', 'exposure'],
    fallbackKey: 'SimpleExposureOperatorPlugin.colorMappingOperator_simpleExposure',
    type: 'float',
    min: -10,
    max: 10,
    step: 0.05,
    defaultValue: 0,
  },
];

export const PARAMETER_GROUP_LABELS: Record<string, string> = {
  corona_renderer: 'Corona Renderer',
  tone_mapping: 'Tone Mapping',
  scene_output: 'Scene Output',
  environment: 'Environment',
  color_management: 'Color Management',
  gamma_color: 'Color Management',
  physical_camera: 'Physical Camera',
  free_camera: 'Free Camera',
  corona_camera_mod: 'Corona Camera Modifier',
  layers: 'Layers',
};

export const NODE_PARAMETER_GROUPS: Partial<Record<NodeType, string[]>> = {
  lightSetup: ['environment'],
  toneMapping: ['tone_mapping'],
  layerSetup: ['layers'],
  stageRev: ['scene_output', 'corona_renderer'],
  // Override uses the upstream node's parameter groups (resolved dynamically)
};
