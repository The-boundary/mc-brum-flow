import { useEffect } from 'react';
import {
  Workflow, List, PanelRightOpen, PanelRightClose, Loader2,
  Plus, LayoutGrid, ZoomIn, ZoomOut, Maximize2,
  Box, Camera, Palette, FileOutput, MonitorDot,
} from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { useFlowStore } from '@/stores/flowStore';
import { NodeFlowView } from '@/components/flow/NodeFlowView';
import { MatrixView } from '@/components/matrix/MatrixView';
import { DetailPanel } from '@/components/detail/DetailPanel';

export default function BrumFlowPage() {
  const { viewMode, setViewMode, detailPanelOpen, toggleDetailPanel } = useUiStore();
  const { loading, error, scenes, activeSceneId, setActiveScene, loadAll, initSocket } = useFlowStore();

  useEffect(() => {
    loadAll();
    initSocket();
  }, [loadAll, initSocket]);

  if (loading && scenes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
      </div>
    );
  }

  if (error && scenes.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={loadAll} className="text-xs text-brand hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
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
              <MonitorDot className={`w-3 h-3 ${scene.isActive ? 'text-green-400' : 'text-muted-foreground'}`} />
              <span className="truncate max-w-[200px]">{scene.name}</span>
            </button>
          ))}
          <button
            className="flex items-center gap-1 px-2.5 h-full text-xs text-muted-foreground hover:text-foreground hover:bg-surface-200/50 transition-colors"
            title="Connect to 3ds Max instance"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Toolbar + view toggle */}
        <div className="h-10 border-b border-border flex items-center justify-between px-3 shrink-0">
          {/* Left: toolbar actions */}
          <div className="flex items-center gap-1">
            <ToolbarButton icon={Box} label="Add Shot" />
            <ToolbarButton icon={Camera} label="Add Camera" />
            <ToolbarButton icon={Palette} label="Add Scene State" />
            <ToolbarButton icon={FileOutput} label="Add Output" />
            <div className="w-px h-5 bg-border mx-1" />
            <ToolbarButton icon={LayoutGrid} label="Auto Layout" />
            <ToolbarButton icon={ZoomIn} label="Zoom In" />
            <ToolbarButton icon={ZoomOut} label="Zoom Out" />
            <ToolbarButton icon={Maximize2} label="Fit View" />
          </div>

          {/* Right: view toggle + detail panel */}
          <div className="flex items-center gap-2">
            {loading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
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

            <button
              onClick={toggleDetailPanel}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-300 transition"
              title={detailPanelOpen ? 'Close detail panel' : 'Open detail panel'}
            >
              {detailPanelOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* View content */}
        <div className="flex-1 min-h-0">
          {viewMode === 'flow' ? <NodeFlowView /> : <MatrixView />}
        </div>
      </div>

      {/* Detail panel */}
      {detailPanelOpen && (
        <div className="w-[380px] shrink-0 border-l border-border overflow-y-auto">
          <DetailPanel />
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-300 transition"
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
