import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import {
  Workflow, List, PanelRightOpen, PanelRightClose, Loader2,
  Plus, Minus, LayoutGrid, MonitorDot, BarChart3, RefreshCcw, Route, ScanSearch,
  AlertCircle, Wifi, WifiOff, Camera, Trash2, Terminal, X, Info, CheckCircle2,
  Link2, Unlink2, GitFork,
} from 'lucide-react';
import { MiniMap, ReactFlowProvider } from '@xyflow/react';
import { useUiStore } from '@/stores/uiStore';
import { useFlowStore } from '@/stores/flowStore';
import { getMiniMapNodeColor, NodeFlowView } from '@/components/flow/NodeFlowView';
import { MatrixView } from '@/components/matrix/MatrixView';
import { DetailPanel } from '@/components/detail/DetailPanel';
import { OutputPreviewPanel } from '@/components/output/OutputPreviewPanel';
import { MaxDebugPanel } from '@/components/debug/MaxDebugPanel';
import { getSocket } from '@/lib/socket';

export default function BrumFlowPage() {
  const {
    viewMode,
    setViewMode,
    detailPanelOpen,
    toggleDetailPanel,
    outputPanelOpen,
    toggleOutputPanel,
    requestAutoLayout,
    requestFitView,
    requestZoomIn,
    requestZoomOut,
    linkSameType,
    toggleLinkSameType,
    moveParents,
    toggleMoveParents,
  } = useUiStore();
  const {
    loading,
    error,
    scenes,
    activeSceneId,
    setActiveScene,
    loadAll,
    initSocket,
    pathCount,
    maxSyncState,
    cameraMatchPrompt,
    resolvePaths,
    selectedNodeId,
    removeNode,
    removeNodes,
    selectedNodeIds,
    assignNodeCamera,
    dismissCameraMatchPrompt,
    pushToMax,
    importCamerasFromMax,
  } = useFlowStore();

  const toast = useFlowStore((s) => s.toast);
  const dismissToast = useFlowStore((s) => s.dismissToast);

  const [socketConnected, setSocketConnected] = useState(false);
  const [isImportingCameras, setIsImportingCameras] = useState(false);
  const [selectedReplacementCameraId, setSelectedReplacementCameraId] = useState('');
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const maxDebugLogCount = useFlowStore((s) => s.maxDebugLog.length);

  useEffect(() => {
    setSelectedReplacementCameraId(cameraMatchPrompt?.availableCameras[0]?.id ?? '');
  }, [cameraMatchPrompt]);

  useEffect(() => {
    loadAll();
    initSocket();

    const socket = getSocket();
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) setSocketConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [loadAll, initSocket]);

  const handleRefreshScene = useCallback(() => {
    if (activeSceneId) {
      void setActiveScene(activeSceneId);
      return;
    }
    void loadAll();
  }, [activeSceneId, setActiveScene, loadAll]);

  const handleImportCameras = useCallback(async () => {
    setIsImportingCameras(true);
    try {
      await importCamerasFromMax();
      await resolvePaths();
    } finally {
      setIsImportingCameras(false);
    }
  }, [importCamerasFromMax, resolvePaths]);

  if (loading && scenes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
          <p className="text-xs text-muted-foreground">Loading scenes…</p>
        </div>
      </div>
    );
  }

  if (error && scenes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-error" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Failed to load</h3>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-background hover:bg-brand-500 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
    <div className="flex h-screen overflow-hidden">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scene tabs bar */}
        <div className="h-9 border-b border-border flex items-center gap-0 shrink-0 bg-surface-100/50">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => setActiveScene(scene.id)}
              className={`flex items-center gap-1.5 px-3 h-full text-xs border-r border-border transition-colors ${
                scene.id === activeSceneId
                  ? 'bg-surface-200 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-200/50'
              }`}
            >
              <MonitorDot className={`w-3 h-3 shrink-0 ${scene.is_active ? 'text-green-400' : 'text-fg-dim'}`} />
              <span className="truncate max-w-[200px]">{scene.name}</span>
            </button>
          ))}
          <Tooltip text="Connect to 3ds Max instance">
            <button className="flex items-center gap-1 px-2.5 h-full text-xs text-muted-foreground hover:text-foreground hover:bg-surface-200/50 transition-colors">
              <Plus className="w-3 h-3" />
            </button>
          </Tooltip>
        </div>

        {/* Toolbar + view toggle */}
        <div className="h-10 border-b border-border flex items-center px-3 shrink-0 gap-3">
          {/* Left: toolbar actions */}
          <div className="flex flex-1 items-center gap-1 min-w-0">
            <Tooltip text={`Output Preview (${pathCount} paths)`}>
              <button
                onClick={toggleOutputPanel}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition ${
                  outputPanelOpen
                    ? 'bg-brand/15 text-brand'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-300'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{pathCount} paths</span>
              </button>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-200/60 px-1 py-0.5">
            <ToolbarButton
              icon={Plus}
              tooltip="Zoom in"
              onClick={requestZoomIn}
              disabled={viewMode !== 'flow' || loading}
            />
            <ToolbarButton
              icon={Minus}
              tooltip="Zoom out"
              onClick={requestZoomOut}
              disabled={viewMode !== 'flow' || loading}
            />
            <ToolbarButton
              icon={ScanSearch}
              tooltip="Fit graph to view"
              onClick={requestFitView}
              disabled={viewMode !== 'flow' || loading}
            />
            <ToolbarButton
              icon={LayoutGrid}
              tooltip="Auto layout graph"
              onClick={requestAutoLayout}
              disabled={viewMode !== 'flow' || loading}
            />
            <div className="mx-1 h-4 w-px bg-border" />
            <ToolbarButton
              icon={Camera}
              tooltip="Import all cameras from 3ds Max"
              onClick={handleImportCameras}
              disabled={!activeSceneId || loading || isImportingCameras}
              loading={isImportingCameras}
            />
            <ToolbarButton
              icon={Route}
              tooltip="Resolve paths"
              onClick={() => void resolvePaths()}
              disabled={!activeSceneId || loading}
            />
            <ToolbarButton
              icon={Trash2}
              tooltip={selectedNodeIds.length > 1 ? `Delete ${selectedNodeIds.length} selected nodes` : selectedNodeId ? 'Delete selected node' : 'No node selected'}
              onClick={() => {
                if (selectedNodeIds.length > 0) {
                  removeNodes(selectedNodeIds);
                } else if (selectedNodeId) {
                  removeNode(selectedNodeId);
                }
              }}
              disabled={(!selectedNodeId && selectedNodeIds.length === 0) || loading}
            />
            <ToolbarButton
              icon={RefreshCcw}
              tooltip="Reload current scene"
              onClick={handleRefreshScene}
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-200/60 px-1 py-0.5">
            <ToolbarButton
              icon={linkSameType ? Link2 : Unlink2}
              tooltip={linkSameType ? 'Link Type ON — drag moves all of same type' : 'Link Type OFF'}
              onClick={toggleLinkSameType}
              active={linkSameType}
            />
            <ToolbarButton
              icon={GitFork}
              tooltip={moveParents ? 'Move Parents ON — drag also moves upstream nodes' : 'Move Parents OFF'}
              onClick={toggleMoveParents}
              active={moveParents}
            />
          </div>

          {/* Right: view toggle + status + detail panel */}
          <div className="flex flex-1 items-center justify-end gap-2">
            {/* Socket status indicator */}
            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${socketConnected ? 'text-emerald-400' : 'text-red-400'}`}>
              {socketConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </div>

            {loading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
            {maxSyncState && (
              <div
                className={`rounded border px-2 py-1 text-[10px] ${
                  maxSyncState.status === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : maxSyncState.status === 'syncing' || maxSyncState.status === 'queued'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
                title={maxSyncState.last_error ?? maxSyncState.last_reason}
              >
                Max {maxSyncState.status}
              </div>
            )}
            <Tooltip text="Max debug log">
              <button
                onClick={() => setDebugPanelOpen(!debugPanelOpen)}
                className={`relative p-1.5 rounded transition ${
                  debugPanelOpen
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-300'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                {maxDebugLogCount > 0 && !debugPanelOpen && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-[8px] text-background flex items-center justify-center font-bold">
                    {maxDebugLogCount > 9 ? '9+' : maxDebugLogCount}
                  </span>
                )}
              </button>
            </Tooltip>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('flow')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs transition ${
                  viewMode === 'flow'
                    ? 'bg-brand/15 text-brand'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-300'
                }`}
              >
                <Workflow className="w-3.5 h-3.5" />
                Flow
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs transition ${
                  viewMode === 'list'
                    ? 'bg-brand/15 text-brand'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-300'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>

            <Tooltip text={detailPanelOpen ? 'Close detail panel' : 'Open detail panel'}>
              <button
                onClick={toggleDetailPanel}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-300 transition"
              >
                {detailPanelOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Error banner for non-critical errors */}
        {error && scenes.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-error/5 border-b border-error/20 text-xs text-error shrink-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{error}</span>
            <button
              onClick={() => useFlowStore.setState({ error: null })}
              className="ml-auto text-error/60 hover:text-error shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View content */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            {viewMode === 'flow' ? <NodeFlowView /> : <MatrixView />}
          </div>
          {(outputPanelOpen || debugPanelOpen) && (
            <div className="h-[280px] shrink-0 border-t border-border flex">
              {outputPanelOpen && (
                <div className={`overflow-y-auto ${debugPanelOpen ? 'flex-1 min-w-0' : 'w-full'}`}>
                  <OutputPreviewPanel />
                </div>
              )}
              {debugPanelOpen && (
                <div className={`overflow-y-auto ${outputPanelOpen ? 'w-[420px] border-l border-border' : 'w-full'}`}>
                  <MaxDebugPanel onClose={() => setDebugPanelOpen(false)} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

        {/* Detail panel */}
      {detailPanelOpen && (
        <div className="w-[380px] shrink-0 border-l border-border overflow-y-auto">
          {viewMode === 'flow' && (
            <div className="relative h-[160px] border-b border-border overflow-hidden">
              <MiniMap
                className="!static !bg-surface-100 !border-0 !rounded-none !m-0 !p-0 !shadow-none"
                style={{ width: '100%', height: '100%' }}
                nodeColor={(node) => getMiniMapNodeColor(node.type)}
                nodeStrokeColor="rgba(15, 23, 42, 0.9)"
                nodeStrokeWidth={1}
                maskColor="rgba(2, 6, 23, 0.45)"
                maskStrokeColor="rgba(125, 211, 252, 0.95)"
                maskStrokeWidth={1.5}
                pannable
                zoomable={false}
                offsetScale={2}
              />
            </div>
          )}
          <DetailPanel />
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border px-4 py-2.5 shadow-xl text-xs ${
          toast.level === 'error'
            ? 'border-red-500/40 bg-red-950/90 text-red-200'
            : toast.level === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : 'border-border bg-surface-100/95 text-foreground'
        }`}>
          {toast.level === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> :
           toast.level === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> :
           <Info className="w-3.5 h-3.5 shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={dismissToast} className="ml-1 p-0.5 rounded hover:bg-white/10 transition">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {cameraMatchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface-100 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
                <Camera className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Camera missing in 3ds Max</h3>
                <p className="mt-1 text-xs text-fg-muted">
                  `{cameraMatchPrompt.requestedCameraName}` was not found in the current 3ds Max scene. Pick a scene camera to rebind this node.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-fg-dim">Replacement camera</label>
              <select
                value={selectedReplacementCameraId}
                onChange={(event) => setSelectedReplacementCameraId(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-xs text-foreground focus:border-brand focus:outline-none"
              >
                {cameraMatchPrompt.availableCameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={dismissCameraMatchPrompt}
                className="rounded-lg border border-border px-3 py-2 text-xs text-foreground transition hover:bg-surface-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selectedReplacementCameraId) return;
                  void assignNodeCamera(cameraMatchPrompt.nodeId, selectedReplacementCameraId)
                    .then(async () => {
                      dismissCameraMatchPrompt();
                      if (cameraMatchPrompt.pathKey) {
                        await pushToMax(cameraMatchPrompt.pathKey);
                      }
                    });
                }}
                disabled={!selectedReplacementCameraId}
                className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-background transition hover:bg-brand-500 disabled:opacity-50"
              >
                Rebind and retry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ReactFlowProvider>
  );
}

function ToolbarButton({
  icon: Icon,
  tooltip,
  onClick,
  disabled = false,
  loading = false,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}) {
  return (
    <Tooltip text={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded transition ${
          disabled
            ? 'cursor-not-allowed text-fg-dim opacity-40'
            : active
              ? 'bg-brand/15 text-brand hover:bg-brand/25'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface-300'
        }`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
      </button>
    </Tooltip>
  );
}

function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 });
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="fixed z-50 px-2 py-1 rounded bg-surface-100 border border-border text-[10px] text-foreground whitespace-nowrap shadow-lg pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: 'translateX(-50%)' }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
