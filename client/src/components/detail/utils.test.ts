import { describe, it, expect } from 'vitest';
import type { EditableFieldSpec, ParameterDefinition } from './types';
import {
  isRecord,
  inferParameterKind,
  normalizeParameterDefinitions,
  getFieldDefinition,
  getEffectiveFieldValue,
  areValuesEqual,
  formatValue,
  getEffectiveParameterValue,
  parseParameterInputValue,
  formatInputValue,
  normalizeMarquee,
  intersectsRect,
} from './utils';

// ── Helpers ──

function makeDef(overrides: Partial<ParameterDefinition> & { key: string }): ParameterDefinition {
  return {
    label: overrides.key,
    type: 'float',
    defaultValue: 0,
    ...overrides,
  };
}

function makeSpec(overrides?: Partial<EditableFieldSpec>): EditableFieldSpec {
  return {
    label: 'Test Field',
    candidates: ['candidate_a', 'candidate_b'],
    fallbackKey: 'fallback_key',
    type: 'float',
    defaultValue: 1.0,
    ...overrides,
  };
}

// ── isRecord ──

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord(42)).toBe(false);
    expect(isRecord('hello')).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

// ── inferParameterKind ──

describe('inferParameterKind', () => {
  it('infers bool from boolean values', () => {
    expect(inferParameterKind(true)).toBe('bool');
    expect(inferParameterKind(false)).toBe('bool');
  });

  it('infers int from integer numbers', () => {
    expect(inferParameterKind(0)).toBe('int');
    expect(inferParameterKind(42)).toBe('int');
    expect(inferParameterKind(-7)).toBe('int');
  });

  it('infers float from non-integer numbers', () => {
    expect(inferParameterKind(3.14)).toBe('float');
    expect(inferParameterKind(-0.5)).toBe('float');
  });

  it('infers color from arrays (not string)', () => {
    expect(inferParameterKind([255, 128, 0])).toBe('color');
    expect(inferParameterKind([])).toBe('color');
  });

  it('infers string from strings and other types', () => {
    expect(inferParameterKind('hello')).toBe('string');
    expect(inferParameterKind(null)).toBe('string');
    expect(inferParameterKind(undefined)).toBe('string');
    expect(inferParameterKind({ a: 1 })).toBe('string');
  });
});

// ── normalizeParameterDefinitions ──

describe('normalizeParameterDefinitions', () => {
  it('returns empty array for empty settings', () => {
    expect(normalizeParameterDefinitions({})).toEqual([]);
  });

  it('unwraps nested {parameters:{...}} format', () => {
    const settings = {
      parameters: {
        width: { type: 'int', default: 1920, label: 'Width' },
      },
    };
    const result = normalizeParameterDefinitions(settings);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('width');
    expect(result[0].type).toBe('int');
    expect(result[0].defaultValue).toBe(1920);
    expect(result[0].label).toBe('Width');
  });

  it('infers type from plain values (not {default:...} format)', () => {
    const settings = { brightness: 0.75, enabled: true, name: 'Main' };
    const result = normalizeParameterDefinitions(settings);
    expect(result).toHaveLength(3);

    const brightness = result.find((d) => d.key === 'brightness')!;
    expect(brightness.type).toBe('float');
    expect(brightness.defaultValue).toBe(0.75);
    expect(brightness.label).toBe('brightness');

    const enabled = result.find((d) => d.key === 'enabled')!;
    expect(enabled.type).toBe('bool');

    const name = result.find((d) => d.key === 'name')!;
    expect(name.type).toBe('string');
  });

  it('preserves min, max, and options from definition objects', () => {
    const settings = {
      quality: {
        type: 'int',
        default: 5,
        min: 1,
        max: 10,
        options: ['low', 'medium', 'high'],
        label: 'Quality',
      },
    };
    const result = normalizeParameterDefinitions(settings);
    expect(result[0].min).toBe(1);
    expect(result[0].max).toBe(10);
    expect(result[0].options).toEqual(['low', 'medium', 'high']);
  });

  it('falls back to inferParameterKind when type is not a recognized string', () => {
    const settings = {
      unknown: { type: 'weird', default: 3.14 },
    };
    const result = normalizeParameterDefinitions(settings);
    expect(result[0].type).toBe('float');
  });

  it('uses key as label when label is missing', () => {
    const settings = {
      speed: { type: 'float', default: 1.0 },
    };
    const result = normalizeParameterDefinitions(settings);
    expect(result[0].label).toBe('speed');
  });

  it('filters out non-string options', () => {
    const settings = {
      mode: { type: 'enum', default: 'a', options: ['a', 42, 'b', null] },
    };
    const result = normalizeParameterDefinitions(settings);
    expect(result[0].options).toEqual(['a', 'b']);
  });
});

