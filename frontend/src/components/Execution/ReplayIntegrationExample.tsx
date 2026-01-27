/**
 * Example Integration: How to use ReplayModal with ExecutionHistory
 *
 * This file demonstrates how to integrate the ReplayModal component
 * with your execution history panel. Copy this pattern into your
 * existing execution components (e.g., ExecutionPanel, FullScreenExecution).
 */

import { useState } from 'react';
import { ExecutionHistory } from './ExecutionHistory';
import { ReplayModal } from './ReplayModal';

interface ExampleIntegrationProps {
  workflowId: string | null;
  executions: any[]; // ExecutionSummary[]
  activeExecutionId: string | null;
  isRunning: boolean;
  onRefreshHistory: (workflowId: string) => void;
  onLoadHistory: (workflowId: string, executionId: string) => void;
  onReplayExecution: (
    workflowId: string,
    sourceExecutionId: string,
    fromNodeId: string,
    useOriginalInput: boolean,
    input?: string
  ) => void;
}

export function ExampleIntegration({
  workflowId,
  executions,
  activeExecutionId,
  isRunning,
  onRefreshHistory,
  onLoadHistory,
  onReplayExecution,
}: ExampleIntegrationProps) {
  // State to control replay modal
  const [replayModalState, setReplayModalState] = useState<{
    isOpen: boolean;
    executionId: string | null;
    input: string;
  }>({
    isOpen: false,
    executionId: null,
    input: '',
  });

  // Handler for the "Retry from..." button in ExecutionHistory
  const handleOpenReplayModal = (workflowId: string, executionId: string, input: string) => {
    setReplayModalState({
      isOpen: true,
      executionId,
      input,
    });
  };

  // Handler for closing the replay modal
  const handleCloseReplayModal = () => {
    setReplayModalState({
      isOpen: false,
      executionId: null,
      input: '',
    });
  };

  // Handler for when user confirms replay in the modal
  const handleReplay = (fromNodeId: string, useOriginalInput: boolean, input?: string) => {
    if (!workflowId || !replayModalState.executionId) return;

    onReplayExecution(
      workflowId,
      replayModalState.executionId,
      fromNodeId,
      useOriginalInput,
      input
    );
  };

  return (
    <div>
      {/* ExecutionHistory with onRetry callback */}
      <ExecutionHistory
        workflowId={workflowId}
        executions={executions}
        activeExecutionId={activeExecutionId}
        isRunning={isRunning}
        onRefresh={onRefreshHistory}
        onLoad={onLoadHistory}
        onRetry={handleOpenReplayModal}
      />

      {/* ReplayModal - conditionally rendered */}
      {replayModalState.isOpen && workflowId && replayModalState.executionId && (
        <ReplayModal
          workflowId={workflowId}
          executionId={replayModalState.executionId}
          originalInput={replayModalState.input}
          onClose={handleCloseReplayModal}
          onReplay={handleReplay}
        />
      )}
    </div>
  );
}

/**
 * INTEGRATION STEPS:
 *
 * 1. Add state for replay modal to your execution panel component:
 *    ```
 *    const [replayModalState, setReplayModalState] = useState({
 *      isOpen: false,
 *      executionId: null,
 *      input: '',
 *    });
 *    ```
 *
 * 2. Add the onRetry prop to ExecutionHistory:
 *    ```
 *    <ExecutionHistory
 *      // ... other props
 *      onRetry={(workflowId, executionId, input) => {
 *        setReplayModalState({ isOpen: true, executionId, input });
 *      }}
 *    />
 *    ```
 *
 * 3. Add the ReplayModal component below ExecutionHistory:
 *    ```
 *    {replayModalState.isOpen && workflowId && replayModalState.executionId && (
 *      <ReplayModal
 *        workflowId={workflowId}
 *        executionId={replayModalState.executionId}
 *        originalInput={replayModalState.input}
 *        onClose={() => setReplayModalState({ isOpen: false, executionId: null, input: '' })}
 *        onReplay={(fromNodeId, useOriginalInput, input) => {
 *          // Call your replayExecution function from useSocket
 *          replayExecution(workflowId, replayModalState.executionId!, fromNodeId, useOriginalInput, input);
 *        }}
 *      />
 *    )}
 *    ```
 *
 * 4. Make sure to use the replayExecution function from useSocket:
 *    ```
 *    const { replayExecution, ... } = useSocket();
 *    ```
 */
