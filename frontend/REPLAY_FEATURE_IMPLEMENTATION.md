# Replay Feature Implementation

This document describes the frontend implementation of the "Retry from Node" functionality that allows users to replay workflow executions from specific checkpoints.

## Overview

The replay feature enables users to restart a workflow execution from a previously completed or failed node, using the checkpoint data from that execution. The feature includes strict validation to prevent replays when the workflow structure has changed (nodes added or removed).

## Components

### 1. Type Definitions (`src/types/workflow.ts`)

Added the following types to support replay functionality:

```typescript
// Replay warning and error types
export type ReplayWarningType =
  | 'node-config-changed'
  | 'workflow-structure-modified'
  | 'missing-dependencies';

export type ReplayErrorType =
  | 'node-added'
  | 'node-removed'
  | 'workflow-snapshot-missing'
  | 'checkpoint-missing';

export interface ReplayWarning {
  type: ReplayWarningType;
  message: string;
  nodeId?: string;
}

export interface ReplayError {
  type: ReplayErrorType;
  message: string;
  nodeId?: string;
}

export interface ReplayCheckpoint {
  nodeId: string;
  nodeName: string;
  status: NodeStatus;
  replayable: boolean;
  reason?: string;
}

export interface ReplayInfo {
  sourceExecutionId: string;
  workflowId: string;
  checkpoints: ReplayCheckpoint[];
  warnings: ReplayWarning[];
  errors: ReplayError[];
  isReplayBlocked: boolean;
}

export interface ReplayValidationResult {
  isBlocked: boolean;
  blockingReasons: string[];
  warnings: string[];
  replayableNodeIds: string[];
}

// Updated ControlEvent to include replay-execution
export type ControlEvent =
  | { type: 'start-execution'; workflowId: string; input: string }
  | { type: 'interrupt'; executionId: string }
  | { type: 'resume'; executionId: string }
  | { type: 'subscribe-execution'; executionId: string; afterTimestamp?: string }
  | {
      type: 'replay-execution';
      workflowId: string;
      sourceExecutionId: string;
      fromNodeId: string;
      useOriginalInput?: boolean;
      input?: string;
    }
  | { type: 'submit-approval'; executionId: string; nodeId: string; response: ApprovalResponse };
```

### 2. ReplayValidationBanner Component (`src/components/Execution/ReplayValidationBanner.tsx`)

Displays validation errors and warnings for replay operations.

**Features:**
- Shows blocking errors (red) when replay is not possible (e.g., workflow structure changed)
- Shows warnings (yellow) when replay is possible but results may differ
- Displays node-specific information when applicable
- Responsive design with dark mode support

**Props:**
```typescript
interface ReplayValidationBannerProps {
  errors: ReplayError[];
  warnings: ReplayWarning[];
}
```

### 3. ReplayNodeSelector Component (`src/components/Execution/ReplayNodeSelector.tsx`)

Allows users to select a node to replay from.

**Features:**
- Lists all available checkpoints from the execution
- Shows node status (complete, error, waiting, etc.)
- Indicates which nodes are replayable vs. blocked
- Displays reasons why a node cannot be used for replay
- Visual selection state with highlight
- Responsive design with dark mode support

**Props:**
```typescript
interface ReplayNodeSelectorProps {
  checkpoints: ReplayCheckpoint[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}
```

### 4. ReplayModal Component (`src/components/Execution/ReplayModal.tsx`)

Main modal dialog for configuring and initiating a replay operation.

**Features:**
- Fetches replay information from the backend API
- Displays validation banner with errors/warnings
- Shows node selector for choosing replay point
- Allows choosing between original input or custom input
- Loads and displays replay info automatically
- Handles loading and error states
- Locks body scroll when open
- Responsive design with dark mode support

**Props:**
```typescript
interface ReplayModalProps {
  workflowId: string;
  executionId: string;
  originalInput: string;
  onClose: () => void;
  onReplay: (fromNodeId: string, useOriginalInput: boolean, input?: string) => void;
}
```

**API Integration:**
- `GET /api/workflows/:id/executions/:executionId/replay-info` - Fetches replay metadata

### 5. ExecutionHistory Component (Updated)

Added "Retry from..." button for completed or errored executions.

**Changes:**
- Added optional `onRetry` prop
- Shows "Retry from..." button on completed/errored executions
- Button triggers replay modal with execution context

**New Props:**
```typescript
interface ExecutionHistoryProps {
  // ... existing props
  onRetry?: (workflowId: string, executionId: string, input: string) => void;
}
```

### 6. ExecutionPanel Component (Updated)

Integrated replay functionality into the execution panel.

**Changes:**
- Added `onReplayExecution` prop
- Manages replay modal state (open/close, execution context)
- Passes replay handlers to ExecutionHistory
- Renders ReplayModal conditionally

**New Props:**
```typescript
interface ExecutionPanelProps {
  // ... existing props
  onReplayExecution?: (
    workflowId: string,
    sourceExecutionId: string,
    fromNodeId: string,
    useOriginalInput: boolean,
    input?: string
  ) => void;
}
```

### 7. useSocket Hook (Updated)

Added `replayExecution` function to support replay operations.

