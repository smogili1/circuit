# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About

Drag-and-drop DAG editor for orchestrating Claude Code and OpenAI Codex agents. Execute multi-step workflows with real-time streaming, reference interpolation between nodes, and flexible control flow.

## Commands

```bash
# Development (unified server on port 3001)
npm install              # Install all dependencies
make dev-start           # Start server in background with hot reload (logs to .logs/)
make logs                # Tail server logs
make dev-stop            # Stop server

# Testing
npm test                 # All tests
cd backend && npm test   # Backend Jest tests
cd frontend && npm test  # Frontend Vitest tests

# Building
npm run build            # Build both packages
```

### Development Server Guidelines

**IMPORTANT:** Dev server is typically already running in hot reload mode. Code changes are automatically picked up without restarting.

- **DO NOT** manually restart the server - hot reload handles code changes automatically
- If a restart is truly necessary, use the background make commands:
  ```bash
  make dev-stop    # Stop existing server first
  make dev-start   # Start server in background with hot reload
  ```
- Check server logs with `make logs` to verify status
- App available at http://localhost:3001

## Architecture

### Three-Layer Design

**Backend** (`backend/src/`) - Node.js + Express + Socket.io
- `index.ts` - Server setup, REST API, WebSocket handlers
- `orchestrator/engine.ts` - DAGExecutionEngine: topological execution with parallel branches
- `orchestrator/references.ts` - `{{NodeName.field}}` interpolation
- `agents/claude.ts` - Claude Agent SDK wrapper with streaming
- `agents/codex.ts` - OpenAI Codex SDK wrapper
- `workflows/storage.ts` - YAML-based persistence

**Frontend** (`frontend/src/`) - React + Vite + Tailwind
- `stores/workflowStore.ts` - Zustand state with React Flow integration
- `hooks/useSocket.ts` - WebSocket connection and event handling
- `components/Canvas/` - React Flow DAG editor
- `components/Nodes/` - Node type components (Claude, Codex, Input, Output, etc.)
- `components/Execution/` - Execution panel, timeline, logs

**Communication**
- REST API for workflow CRUD (`/api/workflows`)
- WebSocket for real-time execution events and workflow sync

### DAG Execution Model

The engine executes nodes in topological order:
1. Find nodes with all predecessors complete
2. Execute ready nodes in parallel
3. Store outputs in ExecutionContext
4. Emit WebSocket events for each lifecycle stage

**Node Types**: `input`, `claude-agent`, `codex-agent`, `condition`, `merge`, `output`

### Reference System

Nodes reference upstream outputs: `{{NodeName.field}}`
- Nested paths: `{{PlanAgent.output.details.step1}}`
- Special fields: `.result`, `.transcript`
- Used in: userQuery, systemPrompt, condition patterns

### Key Types

```typescript
interface Workflow {
  id: string
  name: string
  workingDirectory?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

interface ExecutionContext {
  executionId: string
  nodeOutputs: Map<nodeId, output>
  variables: Map<string, value>
}

type NodeStatus = 'pending' | 'running' | 'complete' | 'error' | 'skipped'
```

## WebSocket Events

**Client → Server:**
- `save-workflow` - Persist changes
- `control` - `{type: 'start-execution' | 'interrupt' | 'resume', ...}`

**Server → Client:**
- `workflows` - Workflow list updates
- `event` - Execution events: `execution-start`, `node-start`, `node-output`, `node-complete`, `execution-complete`

## Extending

**New node type:**
1. Add case in `DAGExecutionEngine.executeNode()` (backend)
2. Create component in `components/Nodes/` (frontend)
3. Add to node type registry

**New agent tool:**
- Add to `ClaudeNodeConfig.tools` array
- Agent SDK handles tool execution
