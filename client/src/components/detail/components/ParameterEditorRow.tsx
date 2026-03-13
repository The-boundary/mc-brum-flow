import { ToggleLeft, ToggleRight } from 'lucide-react';
import type { ParameterDefinition } from '../types';
import { formatInputValue, formatValue, parseParameterInputValue } from '../utils';

export function ParameterEditorRow({
  definition,
  value,
  isOverridden,
  onChange,
}: {
  definition: ParameterDefinition;
  value: unknown;
  isOverridden: boolean;
  onChange: (nextValue: unknown) => void;
}) {
  return (
    <div className="space-y-1.5 rounded border border-border/40 bg-surface-300/40 p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-foreground">{definition.label}</div>
          <div className="truncate font-mono text-[10px] text-fg-dim">{definition.key}</div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${isOverridden ? 'bg-brand/15 text-brand' : 'bg-surface-200 text-fg-dim'}`}>
          {isOverridden ? 'Override' : 'Default'}
        </span>
      </div>

      {(definition.type === 'int' || definition.type === 'float') && (
        <input
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.type === 'int' ? 1 : 0.01}
          value={typeof value === 'number' ? value : formatInputValue(value, definition)}
          onChange={(event) => {
            const nextValue = parseParameterInputValue(event.target.value, definition);
            if (nextValue !== null) {
              onChange(nextValue);
            }
          }}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      )}

      {definition.type === 'bool' && (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="flex items-center gap-2 rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground hover:bg-surface-400"
        >
          {value ? (
            <ToggleRight className="h-4 w-4 text-emerald-400" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-fg-dim" />
          )}
          <span>{value ? 'Enabled' : 'Disabled'}</span>
        </button>
      )}

      {definition.type === 'enum' && (
        <select
          value={formatInputValue(value, definition)}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        >
          {(definition.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {(definition.type === 'string' || definition.type === 'ref' || definition.type === 'color') && (
        <input
          type="text"
          value={formatInputValue(value, definition)}
          onChange={(event) => {
            const nextValue = parseParameterInputValue(event.target.value, definition);
            if (nextValue !== null) {
              onChange(nextValue);
            }
          }}
          placeholder={definition.type === 'color' ? '255, 255, 255' : ''}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      )}

      <div className="flex items-center justify-between gap-3 text-[10px] text-fg-dim">
        <span>Type: {definition.type}</span>
        <span className="truncate">Default: {formatValue(definition.defaultValue)}</span>
      </div>
    </div>
  );
}
