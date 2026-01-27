import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createWorkflow,
  getWorkflow,
  getAllWorkflows,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  initializeStorage,
  reloadWorkflows,
} from './workflows/storage.js';
import {
  initializeExecutionStorage,
  createExecutionSummary,
  appendExecutionEvent,
  applyExecutionEventToSummary,
  saveExecutionSummary,
  readExecutionSummary,
  listExecutionSummaries,
  readExecutionEvents,
  readExecutionCheckpoint,
  saveExecutionCheckpoint,
  updateExecutionSummary,
} from './executions/storage.js';
import type { ExecutionSummary } from './executions/storage.js';
import { DAGExecutionEngine } from './orchestrator/engine.js';
import { buildCheckpointState, buildReplayInfo, buildReplayPlan } from './orchestrator/replay.js';
import { validateWorkflow } from './orchestrator/validation.js';
import { ExecutionEvent, ControlEvent, Workflow, ApprovalResponse } from './workflows/types.js';
import { loadAllSchemas, getSchema, getDefaultConfig } from './schemas/index.js';
import { submitApproval, cancelAllApprovals } from './orchestrator/executors/index.js';
import { initializeMCPServerManager } from './mcp/server-manager.js';
import mcpRoutes from './mcp/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer);

// Middleware
app.use(express.json());

// MCP Server Routes
app.use('/api/mcp-servers', mcpRoutes);

interface ActiveExecution {
  engine: DAGExecutionEngine;
  workflowId: string;
  subscribedSockets: Set<string>;
  startedAt: Date;
}

// Map from executionId -> ActiveExecution
const activeExecutions = new Map<string, ActiveExecution>();

// Reverse mapping: socket.id -> Set<executionId>
const socketSubscriptions = new Map<string, Set<string>>();

// REST API Routes

// Get all workflows
app.get('/api/workflows', async (_req, res) => {
  // Reload from disk to pick up any external changes to YAML files
  await reloadWorkflows();
  const workflows = getAllWorkflows();
  res.json(workflows);
});

// Get a specific workflow
app.get('/api/workflows/:id', async (req, res) => {
  // Reload from disk to pick up any external changes to YAML files
  await reloadWorkflows();
  const workflow = getWorkflow(req.params.id);
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }
  res.json(workflow);
});

