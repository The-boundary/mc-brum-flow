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
  type LucideIcon,
} from 'lucide-react';
import type { NodeType } from '@shared/types';

export interface NodeTypeStyle {
  label: string;
  icon: LucideIcon;
  /** Tailwind text color class for the icon/badge text */
  textColor: string;
  /** Tailwind handle background class (with ! for React Flow override) */
  handleBg: string;
  /** Tailwind handle border class (with ! for React Flow override) */
  handleBorder: string;
  /** Tailwind badge background class */
  badgeBg: string;
  /** Tailwind border class when selected */
  borderSelected: string;
  /** Tailwind background class when selected */
  bgSelected: string;
  /** Tailwind shadow class when selected */
  shadowSelected: string;
  /** Tailwind border class on highlight (path traced) */
  borderHighlight: string;
  /** Tailwind bg class on highlight */
  bgHighlight: string;
  /** Tailwind shadow class on highlight */
  shadowHighlight: string;
  /** Tailwind hover border class (default state) */
  hoverBorder: string;
  /** Hex color for minimap node rendering */
  minimapColor: string;
}

export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeStyle> = {
  camera: {
    label: 'Camera',
    icon: Camera,
    textColor: 'text-emerald-400',
    handleBg: '!bg-emerald-400',
    handleBorder: '!border-emerald-600',
    badgeBg: 'bg-emerald-400/15',
    borderSelected: 'border-emerald-400',
    bgSelected: 'bg-emerald-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(52,211,153,0.25)]',
    borderHighlight: 'border-emerald-400/80',
    bgHighlight: 'bg-emerald-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(52,211,153,0.18)]',
    hoverBorder: 'hover:border-emerald-400/50',
    minimapColor: '#34d399',
  },
  group: {
    label: 'Group',
    icon: FolderOpen,
    textColor: 'text-orange-400',
    handleBg: '!bg-orange-400',
    handleBorder: '!border-orange-600',
    badgeBg: 'bg-orange-400/15',
    borderSelected: 'border-orange-400',
    bgSelected: 'bg-orange-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(251,146,60,0.25)]',
    borderHighlight: 'border-orange-400/80',
    bgHighlight: 'bg-orange-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(251,146,60,0.18)]',
    hoverBorder: 'hover:border-orange-400/50',
    minimapColor: '#fb923c',
  },
  lightSetup: {
    label: 'Light Setup',
    icon: Sun,
    textColor: 'text-amber-400',
    handleBg: '!bg-amber-400',
    handleBorder: '!border-amber-600',
    badgeBg: 'bg-amber-400/15',
    borderSelected: 'border-amber-400',
    bgSelected: 'bg-amber-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(251,191,36,0.25)]',
    borderHighlight: 'border-amber-400/80',
    bgHighlight: 'bg-amber-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(251,191,36,0.18)]',
    hoverBorder: 'hover:border-amber-400/50',
    minimapColor: '#fbbf24',
  },
  toneMapping: {
    label: 'Tone Mapping',
    icon: Contrast,
    textColor: 'text-blue-400',
    handleBg: '!bg-blue-400',
    handleBorder: '!border-blue-600',
    badgeBg: 'bg-blue-400/15',
    borderSelected: 'border-blue-400',
    bgSelected: 'bg-blue-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(96,165,250,0.25)]',
    borderHighlight: 'border-blue-400/80',
    bgHighlight: 'bg-blue-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(96,165,250,0.18)]',
    hoverBorder: 'hover:border-blue-400/50',
    minimapColor: '#60a5fa',
  },
  layerSetup: {
    label: 'Layer Setup',
    icon: Layers,
    textColor: 'text-cyan-400',
    handleBg: '!bg-cyan-400',
    handleBorder: '!border-cyan-600',
    badgeBg: 'bg-cyan-400/15',
    borderSelected: 'border-cyan-400',
    bgSelected: 'bg-cyan-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(34,211,238,0.25)]',
    borderHighlight: 'border-cyan-400/80',
    bgHighlight: 'bg-cyan-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(34,211,238,0.18)]',
    hoverBorder: 'hover:border-cyan-400/50',
    minimapColor: '#22d3ee',
  },
  aspectRatio: {
    label: 'Aspect Ratio',
    icon: RectangleHorizontal,
    textColor: 'text-teal-400',
    handleBg: '!bg-teal-400',
    handleBorder: '!border-teal-600',
    badgeBg: 'bg-teal-400/15',
    borderSelected: 'border-teal-400',
    bgSelected: 'bg-teal-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(45,212,191,0.25)]',
    borderHighlight: 'border-teal-400/80',
    bgHighlight: 'bg-teal-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(45,212,191,0.18)]',
    hoverBorder: 'hover:border-teal-400/50',
    minimapColor: '#2dd4bf',
  },
  stageRev: {
    label: 'Stage Rev',
    icon: Gauge,
    textColor: 'text-green-400',
    handleBg: '!bg-green-400',
    handleBorder: '!border-green-600',
    badgeBg: 'bg-green-400/15',
    borderSelected: 'border-green-400',
    bgSelected: 'bg-green-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(74,222,128,0.25)]',
    borderHighlight: 'border-green-400/80',
    bgHighlight: 'bg-green-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(74,222,128,0.18)]',
    hoverBorder: 'hover:border-green-400/50',
    minimapColor: '#4ade80',
  },
  override: {
    label: 'Override',
    icon: AlertTriangle,
    textColor: 'text-red-400',
    handleBg: '!bg-red-400',
    handleBorder: '!border-red-600',
    badgeBg: 'bg-red-400/15',
    borderSelected: 'border-red-400',
    bgSelected: 'bg-red-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(248,113,113,0.3)]',
    borderHighlight: 'border-red-400',
    bgHighlight: 'bg-red-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(248,113,113,0.2)]',
    hoverBorder: 'hover:border-red-400/70',
    minimapColor: '#f87171',
  },
  deadline: {
    label: 'Deadline',
    icon: Server,
    textColor: 'text-purple-400',
    handleBg: '!bg-purple-400',
    handleBorder: '!border-purple-600',
    badgeBg: 'bg-purple-400/15',
    borderSelected: 'border-purple-400',
    bgSelected: 'bg-purple-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(192,132,252,0.25)]',
    borderHighlight: 'border-purple-400/80',
    bgHighlight: 'bg-purple-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(192,132,252,0.18)]',
    hoverBorder: 'hover:border-purple-400/50',
    minimapColor: '#c084fc',
  },
  output: {
    label: 'Output',
    icon: FileOutput,
    textColor: 'text-fuchsia-400',
    handleBg: '!bg-fuchsia-400',
    handleBorder: '!border-fuchsia-600',
    badgeBg: 'bg-fuchsia-400/15',
    borderSelected: 'border-fuchsia-400',
    bgSelected: 'bg-fuchsia-400/10',
    shadowSelected: 'shadow-[0_0_12px_rgba(232,121,249,0.25)]',
    borderHighlight: 'border-fuchsia-400/80',
    bgHighlight: 'bg-fuchsia-400/10',
    shadowHighlight: 'shadow-[0_0_10px_rgba(232,121,249,0.18)]',
    hoverBorder: 'hover:border-fuchsia-400/50',
    minimapColor: '#e879f9',
  },
};

/** Get label for a node type */
export function getNodeTypeLabel(type: NodeType): string {
  return NODE_TYPE_REGISTRY[type]?.label ?? type;
}

/** Get minimap color for a node type */
export function getMiniMapNodeColor(type?: string | null): string {
  if (type && type in NODE_TYPE_REGISTRY) {
    return NODE_TYPE_REGISTRY[type as NodeType].minimapColor;
  }
  return 'hsl(185 63% 60%)';
}
