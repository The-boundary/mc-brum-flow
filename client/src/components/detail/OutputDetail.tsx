import { useEffect, useMemo, useRef, useState } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import type { MarqueeRect } from './types';
import { intersectsRect, normalizeMarquee } from './utils';
import { EmptyPanel, NodeHeader, Section } from './components';

const OUTPUT_FORMATS = ['JPG', 'PNG', 'EXR', 'CXR'] as const;

export function OutputDetail({ nodeId, splitIndex }: { nodeId: string; splitIndex?: number | null }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const nodeConfigs = useFlowStore((state) => state.nodeConfigs);
  const resolvedPaths = useFlowStore((state) => state.resolvedPaths);
  const setResolvedPathEnabled = useFlowStore((state) => state.setResolvedPathEnabled);
  const setOutputPathsEnabled = useFlowStore((state) => state.setOutputPathsEnabled);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);
  const createNodeConfig = useFlowStore((state) => state.createNodeConfig);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const assignNodeConfig = useFlowStore((state) => state.assignNodeConfig);

  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const [selectedPathKeys, setSelectedPathKeys] = useState<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const config = node?.config_id ? nodeConfigs.find((entry) => entry.id === node.config_id) ?? null : null;
  const format = (config?.delta?.format as string) ?? 'EXR';

  const handleFormatChange = async (nextFormat: string) => {
    if (nextFormat === format) return;
    if (config) {
      await updateNodeConfig(config.id, {
        delta: { ...(config.delta ?? {}), format: nextFormat },
      });
    } else {
      const created = await createNodeConfig('output', node?.label ?? 'Output', { format: nextFormat });
      if (created) {
        await assignNodeConfig(nodeId, created.id);
      }
    }
  };

  const allPathsToThis = useMemo(
    () => resolvedPaths.filter((path) => path.outputNodeId === nodeId),
    [nodeId, resolvedPaths]
  );
  const pathsToThis = splitIndex !== null && splitIndex !== undefined
    ? allPathsToThis.slice(splitIndex, splitIndex + 1)
    : allPathsToThis;
  const enabledCount = pathsToThis.filter((path) => path.enabled).length;
  const selectedCount = selectedPathKeys.size;

  useEffect(() => {
    setSelectedPathKeys(new Set());
    setMarqueeRect(null);
  }, [nodeId]);

  useEffect(() => {
    setSelectedPathKeys((previous) => {
      const next = new Set([...previous].filter((pathKey) => pathsToThis.some((path) => path.pathKey === pathKey)));
      if (next.size !== previous.size) {
        return next;
      }

      for (const pathKey of previous) {
        if (!next.has(pathKey)) {
          return next;
        }
      }

      return previous;
    });
  }, [pathsToThis]);

  if (!node) {
    return <EmptyPanel />;
  }

  const updateMarqueeSelection = (currentPoint: { x: number; y: number }) => {
    if (!listRef.current || !dragOriginRef.current) {
      return;
    }

    const nextRect = normalizeMarquee(dragOriginRef.current, currentPoint);
    setMarqueeRect(nextRect);

    const containerRect = listRef.current.getBoundingClientRect();
    const nextSelection = new Set<string>();

    for (const path of pathsToThis) {
      const item = itemRefs.current[path.pathKey];
      if (!item) {
        continue;
      }

      const itemRect = item.getBoundingClientRect();
      const relativeRect: MarqueeRect = {
        x: itemRect.left - containerRect.left,
        y: itemRect.top - containerRect.top,
        width: itemRect.width,
        height: itemRect.height,
      };

      if (intersectsRect(nextRect, relativeRect)) {
        nextSelection.add(path.pathKey);
      }
    }

    setSelectedPathKeys(nextSelection);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !listRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-toggle-button="true"]')) {
      return;
    }

    event.preventDefault();
    const rect = listRef.current.getBoundingClientRect();
    dragOriginRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    draggedRef.current = false;
    setMarqueeRect({
      x: dragOriginRef.current.x,
      y: dragOriginRef.current.y,
      width: 0,
      height: 0,
    });
    listRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current || !listRef.current) {
      return;
    }

    const rect = listRef.current.getBoundingClientRect();
    const currentPoint = {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
    draggedRef.current = true;
    updateMarqueeSelection(currentPoint);
  };

  const clearMarqueeState = (pointerId?: number) => {
    if (listRef.current && pointerId !== undefined && listRef.current.hasPointerCapture(pointerId)) {
      listRef.current.releasePointerCapture(pointerId);
    }
    dragOriginRef.current = null;
    draggedRef.current = false;
    setMarqueeRect(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (!draggedRef.current) {
      const row = target.closest<HTMLElement>('[data-path-key]');
      if (row?.dataset.pathKey) {
        setSelectedPathKeys(new Set([row.dataset.pathKey]));
      }
    }

    clearMarqueeState(event.pointerId);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    clearMarqueeState(event.pointerId);
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (selectedPathKeys.size === 0) {
      return;
    }

    await setOutputPathsEnabled(nodeId, [...selectedPathKeys], enabled);
  };

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="output" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Resolved Paths">
        <div className="flex items-center justify-between gap-3 text-xs text-fg-dim">
          <span>
            {enabledCount} / {pathsToThis.length} active
          </span>
          <span>{selectedCount} selected</span>
        </div>
      </Section>

      <Section title="Output Format">
        <div className="grid grid-cols-4 gap-2">
          {OUTPUT_FORMATS.map((fmt) => {
            const isActive = format === fmt;
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => { void handleFormatChange(fmt); }}
                className={`rounded border px-2 py-1.5 text-xs font-mono transition ${
                  isActive
                    ? 'border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-300'
                    : 'border-border bg-surface-300 text-foreground hover:bg-surface-400'
                }`}
              >
                {fmt}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`Output Paths (${pathsToThis.length})`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleBulkToggle(true);
              }}
              disabled={selectedCount === 0}
              className="rounded border border-border bg-surface-300 px-2 py-1 text-[10px] text-foreground hover:bg-surface-400 disabled:opacity-40 disabled:hover:bg-surface-300"
            >
              Enable Selected
            </button>
            <button
              type="button"
              onClick={() => {
                void handleBulkToggle(false);
              }}
              disabled={selectedCount === 0}
              className="rounded border border-border bg-surface-300 px-2 py-1 text-[10px] text-foreground hover:bg-surface-400 disabled:opacity-40 disabled:hover:bg-surface-300"
            >
              Disable Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedPathKeys(new Set())}
              disabled={selectedCount === 0}
              className="rounded px-2 py-1 text-[10px] text-fg-dim hover:text-foreground disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          <div className="text-[10px] text-fg-dim">
            Drag across the list to marquee-select multiple outputs.
          </div>

          <div
            ref={listRef}
            className="relative space-y-1.5 rounded border border-border bg-surface-200/40 p-2 select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {pathsToThis.map((path) => {
              const isSelected = selectedPathKeys.has(path.pathKey);

              return (
                <div
                  key={path.pathKey}
                  ref={(element) => {
                    itemRefs.current[path.pathKey] = element;
                  }}
                  data-path-key={path.pathKey}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition ${
                    isSelected
                      ? 'border-brand bg-brand/10'
                      : path.enabled
                        ? 'border-border bg-surface-300 hover:bg-surface-400'
                        : 'border-border/50 bg-surface-300/50 text-fg-dim hover:bg-surface-400/60'
                  }`}
                >
                  <button
                    type="button"
                    data-toggle-button="true"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void setResolvedPathEnabled(path.pathKey, nodeId, !path.enabled);
                    }}
                    className="shrink-0"
                  >
                    {path.enabled ? (
                      <ToggleRight className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 shrink-0 text-fg-dim" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10px]">{path.filename}</div>
                    <div className="truncate text-[10px] text-fg-dim">{path.cameraName || '—'}</div>
                  </div>
                </div>
              );
            })}

            {marqueeRect && (
              <div
                className="pointer-events-none absolute border border-brand bg-brand/10"
                style={{
                  left: marqueeRect.x,
                  top: marqueeRect.y,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}
          </div>
        </div>

        {pathsToThis.length === 0 && (
          <div className="text-[10px] text-fg-dim">No paths reach this output.</div>
        )}
      </Section>
    </div>
  );
}
