import { Workflow, List, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { NodeFlowView } from '@/components/flow/NodeFlowView';
import { MatrixView } from '@/components/matrix/MatrixView';
import { DetailPanel } from '@/components/detail/DetailPanel';

export default function BrumFlowPage() {
  const { viewMode, setViewMode, detailPanelOpen, toggleDetailPanel } = useUiStore();

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-11 border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Apartment_LuxuryPenthouse.max</span>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
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

            {/* Detail panel toggle */}
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