// Create a new workflow
app.post('/api/workflows', async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  try {
    const workflow = await createWorkflow(name, description);
    // Notify all clients about the new workflow
    io.emit('workflows', getAllWorkflows());
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Update a workflow
app.put('/api/workflows/:id', async (req, res) => {
  const { name, description, workingDirectory, nodes, edges } = req.body;
  // Only include defined properties to avoid overwriting with undefined
  const updates: Partial<Pick<Workflow, 'name' | 'description' | 'workingDirectory' | 'nodes' | 'edges'>> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (workingDirectory !== undefined) updates.workingDirectory = workingDirectory;
  if (nodes !== undefined) updates.nodes = nodes;
  if (edges !== undefined) updates.edges = edges;
  try {
    const workflow = await updateWorkflow(req.params.id, updates);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Delete a workflow
app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const success = await deleteWorkflow(req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    // Notify all clients about the deletion
    io.emit('workflows', getAllWorkflows());
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// Duplicate a workflow
app.post('/api/workflows/:id/duplicate', async (req, res) => {
  const { name } = req.body;
  try {
    const workflow = await duplicateWorkflow(req.params.id, name || 'Copy of workflow');
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    // Notify all clients about the new workflow
    io.emit('workflows', getAllWorkflows());
    res.status(201).json(workflow);
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate workflow' });
  }
});

// Schema API Routes

// Get all node schemas
app.get('/api/schemas', (_req, res) => {
  try {
    const schemas = loadAllSchemas();
    res.json(schemas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load schemas' });
  }
});

// Get a specific node schema
app.get('/api/schemas/:nodeType', (req, res) => {
  const schema = getSchema(req.params.nodeType);
  if (!schema) {
    res.status(404).json({ error: 'Schema not found' });
    return;
  }
  res.json(schema);
});

// Get default config for a node type
app.get('/api/schemas/:nodeType/default', (req, res) => {
  const schema = getSchema(req.params.nodeType);
  if (!schema) {
    res.status(404).json({ error: 'Schema not found' });
    return;
  }
  const config = getDefaultConfig(req.params.nodeType);
  res.json(config);
});

// Execution history API
app.get('/api/workflows/:id/executions', async (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }
  const summaries = await listExecutionSummaries(req.params.id);
  res.json(summaries);
});

app.get('/api/workflows/:id/executions/:executionId', async (req, res) => {
  const summary = await readExecutionSummary(req.params.id, req.params.executionId);
  if (!summary) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }
  res.json(summary);
});

app.get('/api/workflows/:id/executions/:executionId/events', async (req, res) => {
  const summary = await readExecutionSummary(req.params.id, req.params.executionId);
  if (!summary) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }
  const events = await readExecutionEvents(req.params.id, req.params.executionId);
  res.json(events);
});

app.get('/api/workflows/:id/executions/:executionId/replay-info', async (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  const summary = await readExecutionSummary(req.params.id, req.params.executionId);
  if (!summary) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }

  const checkpoint = await readExecutionCheckpoint(req.params.id, req.params.executionId);
  const replayInfo = buildReplayInfo(
    workflow,
    req.params.executionId,
    checkpoint,
    summary.workflowSnapshot
  );
  res.json(replayInfo);
});

app.get('/api/executions/running', (_req, res) => {
  const running = Array.from(activeExecutions.entries()).map(([executionId, exec]) => ({
    executionId,
    workflowId: exec.workflowId,
    startedAt: exec.startedAt.toISOString(),
    subscriberCount: exec.subscribedSockets.size,
  }));
  res.json(running);
});

// WebSocket Events
io.on('connection', async (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Reload from disk to pick up any external changes, then send workflow list
  await reloadWorkflows();
  socket.emit('workflows', getAllWorkflows());

  // Handle workflow updates
  socket.on('save-workflow', async (workflow: Workflow) => {
    try {
      const updated = await updateWorkflow(workflow.id, {
        name: workflow.name,
        description: workflow.description,
        workingDirectory: workflow.workingDirectory,
        nodes: workflow.nodes,
        edges: workflow.edges,
      });

      if (updated) {
        // Broadcast to all clients
        io.emit('workflow-updated', updated);
        socket.emit('workflow-saved', { success: true, workflow: updated });
      } else {
        socket.emit('workflow-saved', { success: false, error: 'Workflow not found' });
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      socket.emit('workflow-saved', {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save workflow',
      });
    }
  });

  // Handle execution control
  socket.on('control', async (event: ControlEvent) => {
    console.log(`[Socket] Received control event:`, event.type);
    switch (event.type) {
      case 'start-execution':
        console.log(`[Socket] Starting execution for workflow: ${event.workflowId}`);
        await handleStartExecution(socket, event.workflowId, event.input);
        break;

      case 'subscribe-execution':
        await handleSubscribeExecution(socket, event.executionId, event.afterTimestamp);
        break;

      case 'interrupt':
        await handleInterrupt(socket, event.executionId);
        break;

      case 'resume':
        // TODO: Implement resume functionality
        console.log('Resume not yet implemented');
        break;

      case 'replay-execution':
        await handleReplayExecution(
          socket,
          event.workflowId,
          event.sourceExecutionId,
          event.fromNodeId,
          event.useOriginalInput,
          event.input
        );
        break;

      case 'submit-approval':
        handleSubmitApproval(socket, event.executionId, event.nodeId, event.response);
        break;
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    const subscriptions = socketSubscriptions.get(socket.id);
    if (subscriptions) {
      for (const executionId of subscriptions) {
        const execution = activeExecutions.get(executionId);
        if (execution) {
          execution.subscribedSockets.delete(socket.id);
          console.log(
            `Removed socket ${socket.id} from execution ${executionId}. Remaining subscribers: ${execution.subscribedSockets.size}`
          );
        }
      }
    }

    socketSubscriptions.delete(socket.id);
  });
});

async function handleStartExecution(
  socket: Socket,
  workflowId: string,
  input: string
): Promise<void> {
  const workflow = getWorkflow(workflowId);

  if (!workflow) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'Workflow not found',
    } as ExecutionEvent);
    return;
  }

  // Validate workflow before execution
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    socket.emit('event', {
      type: 'validation-error',
      errors: validation.errors,
    } as ExecutionEvent);
    return;
  }

  // Create and start execution engine
  const engine = new DAGExecutionEngine(workflow, workflow.workingDirectory);
  const executionId = engine.getContext().executionId;
  try {
    await createExecutionSummary(workflow, executionId, input);
  } catch (error) {
    socket.emit('event', {
      type: 'execution-error',
      error: error instanceof Error ? error.message : 'Failed to persist execution',
    } as ExecutionEvent);
    return;
  }
  activeExecutions.set(executionId, {
    engine,
    workflowId: workflow.id,
    subscribedSockets: new Set([socket.id]),
    startedAt: new Date(),
  });

  if (!socketSubscriptions.has(socket.id)) {
    socketSubscriptions.set(socket.id, new Set());
  }
  socketSubscriptions.get(socket.id)!.add(executionId);

  let eventWriteChain = Promise.resolve();

  // Forward all events to subscribed clients
  engine.on('event', (event: ExecutionEvent) => {
    const execution = activeExecutions.get(executionId);
    if (execution) {
      for (const socketId of execution.subscribedSockets) {
        io.to(socketId).emit('event', event);
      }
    }
    const record = { timestamp: new Date().toISOString(), event };
    eventWriteChain = eventWriteChain
      .then(async () => {
        await appendExecutionEvent(workflow.id, executionId, record);

        if (
          event.type === 'execution-start' ||
          event.type === 'node-start' ||
          event.type === 'node-complete' ||
          event.type === 'node-error' ||
          event.type === 'execution-complete' ||
          event.type === 'execution-error'
        ) {
          const summary = await readExecutionSummary(workflow.id, executionId);
          if (summary) {
            const updated = applyExecutionEventToSummary(summary, record);
            await saveExecutionSummary(workflow.id, executionId, updated);
          }
        }
      })
      .catch((error) => {
        console.error('Failed to record execution event:', error);
      });
  });

  try {
    await engine.execute(input);
  } finally {
    await eventWriteChain;
    activeExecutions.delete(executionId);
    for (const [socketId, socketExecutionIds] of socketSubscriptions.entries()) {
      socketExecutionIds.delete(executionId);
      if (socketExecutionIds.size === 0) {
        socketSubscriptions.delete(socketId);
      }
    }
  }
}

async function handleSubscribeExecution(
  socket: Socket,
  executionId: string,
  afterTimestamp?: string
): Promise<void> {
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    // Execution not in memory - it's either completed or backend restarted
    // Client should rely on REST API for historical data
    socket.emit('event', {
      type: 'execution-error',
      error: 'Execution not active',
    } as ExecutionEvent);
    return;
  }

  execution.subscribedSockets.add(socket.id);

  if (!socketSubscriptions.has(socket.id)) {
    socketSubscriptions.set(socket.id, new Set());
  }
  socketSubscriptions.get(socket.id)!.add(executionId);

  console.log(`Socket ${socket.id} subscribed to execution ${executionId}${afterTimestamp ? ` (after ${afterTimestamp})` : ''}`);

  // Replay events that occurred after the client's last known timestamp
  const events = await readExecutionEvents(execution.workflowId, executionId);
  for (const record of events) {
    // If afterTimestamp provided, only send events that are newer
    if (afterTimestamp && record.timestamp <= afterTimestamp) {
      continue;
    }
    socket.emit('event', record.event);
  }
}