**New Function:**
```typescript
const replayExecution = useCallback((
  workflowId: string,
  sourceExecutionId: string,
  fromNodeId: string,
  useOriginalInput: boolean,
  input?: string
) => {
  // Sends replay-execution control event via WebSocket
  // Resets execution state for new replay
}, []);
```

**Returns:**
```typescript
{
  // ... existing returns
  replayExecution,
}
```

## User Flow

1. **View Execution History**
   - User sees list of past executions in ExecutionHistory component
   - Completed or errored executions show a "Retry from..." button

2. **Open Replay Modal**
   - User clicks "Retry from..." button
   - ReplayModal opens and fetches replay info from backend

3. **Review Validation**
   - Modal displays any blocking errors or warnings
   - If blocked (e.g., workflow structure changed), replay is disabled
   - If warnings exist, user can proceed but is informed of potential differences

4. **Select Replay Point**
   - User selects a node from the available checkpoints
   - Only replayable nodes are selectable
   - Non-replayable nodes show reasons (e.g., "No checkpoint available")

5. **Configure Input**
   - User chooses between:
     - **Use original input**: Replay with the same input as the original execution
     - **Provide custom input**: Edit the input before replaying

6. **Start Replay**
   - User clicks "Start Replay"
   - Modal closes and replay execution begins
   - WebSocket emits `replay-execution` control event
   - New execution starts from the selected checkpoint

## Integration Guide

To integrate the replay feature in other components:

```typescript
import { useState } from 'react';
import { ReplayModal } from './ReplayModal';
import { ExecutionHistory } from './ExecutionHistory';
import { useSocket } from '../../hooks/useSocket';

function YourComponent() {
  const { replayExecution } = useSocket();

  const [replayModalState, setReplayModalState] = useState({
    isOpen: false,
    executionId: null,
    input: '',
  });

  const handleOpenReplayModal = (workflowId: string, executionId: string, input: string) => {
    setReplayModalState({ isOpen: true, executionId, input });
  };

  const handleReplay = (fromNodeId: string, useOriginalInput: boolean, input?: string) => {
    if (!workflowId || !replayModalState.executionId) return;

    replayExecution(
      workflowId,
      replayModalState.executionId,
      fromNodeId,
      useOriginalInput,
      input
    );

    setReplayModalState({ isOpen: false, executionId: null, input: '' });
  };

  return (
    <>
      <ExecutionHistory
        // ... other props
        onRetry={handleOpenReplayModal}
      />

      {replayModalState.isOpen && workflowId && replayModalState.executionId && (
        <ReplayModal
          workflowId={workflowId}
          executionId={replayModalState.executionId}
          originalInput={replayModalState.input}
          onClose={() => setReplayModalState({ isOpen: false, executionId: null, input: '' })}
          onReplay={handleReplay}
        />
      )}
    </>
  );
}
```

## Backend API Requirements

The frontend expects the following API endpoints:

### GET /api/workflows/:id/executions/:executionId/replay-info

Returns replay information for a specific execution.

**Response:**
```typescript
{
  sourceExecutionId: string;
  workflowId: string;
  checkpoints: Array<{
    nodeId: string;
    nodeName: string;
    status: NodeStatus;
    replayable: boolean;
    reason?: string;
  }>;
  warnings: Array<{
    type: ReplayWarningType;
    message: string;
    nodeId?: string;
  }>;
  errors: Array<{
    type: ReplayErrorType;
    message: string;
    nodeId?: string;
  }>;
  isReplayBlocked: boolean;
}
```

### WebSocket Control Event: replay-execution

The frontend emits this control event to start a replay:

```typescript
{
  type: 'replay-execution';
  workflowId: string;
  sourceExecutionId: string;
  fromNodeId: string;
  useOriginalInput?: boolean;
  input?: string;
}
```

## Styling

All components use Tailwind CSS with dark mode support:
- Blue color scheme for primary actions
- Red for errors/blocking states
- Yellow for warnings
- Green for success/replayable states
- Responsive design for various screen sizes
- Consistent spacing and typography

## Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management in modals
- Disabled state indicators
- Clear visual feedback for interactive elements

## Testing Considerations

When testing the replay feature:

1. **Validation Testing**
   - Test with modified workflows (nodes added/removed)
   - Test with changed node configurations
   - Verify blocking vs. warning scenarios

2. **Node Selection**
   - Test selecting different checkpoint types (complete, error, waiting)
   - Verify disabled state for non-replayable nodes
   - Test visual selection feedback

3. **Input Configuration**
   - Test with original input
   - Test with custom input
   - Test input validation

4. **Edge Cases**
   - Empty execution history
   - Executions with no checkpoints
   - Network errors during replay info fetch
   - Modal state management (open/close/reopen)

## Future Enhancements

Potential improvements for the replay feature:

1. **Replay Preview**: Show what will be re-executed before starting
2. **Batch Replay**: Replay multiple executions with different inputs
3. **Replay Templates**: Save common replay configurations
4. **Diff View**: Show differences between original and current workflow
5. **Replay History**: Track which executions are replays and their source
6. **Checkpoint Browser**: Advanced view to inspect checkpoint data
7. **Auto-retry**: Automatically retry failed executions with retry policies
