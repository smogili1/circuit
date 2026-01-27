import { useState } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { WorkflowCanvas } from '../components/Canvas/WorkflowCanvas';
import { NodePalette } from '../components/Sidebar/NodePalette';
import { PropertiesPanel } from '../components/Sidebar/PropertiesPanel';
import { WorkflowList } from '../components/common/WorkflowList';
import { useRouteSync } from '../hooks/useRouteSync';
import { Workflow } from '../types/workflow';
import { FolderOpen, Blocks } from 'lucide-react';

interface WorkflowDesignPageProps {
  workflows: Workflow[];
  nodeStates: Map<string, string>;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string, newName: string) => void;
  onRename: (id: string, newName: string) => void;
}

export function WorkflowDesignPage({
  workflows,
  nodeStates,
  onCreate,
  onDelete,
  onDuplicate,
  onRename,
}: WorkflowDesignPageProps) {
  const { workflow } = useWorkflowStore();
  const [leftPanelOpen] = useState(true);
  const [rightPanelOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'workflows' | 'nodes'>('workflows');

  // Sync URL params with stores
  useRouteSync({ workflows });

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel - Workflow list or Node palette */}
      {leftPanelOpen && (
        <div className="w-64 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/* Tab selector */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveLeftTab('workflows')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                activeLeftTab === 'workflows'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <FolderOpen size={14} />
              Workflows
            </button>
            <button
              onClick={() => setActiveLeftTab('nodes')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                activeLeftTab === 'nodes'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Blocks size={14} />
              Nodes
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeLeftTab === 'workflows' ? (
              <WorkflowList
                workflows={workflows}
                selectedId={workflow?.id || null}
                onSelect={() => setActiveLeftTab('nodes')}
                onCreate={onCreate}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onRename={onRename}
              />
            ) : (
              <NodePalette />
            )}
          </div>
        </div>
      )}

      {/* Center - Canvas */}
      <div className="flex-1">
        {workflow ? (
          <WorkflowCanvas nodeStates={nodeStates} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">No workflow selected</p>
              <p className="text-sm">
                Select a workflow from the list or create a new one
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel - Properties */}
      {rightPanelOpen && (
        <div className="w-80 flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
          <div className="flex-1 overflow-y-auto">
            <PropertiesPanel />
          </div>
        </div>
      )}
    </div>
  );
}
