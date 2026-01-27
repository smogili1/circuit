import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkflowStore } from '../stores/workflowStore';
import { Workflow } from '../types/workflow';

/**
 * Hook to sync URL parameters with Zustand stores
 *
 * This hook handles:
 * - Selecting workflow based on workflowId URL param
 * - Loading execution based on executionId URL param
 *
 * @param workflows - List of available workflows
 * @param loadExecutionHistory - Function to load a specific execution
 */
interface UseRouteSyncOptions {
  workflows: Workflow[];
  loadExecutionHistory?: (workflowId: string, executionId: string) => void;
}

export function useRouteSync({ workflows, loadExecutionHistory }: UseRouteSyncOptions) {
  const { workflowId, executionId } = useParams<{ workflowId: string; executionId: string }>();
  const { workflow, selectWorkflowById } = useWorkflowStore();

  // Sync workflowId from URL to store
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      // Only select if different from current
      if (workflow?.id !== workflowId) {
        const found = selectWorkflowById(workflowId, workflows);
        if (!found) {
          console.warn(`Workflow ${workflowId} not found in available workflows`);
        }
      }
    }
  }, [workflowId, workflows, workflow?.id, selectWorkflowById]);

  // Sync executionId from URL to load execution history
  useEffect(() => {
    if (workflowId && executionId && loadExecutionHistory) {
      loadExecutionHistory(workflowId, executionId);
    }
  }, [workflowId, executionId, loadExecutionHistory]);

  return {
    workflowId: workflowId || null,
    executionId: executionId || null,
  };
}
