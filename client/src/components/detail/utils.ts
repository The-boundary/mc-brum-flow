import type { EditableFieldSpec, MarqueeRect, ParameterDefinition, ParameterKind } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function inferParameterKind(value: unknown): ParameterKind {
  if (Array.isArray(value)) return 'color';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

export function normalizeParameterDefinitions(settings: Record<string, unknown>): ParameterDefinition[] {
  const source = isRecord(settings.parameters) ? settings.parameters : settings;

  return Object.entries(source).map(([key, rawValue]) => {
    if (isRecord(rawValue) && 'default' in rawValue) {
      const typeValue = typeof rawValue.type === 'string' ? rawValue.type : null;
      const normalizedType: ParameterKind =
        typeValue === 'int'
        || typeValue === 'float'
        || typeValue === 'bool'
        || typeValue === 'string'
        || typeValue === 'enum'
        || typeValue === 'color'
        || typeValue === 'ref'
          ? typeValue
          : inferParameterKind(rawValue.default);

      return {
        key,
        label: typeof rawValue.label === 'string' ? rawValue.label : key,
        type: normalizedType,
        defaultValue: rawValue.default,
        min: typeof rawValue.min === 'number' ? rawValue.min : undefined,
        max: typeof rawValue.max === 'number' ? rawValue.max : undefined,
        options: Array.isArray(rawValue.options)
          ? rawValue.options.filter((option): option is string => typeof option === 'string')
          : undefined,
      };
    }

    return {
      key,
      label: key,
      type: inferParameterKind(rawValue),
      defaultValue: rawValue,
    };
  });
}

export function getFieldDefinition(definitions: ParameterDefinition[], spec: EditableFieldSpec): ParameterDefinition {
  const definition = definitions.find((entry) => spec.candidates.includes(entry.key));
  if (definition) return definition;

  return {
    key: spec.fallbackKey,
    label: spec.label,
    type: spec.type,
    defaultValue: spec.defaultValue,
    min: spec.min,
    max: spec.max,
  };
}

export function getEffectiveFieldValue(
  delta: Record<string, unknown>,
  definition: ParameterDefinition,
  spec: EditableFieldSpec
): number {
  for (const key of [definition.key, ...spec.candidates]) {
    const value = delta[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return typeof definition.defaultValue === 'number' ? definition.defaultValue : spec.defaultValue;
}

export function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => areValuesEqual(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 0.0001;
  }

  return left === right;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value) || isRecord(value)) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

export function getEffectiveParameterValue(delta: Record<string, unknown>, definition: ParameterDefinition): unknown {
  return Object.prototype.hasOwnProperty.call(delta, definition.key)
    ? delta[definition.key]
    : definition.defaultValue;
}

export function parseParameterInputValue(rawValue: string, definition: ParameterDefinition): unknown | null {
  if (definition.type === 'int') {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (definition.type === 'float') {
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (definition.type === 'color') {
    const trimmed = rawValue.trim();
    if (!trimmed) return definition.defaultValue;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to comma-separated RGB parsing.
    }

    const channelValues = trimmed
      .split(',')
      .map((value) => Number.parseFloat(value.trim()));
    if (channelValues.length === 3 && channelValues.every((value) => Number.isFinite(value))) {
      return channelValues;
    }

    return trimmed;
  }

  return rawValue;
}

export function formatInputValue(value: unknown, definition: ParameterDefinition): string {
  if (definition.type === 'color' && Array.isArray(value)) {
    return value.join(', ');
  }

  return formatValue(value);
}

export function normalizeMarquee(start: { x: number; y: number }, current: { x: number; y: number }): MarqueeRect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

export function intersectsRect(a: MarqueeRect, b: MarqueeRect) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}