// ── getFieldDefinition ──

describe('getFieldDefinition', () => {
  it('matches the first candidate key in definitions', () => {
    const definitions = [
      makeDef({ key: 'candidate_a', type: 'float', defaultValue: 10 }),
      makeDef({ key: 'candidate_b', type: 'float', defaultValue: 20 }),
    ];
    const spec = makeSpec({ candidates: ['candidate_a', 'candidate_b'] });
    const result = getFieldDefinition(definitions, spec);
    expect(result.key).toBe('candidate_a');
  });

  it('returns second candidate when first is absent', () => {
    const definitions = [
      makeDef({ key: 'candidate_b', type: 'float', defaultValue: 20 }),
    ];
    const spec = makeSpec({ candidates: ['candidate_a', 'candidate_b'] });
    const result = getFieldDefinition(definitions, spec);
    expect(result.key).toBe('candidate_b');
  });

  it('falls back to spec when no candidate matches', () => {
    const definitions = [makeDef({ key: 'unrelated' })];
    const spec = makeSpec({ fallbackKey: 'my_fallback', label: 'My Label', type: 'int', min: 0, max: 100, defaultValue: 50 });
    const result = getFieldDefinition(definitions, spec);
    expect(result.key).toBe('my_fallback');
    expect(result.label).toBe('My Label');
    expect(result.type).toBe('int');
    expect(result.min).toBe(0);
    expect(result.max).toBe(100);
    expect(result.defaultValue).toBe(50);
  });
});

// ── getEffectiveFieldValue ──

describe('getEffectiveFieldValue', () => {
  it('returns delta value via definition key', () => {
    const delta = { contrast: 2.5 };
    const definition = makeDef({ key: 'contrast', defaultValue: 1.0 });
    const spec = makeSpec({ candidates: ['contrast'] });
    expect(getEffectiveFieldValue(delta, definition, spec)).toBe(2.5);
  });

  it('returns delta value via candidate key', () => {
    const delta = { candidate_b: 7 };
    const definition = makeDef({ key: 'other_key', defaultValue: 0 });
    const spec = makeSpec({ candidates: ['candidate_a', 'candidate_b'] });
    expect(getEffectiveFieldValue(delta, definition, spec)).toBe(7);
  });

  it('falls back to definition defaultValue when delta has no matching numeric key', () => {
    const delta = {};
    const definition = makeDef({ key: 'contrast', defaultValue: 6500 });
    const spec = makeSpec();
    expect(getEffectiveFieldValue(delta, definition, spec)).toBe(6500);
  });

  it('falls back to spec defaultValue when definition default is not a number', () => {
    const delta = {};
    const definition = makeDef({ key: 'contrast', defaultValue: 'auto' });
    const spec = makeSpec({ defaultValue: 42 });
    expect(getEffectiveFieldValue(delta, definition, spec)).toBe(42);
  });

  it('ignores non-numeric delta values', () => {
    const delta = { contrast: 'high' };
    const definition = makeDef({ key: 'contrast', defaultValue: 5 });
    const spec = makeSpec({ candidates: ['contrast'] });
    expect(getEffectiveFieldValue(delta, definition, spec)).toBe(5);
  });
});

