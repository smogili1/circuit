import { Workflow, WorkflowNode, WorkflowEdge } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import { promises as fs } from 'fs';
import path from 'path';

// Directory for storing workflow YAML files (in top-level data/ folder)
const WORKFLOWS_DIR = process.env.WORKFLOWS_DIR || path.join(process.cwd(), '..', 'data', 'workflows');

// In-memory cache for workflows
const workflowCache = new Map<string, Workflow>();
// Separate cache for test workflows (not shown in UI)
const testWorkflowCache = new Map<string, Workflow>();
let initialized = false;

/**
 * Ensure workflows directory exists
 */
async function ensureWorkflowsDir(): Promise<void> {
  try {
    await fs.mkdir(WORKFLOWS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Get the file path for a workflow
 */
function getWorkflowPath(id: string): string {
  // Use workflow name if available, otherwise use ID
  const workflow = workflowCache.get(id);
  const filename = workflow?.name
    ? `${workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.yaml`
    : `${id}.yaml`;
  return path.join(WORKFLOWS_DIR, filename);
}

/**
 * Convert workflow to YAML-friendly format (dates to ISO strings)
 */
function workflowToYaml(workflow: Workflow): Record<string, unknown> {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    workingDirectory: workflow.workingDirectory,
    nodes: workflow.nodes,
    edges: workflow.edges,
    createdAt: workflow.createdAt instanceof Date
      ? workflow.createdAt.toISOString()
      : workflow.createdAt,
    updatedAt: workflow.updatedAt instanceof Date
      ? workflow.updatedAt.toISOString()
      : workflow.updatedAt,
  };
}

/**
 * Ensure workflow has exactly one input and one output node.
 * Adds missing nodes, logs warnings for duplicates.
 */
function migrateWorkflow(workflow: Workflow): Workflow {
  const nodes = [...workflow.nodes];
  let modified = false;

  // Check for input node
  const inputNodes = nodes.filter((n) => n.type === 'input');
  if (inputNodes.length === 0) {
    console.log(`[Migration] Adding input node to workflow: ${workflow.name}`);
    nodes.unshift({
      id: uuidv4(),
      type: 'input',
      position: { x: 100, y: 200 },
      data: {
        type: 'input',
        name: 'Input',
        description: 'Enter your prompt',
      },
    });
    modified = true;
  } else if (inputNodes.length > 1) {
    console.warn(
      `[Migration] Workflow "${workflow.name}" has ${inputNodes.length} input nodes - only 1 allowed`
    );
  }

  // Check for output node
  const outputNodes = nodes.filter((n) => n.type === 'output');
  if (outputNodes.length === 0) {
    console.log(`[Migration] Adding output node to workflow: ${workflow.name}`);
    nodes.push({
      id: uuidv4(),
      type: 'output',
      position: { x: 700, y: 200 },
      data: {
        type: 'output',
        name: 'Output',
      },
    });
    modified = true;
  } else if (outputNodes.length > 1) {
    console.warn(
      `[Migration] Workflow "${workflow.name}" has ${outputNodes.length} output nodes - only 1 allowed`
    );
  }

  if (modified) {
    return { ...workflow, nodes };
  }

  return workflow;
}

/**
 * Convert YAML data back to Workflow
 */
function yamlToWorkflow(data: Record<string, unknown>): Workflow {
  const workflow: Workflow = {
    id: data.id as string,
    name: data.name as string,
    description: data.description as string | undefined,
    workingDirectory: data.workingDirectory as string | undefined,
    nodes: data.nodes as WorkflowNode[],
    edges: data.edges as WorkflowEdge[],
    createdAt: new Date(data.createdAt as string),
    updatedAt: new Date(data.updatedAt as string),
  };

  // Migrate: ensure exactly one input and output node
  return migrateWorkflow(workflow);
}

/**
 * Save a workflow to disk as YAML
 */
async function saveWorkflowToDisk(workflow: Workflow): Promise<void> {
  await ensureWorkflowsDir();

  const yamlContent = yaml.dump(workflowToYaml(workflow), {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  const filePath = getWorkflowPath(workflow.id);
  await fs.writeFile(filePath, yamlContent, 'utf-8');
}

/**
 * Load workflows from a directory into a cache
 */
async function loadWorkflowsFromDir(dir: string, cache: Map<string, Workflow>): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      try {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = yaml.load(content) as Record<string, unknown>;

        if (data && data.id) {
          const workflow = yamlToWorkflow(data);
          cache.set(workflow.id, workflow);
        }
      } catch (error) {
        console.error(`Failed to load workflow from ${file}:`, error);
      }
    }
  } catch (error) {
    // Directory might not exist
  }
}

/**
 * Load all workflows from disk
 */
async function loadWorkflowsFromDisk(): Promise<void> {
  await ensureWorkflowsDir();

  // Load user workflows
  await loadWorkflowsFromDir(WORKFLOWS_DIR, workflowCache);

  // Load test workflows from tests/ subdirectory
  const testsDir = path.join(WORKFLOWS_DIR, 'tests');
  await loadWorkflowsFromDir(testsDir, testWorkflowCache);
}

/**
 * Initialize storage by loading workflows from disk
 */
export async function initializeStorage(): Promise<void> {
  if (initialized) return;

  await loadWorkflowsFromDisk();
  initialized = true;

  // Create sample workflow if no workflows exist
  if (workflowCache.size === 0) {
    await initializeSampleWorkflow();
  }
}

/**
 * Create a new workflow with auto-added input and output nodes
 */
export async function createWorkflow(
  name: string,
  description?: string
): Promise<Workflow> {
  const now = new Date();
  const inputNodeId = uuidv4();
  const outputNodeId = uuidv4();

  const workflow: Workflow = {
    id: uuidv4(),
    name,
    description,
    nodes: [
      {
        id: inputNodeId,
        type: 'input',
        position: { x: 100, y: 200 },
        data: {
          type: 'input',
          name: 'Input',
          description: 'Enter your prompt',
        },
      },
      {
        id: outputNodeId,
        type: 'output',
        position: { x: 700, y: 200 },
        data: {
          type: 'output',
          name: 'Output',
        },
      },
    ],
    edges: [],
    createdAt: now,
    updatedAt: now,
  };

  workflowCache.set(workflow.id, workflow);
  await saveWorkflowToDisk(workflow);

  return workflow;
}

/**
 * Get a workflow by ID (checks both user and test workflows)
 */
export function getWorkflow(id: string): Workflow | undefined {
  return workflowCache.get(id) || testWorkflowCache.get(id);
}

/**
 * Get all workflows
 */
export function getAllWorkflows(): Workflow[] {
  return Array.from(workflowCache.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Update a workflow
 */
export async function updateWorkflow(
  id: string,
  updates: Partial<Pick<Workflow, 'name' | 'description' | 'workingDirectory' | 'nodes' | 'edges'>>
): Promise<Workflow | undefined> {
  const workflow = workflowCache.get(id);
  if (!workflow) return undefined;

  // If name changed, delete old file
  const oldPath = getWorkflowPath(id);

  const updated: Workflow = {
    ...workflow,
    ...updates,
    updatedAt: new Date(),
  };

  workflowCache.set(id, updated);

  // Delete old file if name changed
  if (updates.name && updates.name !== workflow.name) {
    try {
      await fs.unlink(oldPath);
    } catch {
      // Old file might not exist
    }
  }

  await saveWorkflowToDisk(updated);

  return updated;
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(id: string): Promise<boolean> {
  const workflow = workflowCache.get(id);
  if (!workflow) return false;

  // Delete the file
  try {
    const filePath = getWorkflowPath(id);
    await fs.unlink(filePath);
  } catch {
    // File might not exist
  }

  return workflowCache.delete(id);
}

/**
 * Duplicate a workflow
 */
export async function duplicateWorkflow(id: string, newName: string): Promise<Workflow | undefined> {
  const original = workflowCache.get(id);
  if (!original) return undefined;

  const now = new Date();
  const duplicate: Workflow = {
    ...original,
    id: uuidv4(),
    name: newName,
    createdAt: now,
    updatedAt: now,
  };

  workflowCache.set(duplicate.id, duplicate);
  await saveWorkflowToDisk(duplicate);

  return duplicate;
}

/**
 * Initialize with a sample workflow
 */
export async function initializeSampleWorkflow(): Promise<Workflow> {
  const sample = await createWorkflow(
    'Sample Workflow',
    'A simple example workflow with Claude and Codex agents'
  );

  sample.nodes = [
    {
      id: 'input-1',
      type: 'input',
      position: { x: 100, y: 200 },
      data: {
        type: 'input',
        name: 'User Input',
        description: 'Enter your task description',
      },
    },
    {
      id: 'claude-1',
      type: 'claude-agent',
      position: { x: 400, y: 100 },
      data: {
        type: 'claude-agent',
        name: 'Code Analyzer',
        userQuery: 'Analyze the input and summarize key findings.',
        model: 'sonnet',
        tools: ['Read', 'Glob', 'Grep'],
        systemPrompt: 'You are a code analysis expert.',
      },
    },
    {
      id: 'codex-1',
      type: 'codex-agent',
      position: { x: 400, y: 300 },
      data: {
        type: 'codex-agent',
        name: 'Code Generator',
        userQuery: 'Implement the requested changes based on the input.',
        model: 'gpt-5.2-codex',
        approvalPolicy: 'never',
        sandbox: 'workspace-write',
      },
    },
    {
      id: 'output-1',
      type: 'output',
      position: { x: 700, y: 200 },
      data: {
        type: 'output',
        name: 'Final Result',
      },
    },
  ];

  sample.edges = [
    { id: 'e1', source: 'input-1', target: 'claude-1' },
    { id: 'e2', source: 'input-1', target: 'codex-1' },
    { id: 'e3', source: 'claude-1', target: 'output-1' },
    { id: 'e4', source: 'codex-1', target: 'output-1' },
  ];

  await updateWorkflow(sample.id, { nodes: sample.nodes, edges: sample.edges });
  return sample;
}

/**
 * Reload workflows from disk (useful for hot-reloading)
 */
export async function reloadWorkflows(): Promise<void> {
  workflowCache.clear();
  initialized = false;
  await initializeStorage();
}
