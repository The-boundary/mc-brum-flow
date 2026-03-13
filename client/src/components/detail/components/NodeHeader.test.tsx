import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeHeader } from './NodeHeader';
import { NODE_TYPE_LABELS } from '../types';
import type { NodeType } from '@shared/types';

describe('NodeHeader', () => {
  it('renders label text', () => {
    render(<NodeHeader label="My Camera" type="camera" />);
    expect(screen.getByText('My Camera')).toBeInTheDocument();
  });

  it('renders the type label from NODE_TYPE_LABELS', () => {
    render(<NodeHeader label="Shot 01" type="camera" />);
    expect(screen.getByText('Camera')).toBeInTheDocument();
  });

  it.each<[NodeType, string]>([
    ['camera', 'Camera'],
    ['group', 'Group'],
    ['lightSetup', 'Light Setup'],
  ])('renders correct type label for %s', (type, expectedLabel) => {
    render(<NodeHeader label="Test" type={type} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it.each<[NodeType, string]>([
    ['camera', 'text-emerald-400'],
    ['group', 'text-orange-400'],
    ['lightSetup', 'text-amber-400'],
    ['deadline', 'text-purple-400'],
    ['output', 'text-fuchsia-400'],
  ])('applies correct color class for %s', (type, expectedColor) => {
    render(<NodeHeader label="Test" type={type} />);
    const typeLabel = screen.getByText(NODE_TYPE_LABELS[type].label);
    expect(typeLabel.className).toContain(expectedColor);
  });

  it('renders icon element for camera type', () => {
    const { container } = render(<NodeHeader label="Test" type="camera" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.className.baseVal).toContain('h-4 w-4');
    expect(svg!.className.baseVal).toContain(NODE_TYPE_LABELS.camera.color);
  });
});