// ── areValuesEqual ──

describe('areValuesEqual', () => {
  it('compares primitives by strict equality', () => {
    expect(areValuesEqual(1, 1)).toBe(true);
    expect(areValuesEqual('a', 'a')).toBe(true);
    expect(areValuesEqual(true, true)).toBe(true);
    expect(areValuesEqual(1, 2)).toBe(false);
    expect(areValuesEqual('a', 'b')).toBe(false);
  });

  it('compares arrays element-wise', () => {
    expect(areValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(areValuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(areValuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('compares objects by key-value pairs', () => {
    expect(areValuesEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(areValuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(areValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('uses float epsilon for number comparison (0.0001)', () => {
    expect(areValuesEqual(1.00001, 1.00002)).toBe(true);
    expect(areValuesEqual(1.0, 1.0001)).toBe(true);
    expect(areValuesEqual(1.0, 1.001)).toBe(false);
  });

  it('handles null and undefined', () => {
    expect(areValuesEqual(null, null)).toBe(true);
    expect(areValuesEqual(undefined, undefined)).toBe(true);
    expect(areValuesEqual(null, undefined)).toBe(false);
  });

  it('handles nested arrays and objects', () => {
    expect(areValuesEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(areValuesEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
  });
});

// ── formatValue ──

describe('formatValue', () => {
  it('formats numbers as strings', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue(3.14)).toBe('3.14');
  });

  it('formats strings as-is', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('formats booleans as strings', () => {
    expect(formatValue(true)).toBe('true');
    expect(formatValue(false)).toBe('false');
  });

  it('formats arrays as JSON', () => {
    expect(formatValue([1, 2, 3])).toBe('[1,2,3]');
  });

  it('formats objects as JSON', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('returns empty string for null and undefined', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined)).toBe('');
  });
});

// ── getEffectiveParameterValue ──

describe('getEffectiveParameterValue', () => {
  it('returns delta override when key exists', () => {
    const delta = { brightness: 0.8 };
    const definition = makeDef({ key: 'brightness', defaultValue: 0.5 });
    expect(getEffectiveParameterValue(delta, definition)).toBe(0.8);
  });

  it('returns definition default when key is absent from delta', () => {
    const delta = {};
    const definition = makeDef({ key: 'brightness', defaultValue: 0.5 });
    expect(getEffectiveParameterValue(delta, definition)).toBe(0.5);
  });

  it('returns delta value even if it is falsy (0, false, null)', () => {
    expect(getEffectiveParameterValue({ v: 0 }, makeDef({ key: 'v', defaultValue: 5 }))).toBe(0);
    expect(getEffectiveParameterValue({ v: false }, makeDef({ key: 'v', defaultValue: true }))).toBe(false);
    expect(getEffectiveParameterValue({ v: null }, makeDef({ key: 'v', defaultValue: 'x' }))).toBe(null);
  });
});

// ── parseParameterInputValue ──

describe('parseParameterInputValue', () => {
  it('parses int type — valid integer', () => {
    expect(parseParameterInputValue('42', makeDef({ key: 'x', type: 'int' }))).toBe(42);
  });

  it('parses int type — returns null for NaN', () => {
    expect(parseParameterInputValue('abc', makeDef({ key: 'x', type: 'int' }))).toBeNull();
  });

  it('parses float type — valid float', () => {
    expect(parseParameterInputValue('3.14', makeDef({ key: 'x', type: 'float' }))).toBeCloseTo(3.14);
  });

  it('parses float type — returns null for NaN', () => {
    expect(parseParameterInputValue('not-a-number', makeDef({ key: 'x', type: 'float' }))).toBeNull();
  });

  it('parses color type — JSON array', () => {
    expect(parseParameterInputValue('[255, 128, 0]', makeDef({ key: 'x', type: 'color' }))).toEqual([255, 128, 0]);
  });

  it('parses color type — comma-separated values', () => {
    expect(parseParameterInputValue('255, 128, 0', makeDef({ key: 'x', type: 'color' }))).toEqual([255, 128, 0]);
  });

  it('parses color type — returns default for empty string', () => {
    const def = makeDef({ key: 'x', type: 'color', defaultValue: [0, 0, 0] });
    expect(parseParameterInputValue('', def)).toEqual([0, 0, 0]);
    expect(parseParameterInputValue('   ', def)).toEqual([0, 0, 0]);
  });

  it('parses color type — returns raw string for invalid input', () => {
    expect(parseParameterInputValue('red', makeDef({ key: 'x', type: 'color' }))).toBe('red');
  });

  it('returns rawValue unchanged for other types', () => {
    expect(parseParameterInputValue('hello', makeDef({ key: 'x', type: 'string' }))).toBe('hello');
    expect(parseParameterInputValue('yes', makeDef({ key: 'x', type: 'bool' }))).toBe('yes');
    expect(parseParameterInputValue('opt1', makeDef({ key: 'x', type: 'enum' }))).toBe('opt1');
  });
});

// ── formatInputValue ──

describe('formatInputValue', () => {
  it('formats color arrays as comma-separated string', () => {
    expect(formatInputValue([255, 128, 0], makeDef({ key: 'x', type: 'color' }))).toBe('255, 128, 0');
  });

  it('delegates to formatValue for non-color types', () => {
    expect(formatInputValue(42, makeDef({ key: 'x', type: 'int' }))).toBe('42');
    expect(formatInputValue('hello', makeDef({ key: 'x', type: 'string' }))).toBe('hello');
    expect(formatInputValue(null, makeDef({ key: 'x', type: 'string' }))).toBe('');
  });

  it('delegates to formatValue for color type when value is not an array', () => {
    expect(formatInputValue('red', makeDef({ key: 'x', type: 'color' }))).toBe('red');
  });
});

// ── normalizeMarquee ──

describe('normalizeMarquee', () => {
  it('normalizes positive dimensions (drag right/down)', () => {
    const result = normalizeMarquee({ x: 10, y: 20 }, { x: 50, y: 60 });
    expect(result).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });

  it('normalizes negative dimensions (drag left/up)', () => {
    const result = normalizeMarquee({ x: 50, y: 60 }, { x: 10, y: 20 });
    expect(result).toEqual({ x: 10, y: 20, width: 40, height: 40 });
  });

  it('handles zero-size marquee (same point)', () => {
    const result = normalizeMarquee({ x: 30, y: 30 }, { x: 30, y: 30 });
    expect(result).toEqual({ x: 30, y: 30, width: 0, height: 0 });
  });

  it('handles mixed directions (drag left but down)', () => {
    const result = normalizeMarquee({ x: 100, y: 10 }, { x: 20, y: 50 });
    expect(result).toEqual({ x: 20, y: 10, width: 80, height: 40 });
  });
});

// ── intersectsRect ──

describe('intersectsRect', () => {
  it('returns true for overlapping rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersectsRect(a, b)).toBe(true);
  });

  it('returns true when one rect contains the other', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    const inner = { x: 10, y: 10, width: 20, height: 20 };
    expect(intersectsRect(outer, inner)).toBe(true);
    expect(intersectsRect(inner, outer)).toBe(true);
  });

  it('returns false for non-overlapping rects (separated horizontally)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 0, width: 10, height: 10 };
    expect(intersectsRect(a, b)).toBe(false);
  });

  it('returns false for non-overlapping rects (separated vertically)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 0, y: 20, width: 10, height: 10 };
    expect(intersectsRect(a, b)).toBe(false);
  });

  it('returns false for edge-touching rects (not strictly overlapping)', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(intersectsRect(a, b)).toBe(false);
  });

  it('returns false for corner-touching rects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 10, width: 10, height: 10 };
    expect(intersectsRect(a, b)).toBe(false);
  });
});
