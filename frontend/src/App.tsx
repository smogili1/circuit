import { useEffect, useState, useCallback } from 'react';
import { Workflow } from './types/workflow';
import { useSocket } from './hooks/useSocket';
import { useWorkflowStore } from './stores/workflowStore';
import { useSchemaStore } from './stores/schemaStore';
import { WorkflowCanvas } from './components/Canvas/WorkflowCanvas';
import { NodePalette } from './components/Sidebar/NodePalette';
import { PropertiesPanel } from './components/Sidebar/PropertiesPanel';
import { FullScreenExecution } from './components/Execution/FullScreenExecution';
import { ApprovalModal } from './components/Execution/ApprovalModal';
import { ValidationErrorModal } from './components/Execution/ValidationErrorModal';
import { WorkflowList } from './components/common/WorkflowList';
import { MCPServersPage } from './pages/MCPServersPage';
import { NavigationContext, AppPage } from './contexts/NavigationContext';
import { Save, Wifi, WifiOff, PanelLeftClose, PanelRightClose, Check, Loader2, AlertCircle, Pencil, Play, FolderOpen, Blocks, Server, X } from 'lucide-react';

type AppMode = 'design' | 'execution' | 'mcp';

export default function App() {
  const {
    isConnected,
    workflows,
    execution,
    executionHistory,
    saveStatus,
    saveWorkflow,
    startExecution,
    interruptExecution,
    resetExecution,
    submitApproval,
    clearValidationErrors,
    fetchExecutionHistory,
    loadExecutionHistory,
    fetchReplayPreview,
    replayFromNode,
  } = useSocket();

  const { workflow, setWorkflow, getWorkflowData, selectNode, getDuplicateNames, updateWorkflowSettings } = useWorkflowStore();
  const { fetchSchemas, loading: schemasLoading, error: schemasError, initialized: schemasInitialized } = useSchemaStore();

  // Fetch schemas on mount
  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  const [appMode, setAppMode] = useState<AppMode>('design');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<'workflows' | 'nodes'>('workflows');
  const [duplicateNameError, setDuplicateNameError] = useState<string[] | null>(null);
  const [isEditingWorkingDir, setIsEditingWorkingDir] = useState(false);
  const [workingDirInput, setWorkingDirInput] = useState('');

  // Wrapper to validate before starting execution
  const handleStartExecution = useCallback((workflowId: string, input: string) => {
    const duplicates = getDuplicateNames();
    if (duplicates.length > 0) {
      setDuplicateNameError(duplicates);
      return;
    }
    setDuplicateNameError(null);
    startExecution(workflowId, input);
  }, [getDuplicateNames, startExecution]);

  // Handle workflow save
  const handleSave = () => {
    if (workflow) {
      const { nodes, edges, workingDirectory } = getWorkflowData();
      const updated: Workflow = {
        ...workflow,
        nodes,
        edges,
        workingDirectory,
        updatedAt: new Date().toISOString(),
      };
      saveWorkflow(updated);
    }
  };

  // Create new workflow
  const handleCreate = async (name: string) => {
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const newWorkflow = await response.json();
      setWorkflow(newWorkflow);
    } catch (error) {
      console.error('Failed to create workflow:', error);
    }
  };

  // Delete workflow
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      if (workflow?.id === id) {
        setWorkflow(workflows.find((w) => w.id !== id) || null as unknown as Workflow);
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error);
    }
  };

  // Duplicate workflow
  const handleDuplicate = async (id: string, newName: string) => {
    try {
      const response = await fetch(`/api/workflows/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const duplicated = await response.json();
      setWorkflow(duplicated);
    } catch (error) {
      console.error('Failed to duplicate workflow:', error);
    }
  };

  // Rename workflow
  const handleRename = async (id: string, newName: string) => {
    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const updated = await response.json();
      if (workflow?.id === id) {
        setWorkflow(updated);
      }
    } catch (error) {
      console.error('Failed to rename workflow:', error);
    }
  };

  // Auto-select first workflow
  useEffect(() => {
    if (!workflow && workflows.length > 0) {
      setWorkflow(workflows[0]);
    }
  }, [workflows, workflow, setWorkflow]);

  useEffect(() => {
    if (workflow?.id && !execution.isRunning) {
      fetchExecutionHistory(workflow.id);
    }
  }, [workflow?.id, execution.isRunning, fetchExecutionHistory]);

  // Show loading state while schemas are loading
  if (schemasLoading || !schemasInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading schemas...</p>
        </div>
      </div>
    );
  }

  // Show error state if schemas failed to load
  if (schemasError) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="text-center">
          <AlertCircle size={32} className="mx-auto mb-4 text-red-600" />
          <p className="text-red-600 mb-2">Failed to load schemas</p>
          <p className="text-gray-500 text-sm">{schemasError}</p>
          <button
            onClick={() => fetchSchemas()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Navigation context value
  const navigationValue = {
    currentPage: appMode as AppPage,
    navigateTo: (page: AppPage) => setAppMode(page),
  };

  return (
    <NavigationContext.Provider value={navigationValue}>
      <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Circuit
          </h1>
          {workflow && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              / {workflow.name}
            </span>
          )}

          {/* Working Directory */}
          {workflow && (
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-300 dark:border-gray-600">
              <FolderOpen size={14} className="text-gray-400 flex-shrink-0" />
              {isEditingWorkingDir ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={workingDirInput}
                    onChange={(e) => setWorkingDirInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateWorkflowSettings({ workingDirectory: workingDirInput });
                        setIsEditingWorkingDir(false);
                      } else if (e.key === 'Escape') {
                        setIsEditingWorkingDir(false);
                        setWorkingDirInput(workflow.workingDirectory || '');
                      }
                    }}
                    autoFocus
                    placeholder="/path/to/project"
                    className="w-64 px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      updateWorkflowSettings({ workingDirectory: workingDirInput });
                      setIsEditingWorkingDir(false);
                    }}
                    className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                    title="Save"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingWorkingDir(false);
                      setWorkingDirInput(workflow.workingDirectory || '');
                    }}
                    className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setWorkingDirInput(workflow.workingDirectory || '');
                    setIsEditingWorkingDir(true);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors group"
                  title="Click to edit working directory"
                >
                  <span className={workflow.workingDirectory ? '' : 'italic text-gray-400'}>
                    {workflow.workingDirectory || 'Set working directory...'}
                  </span>
                  <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          )}

          {/* Mode Tabs */}
          <div className="flex ml-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setAppMode('design')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                appMode === 'design'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Pencil size={14} />
              Design
            </button>
            <button
              onClick={() => setAppMode('execution')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                appMode === 'execution'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Play size={14} />
              Execution
              {execution.isRunning && (
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setAppMode('mcp')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                appMode === 'mcp'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Server size={14} />
              MCP Servers
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
              isConnected
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}
          >
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!workflow || saveStatus === 'saving'}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              ${saveStatus === 'saved'
                ? 'bg-green-600 text-white'
                : saveStatus === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
          >
            {saveStatus === 'saving' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check size={16} />
            ) : saveStatus === 'error' ? (
              <AlertCircle size={16} />
            ) : (
              <Save size={16} />
            )}
            {saveStatus === 'saving' ? 'Saving...'
              : saveStatus === 'saved' ? 'Saved!'
              : saveStatus === 'error' ? 'Error'
              : 'Save'}
          </button>

          {/* Panel toggles */}
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Toggle left panel"
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Toggle right panel"
          >
            <PanelRightClose size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {appMode === 'mcp' ? (
          /* MCP Servers Page */
          <MCPServersPage />
        ) : appMode === 'design' ? (
          <>
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
                      onSelect={(w) => {
                        setWorkflow(w);
                        setActiveLeftTab('nodes');
                      }}
                      onCreate={handleCreate}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onRename={handleRename}
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
                <WorkflowCanvas nodeStates={execution.nodeStates} />
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
          </>
        ) : (
          /* Full-screen Execution Mode */
          <FullScreenExecution
            workflow={workflow}
            isRunning={execution.isRunning}
            executionId={execution.executionId}
            submittedInput={execution.submittedInput}
            executionStartedAt={execution.executionStartedAt}
            nodeStates={execution.nodeStates}
            nodeOutputs={execution.nodeOutputs}
            nodeTypes={execution.nodeTypes}
            branchPaths={execution.branchPaths}
            branchResults={execution.branchResults}
            executionHistory={
              executionHistory?.workflowId === workflow?.id
                ? executionHistory?.executions ?? []
                : []
            }
            onStart={handleStartExecution}
            onInterrupt={interruptExecution}
            onReset={resetExecution}
            onRefreshHistory={fetchExecutionHistory}
            onLoadHistory={loadExecutionHistory}
            onFetchReplayPreview={fetchReplayPreview}
            onReplayFromNode={replayFromNode}
          />
        )}
        </div>

        {/* Approval Modal - shown when workflow is waiting for user approval */}
        {execution.pendingApproval && (
          <ApprovalModal
            approval={execution.pendingApproval}
            onSubmit={submitApproval}
          />
        )}

        {/* Validation Error Modal - shown when workflow fails pre-execution validation */}
        {execution.validationErrors && (
          <ValidationErrorModal
            errors={execution.validationErrors}
            onClose={clearValidationErrors}
            onHighlightNode={(nodeId) => {
              selectNode(nodeId);
              clearValidationErrors();
            }}
          />
        )}

        {/* Duplicate Name Error Modal */}
        {duplicateNameError && (
          <ValidationErrorModal
            errors={duplicateNameError.map(name => ({
              code: 'DUPLICATE_NAME',
              message: `Multiple nodes have the name "${name}". Each node must have a unique name.`,
            }))}
            onClose={() => setDuplicateNameError(null)}
          />
        )}
      </div>
    </NavigationContext.Provider>
  );
}
