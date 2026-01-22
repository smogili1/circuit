# Circuit

Circuit is a drag-and-drop workflow designer and execution engine for orchestrating multi-step Claude Code and OpenAI Codex agents. It can execute multi-step workflows with real-time streaming, reference interpolation between nodes, and flexible control flow.

![Circuit](Circuit.png)

## Features

- **Visual Workflow Editor** - Drag-and-drop interface for building agent workflows
- **Multi-Agent Support** - Claude Code and OpenAI Codex agent nodes
- **Control Flow** - Condition and merge nodes for branching logic
- **Workflow Persistence** - Save and load workflows as YAML, allowing you to vibe code workflows

## Quick Start

### Prerequisites

- Node.js 18+

### Authentication

To use agent nodes, you need to authenticate with the respective provider:

**Option 1: Environment Variables**
```bash
export ANTHROPIC_API_KEY=your-anthropic-key   # For Claude Agent nodes
export OPENAI_API_KEY=your-openai-key         # For Codex Agent nodes
```

**Option 2: OAuth Login**

Login via Oauth in the Claude Code/Codex CLI on the machine where workflows will execute.

### Installation

```bash
# Clone the repository
git clone https://github.com/smogili2/circuit.git
cd circuit

# Install dependencies
npm install
```

### Running

```bash
# Start development server (recommended)
make dev-start

# View logs
make logs

# Stop server
make dev-stop
```

The app runs at **http://localhost:3001**

### Alternative: Foreground Mode

```bash
npm run dev
```

### Docker

```bash
# Quick start with docker-compose
docker-compose up -d

# Or build and run manually
docker build -t circuit .
docker run -d -p 3001:3001 -v circuit-data:/app/data circuit
```

Data is persisted in the `circuit-data` volume (`/app/data` in the container).

#### Docker Authentication

Set API keys as environment variables before running:
```bash
export ANTHROPIC_API_KEY=your-key
export OPENAI_API_KEY=your-key
docker-compose up -d
```

Or pass them directly with docker run:
```bash
docker run -d -p 3001:3001 \
  -v circuit-data:/app/data \
  -e ANTHROPIC_API_KEY=your-key \
  -e OPENAI_API_KEY=your-key \
  circuit
```

## Development Commands

| Command | Description |
|---------|-------------|
| `make dev-start` | Start server in background with hot reload |
| `make dev-stop` | Stop background server |
| `make logs` | Tail server logs |
| `make test` | Run all tests |
| `make build` | Build for production |

## Project Structure

```
circuit/
├── backend/                 # Node.js + Express + Socket.io
│   └── src/
│       ├── index.ts         # Server setup, REST API, WebSocket
│       ├── agents/          # Claude and Codex agent wrappers
│       ├── orchestrator/    # DAG execution engine
│       └── workflows/       # YAML persistence
├── frontend/                # React + Vite + Tailwind
│   └── src/
│       ├── App.tsx          # Main application
│       ├── components/      # React Flow canvas, node types
│       ├── stores/          # Zustand state management
│       └── hooks/           # WebSocket and utilities
├── Makefile                 # Development commands
├── Dockerfile               # Container build
├── docker-compose.yml       # Container orchestration
└── package.json             # Workspace configuration
```

## Node Types

| Type | Description |
|------|-------------|
| **Input** | Starting point with initial data |
| **Claude Agent** | Claude Code execution with tools |
| **Codex Agent** | OpenAI Codex execution |
| **Condition** | Branch based on expression |
| **Merge** | Combine multiple branches |
| **Output** | Workflow result |

## Reference System

Nodes can reference outputs from upstream nodes:

```
{{PlanAgent.result}}              # Full result
{{DataFetcher.output.items}}      # Nested path
{{Analyzer.transcript}}           # Agent transcript
```

## API

### REST Endpoints

- `GET /api/workflows` - List all workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow
- `PUT /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow

### WebSocket Events

**Client to Server:**
- `save-workflow` - Persist workflow changes
- `control` - Start/interrupt/resume execution

**Server to Client:**
- `workflows` - Workflow list updates
- `event` - Execution lifecycle events

## Testing

```bash
# All tests
make test

# Backend only
make test-backend

# Frontend only
make test-frontend
```

## License

Apache 2.0