async function handleInterrupt(socket: Socket, executionId: string): Promise<void> {
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'No active execution to interrupt',
    } as ExecutionEvent);
    return;
  }

  if (!execution.subscribedSockets.has(socket.id)) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'Not authorized to interrupt this execution',
    } as ExecutionEvent);
    return;
  }

  // Cancel any pending approvals for this execution
  cancelAllApprovals(executionId);

  await execution.engine.interrupt();
}

function handleSubmitApproval(
  socket: Socket,
  executionId: string,
  nodeId: string,
  response: ApprovalResponse
): void {
  const execution = activeExecutions.get(executionId);

  if (!execution) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'No active execution found',
    } as ExecutionEvent);
    return;
  }

  if (!execution.subscribedSockets.has(socket.id)) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'Not authorized for this execution',
    } as ExecutionEvent);
    return;
  }

  const success = submitApproval(executionId, nodeId, response);

  if (!success) {
    socket.emit('event', {
      type: 'execution-error',
      error: 'No pending approval found for this node',
    } as ExecutionEvent);
  }
}

// Start server with initialization
async function startServer() {
  // Initialize storage (loads workflows from disk)
  console.log('Loading workflows from disk...');
  await initializeStorage();
  await initializeExecutionStorage();
  console.log(`Loaded ${getAllWorkflows().length} workflow(s)`);

  // Initialize MCP server manager
  console.log('Initializing MCP server manager...');
  const mcpManager = await initializeMCPServerManager();
  const mcpServers = await mcpManager.list();
  console.log(`Loaded ${mcpServers.length} MCP server(s)`);

  // Serve frontend
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Production: serve static files from frontend build
    const frontendDist = path.resolve(__dirname, '../../frontend/dist');
    console.log(`Serving static files from: ${frontendDist}`);
    app.use(express.static(frontendDist));

    // SPA fallback - serve index.html for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  } else {
    // Development: use Vite as middleware for HMR
    const { createServer: createViteServer } = await import('vite');
    const frontendRoot = path.resolve(__dirname, '../../frontend');
    const vite = await createViteServer({
      root: frontendRoot,
      configFile: path.join(frontendRoot, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite dev middleware enabled');
  }

  // Start server
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Mode: ${isProd ? 'production' : 'development'}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
