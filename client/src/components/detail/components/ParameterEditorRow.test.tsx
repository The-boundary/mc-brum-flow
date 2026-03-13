import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParameterEditorRow } from './ParameterEditorRow';
import type { ParameterDefinition } from '../types';

function intDef(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return { key: 'width', label: 'Width', type: 'int', defaultValue: 1920, min: 1, max: 7680, ...overrides };
}

function floatDef(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return { key: 'contrast', label: 'Contrast', type: 'float', defaultValue: 1.0, min: 0, max: 10, ...overrides };
}

function boolDef(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return { key: 'use_gi', label: 'Use GI', type: 'bool', defaultValue: true, ...overrides };
}

function enumDef(overrides: Partial<ParameterDefinition> = {}): ParameterDefinition {
  return { key: 'mode', label: 'Mode', type: 'enum', defaultValue: 'fast', options: ['fast', 'quality', 'draft'], ...overrides };
}

describe('ParameterEditorRow', () => {
  it('renders label and key', () => {
    render(<ParameterEditorRow definition={intDef()} value={1920} isOverridden={false} onChange={vi.fn()} />);
    expect(screen.getByText('Width')).toBeInTheDocument();
    expect(screen.getByText('width')).toBeInTheDocument();
  });

  it('shows "Override" indicator when isOverridden is true', () => {
    render(<ParameterEditorRow definition={intDef()} value={2000} isOverridden={true} onChange={vi.fn()} />);
    expect(screen.getByText('Override')).toBeInTheDocument();
  });

  it('shows "Default" indicator when isOverridden is false', () => {
    render(<ParameterEditorRow definition={intDef()} value={1920} isOverridden={false} onChange={vi.fn()} />);
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('number input shows value for int type', () => {
    render(<ParameterEditorRow definition={intDef()} value={3840} isOverridden={false} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3840');
  });

  it('number input shows value for float type', () => {
    render(<ParameterEditorRow definition={floatDef()} value={2.5} isOverridden={false} onChange={vi.fn()} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('2.5');
  });

  it('changing number input calls onChange with parsed int', () => {
    const onChange = vi.fn();
    render(<ParameterEditorRow definition={intDef()} value={1920} isOverridden={false} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '2560' } });
    expect(onChange).toHaveBeenCalledWith(2560);
  });

  it('changing number input calls onChange with parsed float', () => {
    const onChange = vi.fn();
    render(<ParameterEditorRow definition={floatDef()} value={1.0} isOverridden={false} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '3.14' } });
    expect(onChange).toHaveBeenCalledWith(3.14);
  });

  it('bool toggle renders and shows Enabled when true', () => {
    render(<ParameterEditorRow definition={boolDef()} value={true} isOverridden={false} onChange={vi.fn()} />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('bool toggle renders and shows Disabled when false', () => {
    render(<ParameterEditorRow definition={boolDef()} value={false} isOverridden={false} onChange={vi.fn()} />);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('bool toggle calls onChange with inverted value on click', () => {
    const onChange = vi.fn();
    render(<ParameterEditorRow definition={boolDef()} value={true} isOverridden={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('enum dropdown renders options from definition.options', () => {
    render(<ParameterEditorRow definition={enumDef()} value="fast" isOverridden={false} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toBe('fast');
    expect(options[1].textContent).toBe('quality');
    expect(options[2].textContent).toBe('draft');
  });

  it('enum dropdown calls onChange with selected value', () => {
    const onChange = vi.fn();
    render(<ParameterEditorRow definition={enumDef()} value="fast" isOverridden={false} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quality' } });
    expect(onChange).toHaveBeenCalledWith('quality');
  });

  it('shows type and default value in footer', () => {
    render(<ParameterEditorRow definition={intDef()} value={1920} isOverridden={false} onChange={vi.fn()} />);
    expect(screen.getByText('Type: int')).toBeInTheDocument();
    expect(screen.getByText('Default: 1920')).toBeInTheDocument();
  });
});
