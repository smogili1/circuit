import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Workflow } from './types/workflow';
import { useSocket } from './hooks/useSocket';
import { useWorkflowStore } from './stores/workflowStore';
import { useSchemaStore } from './stores/schemaStore';
import { WorkflowDesignPage } from './pages/WorkflowDesignPage';
import { WorkflowExecutionPage } from './pages/WorkflowExecutionPage';
import { MCPServersPage } from './pages/MCPServersPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ApprovalModal } from './components/Execution/ApprovalModal';
import { ValidationErrorModal } from './components/Execution/ValidationErrorModal';
import { EvolutionApprovalPanel } from './components/Sidebar/EvolutionApprovalPanel';
import { NavigationContext, useNavigationValue } from './contexts/NavigationContext';
import { Save, Wifi, WifiOff, PanelLeftClose, PanelRightClose, Check, Loader2, AlertCircle, Pencil, Play, FolderOpen, X, Server } from 'lucide-react';

function AppHeader() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const {
    isConnected,
    saveStatus,
    saveWorkflow,
    execution,
  } = useSocket();
  const { workflow, getWorkflowData, updateWorkflowSettings } = useWorkflowStore();
  const navigationValue = useNavigationValue(workflowId || null);

  const [isEditingWorkingDir, setIsEditingWorkingDir] = useState(false);
  const [workingDirInput, setWorkingDirInput] = useState('');

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

  const currentPage = navigationValue.currentPage;

  return (
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
            onClick={() => navigationValue.navigateTo('design')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentPage === 'design'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <Pencil size={14} />
            Design
          </button>
          <button
            onClick={() => navigationValue.navigateTo('execution')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentPage === 'execution'
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
            onClick={() => navigationValue.navigateTo('mcp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentPage === 'mcp'
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

        {/* Panel toggles - only show on design page */}
        {currentPage === 'design' && (
          <>
            <button
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              title="Toggle left panel"
            >
              <PanelLeftClose size={18} />
            </button>
            <button
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
              title="Toggle right panel"
            >
              <PanelRightClose size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function WorkflowRedirect() {
  const { workflows } = useSocket();

  if (workflows.length > 0) {
    return <Navigate to={`/workflows/${workflows[0].id}`} replace />;
  }

  return <Navigate to="/workflows" replace />;
}

export default function App() {
  const {
    workflows,
    execution,
    executionHistory,
    startExecution,
    interruptExecution,
    resetExecution,
    submitApproval,
    submitEvolution,
    clearValidationErrors,
    fetchExecutionHistory,
    loadExecutionHistory,
    replayExecution,
  } = useSocket();

  const { workflow, setWorkflow, getDuplicateNames, selectNode } = useWorkflowStore();
  const { fetchSchemas, loading: schemasLoading, error: schemasError, initialized: schemasInitialized } = useSchemaStore();
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigationValue = useNavigationValue(workflowId || null);

  const [duplicateNameError, setDuplicateNameError] = useState<string[] | null>(null);

  // Fetch schemas on mount
  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

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

  // Track previous isRunning to detect when execution completes
  const prevIsRunningRef = useRef(execution.isRunning);

  useEffect(() => {
    if (!workflow?.id) {
      return;
    }

    // Fetch on workflow change (always)
    // Also refetch when execution completes (isRunning goes from true to false)
    const executionJustCompleted = prevIsRunningRef.current && !execution.isRunning;
    prevIsRunningRef.current = execution.isRunning;

    // Always fetch on first load (when executionHistory is null or for different workflow)
    const needsInitialFetch = !executionHistory || executionHistory.workflowId !== workflow.id;

    if (needsInitialFetch || executionJustCompleted) {
      fetchExecutionHistory(workflow.id);
    }
  }, [workflow?.id, execution.isRunning, executionHistory, fetchExecutionHistory]);

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

  return (
    <NavigationContext.Provider value={navigationValue}>
      <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
        <AppHeader />

        {/* Main content */}
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-blue-600" />
          </div>
        }>
          <Routes>
            <Route path="/" element={<WorkflowRedirect />} />
            <Route path="/workflows" element={<WorkflowRedirect />} />
            <Route
              path="/workflows/:workflowId"
              element={
                <WorkflowDesignPage
                  workflows={workflows}
                  nodeStates={execution.nodeStates}
                  onCreate={handleCreate}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onRename={handleRename}
                />
              }
            />
            <Route
              path="/workflows/:workflowId/executions"
              element={
                <WorkflowExecutionPage
                  workflows={workflows}
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
                  onReplayExecution={replayExecution}
                />
              }
            />
            <Route
              path="/workflows/:workflowId/executions/:executionId"
              element={
                <WorkflowExecutionPage
                  workflows={workflows}
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
                  onReplayExecution={replayExecution}
                />
              }
            />
            <Route path="/mcp" element={<MCPServersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>

        {/* Approval Modal - shown when workflow is waiting for user approval */}
        {execution.pendingApproval && (
          <ApprovalModal
            approval={execution.pendingApproval}
            onSubmit={submitApproval}
          />
        )}

        {/* Evolution Approval Panel - shown when self-reflect node proposes workflow evolution */}
        {execution.pendingEvolution && (
          <EvolutionApprovalPanel
            evolution={execution.pendingEvolution}
            onSubmit={submitEvolution}
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
