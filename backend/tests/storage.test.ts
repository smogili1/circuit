import {
  createWorkflow,
  getWorkflow,
  getAllWorkflows,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  initializeStorage,
} from '../src/workflows/storage';
import { WorkflowNode, WorkflowEdge } from '../src/workflows/types';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(''),
    readdir: jest.fn().mockResolvedValue([]),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Workflow Storage', () => {
  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockFs.readdir.mockResolvedValue([]);

    // Initialize storage (clears cache)
    // Clear by getting all and deleting
    const workflows = getAllWorkflows();
    for (const w of workflows) {
      await deleteWorkflow(w.id);
    }
  });

  describe('createWorkflow', () => {
    it('should create a workflow with name and description', async () => {
      const workflow = await createWorkflow('Test Workflow', 'Test Description');

      expect(workflow.id).toBeDefined();
      expect(workflow.name).toBe('Test Workflow');
      expect(workflow.description).toBe('Test Description');
      // Auto-adds input and output nodes
      expect(workflow.nodes.length).toBe(2);
      expect(workflow.nodes.some(n => n.type === 'input')).toBe(true);
      expect(workflow.nodes.some(n => n.type === 'output')).toBe(true);
      expect(workflow.edges).toEqual([]);
      expect(workflow.createdAt).toBeInstanceOf(Date);
      expect(workflow.updatedAt).toBeInstanceOf(Date);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should create a workflow without description', async () => {
      const workflow = await createWorkflow('Name Only');

      expect(workflow.name).toBe('Name Only');
      expect(workflow.description).toBeUndefined();
    });
  });

  describe('getWorkflow', () => {
    it('should return workflow by id', async () => {
      const created = await createWorkflow('Get Test');
      const retrieved = getWorkflow(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent id', () => {
      const result = getWorkflow('non-existent-id');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllWorkflows', () => {
    it('should return empty array when no workflows exist', () => {
      const workflows = getAllWorkflows();

      expect(workflows).toEqual([]);
    });

    it('should return all created workflows', async () => {
      await createWorkflow('First');
      await createWorkflow('Second');
      await createWorkflow('Third');

      const all = getAllWorkflows();

      expect(all.length).toBe(3);
      expect(all.map((w) => w.name).sort()).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow name', async () => {
      const created = await createWorkflow('Original');
      const updated = await updateWorkflow(created.id, { name: 'Updated' });

      expect(updated?.name).toBe('Updated');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime()
      );
    });

    it('should update workflow nodes and edges', async () => {
      const created = await createWorkflow('Test');

      const nodes: WorkflowNode[] = [
        {
          id: 'node-1',
          type: 'input',
          position: { x: 0, y: 0 },
          data: { type: 'input', name: 'Input' },
        },
      ];

      const edges: WorkflowEdge[] = [
        { id: 'edge-1', source: 'node-1', target: 'node-2' },
      ];

      const updated = await updateWorkflow(created.id, { nodes, edges });

      expect(updated?.nodes).toEqual(nodes);
      expect(updated?.edges).toEqual(edges);
    });

    it('should return undefined for non-existent workflow', async () => {
      const result = await updateWorkflow('fake-id', { name: 'New Name' });

      expect(result).toBeUndefined();
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete existing workflow', async () => {
      const created = await createWorkflow('To Delete');
      const result = await deleteWorkflow(created.id);

      expect(result).toBe(true);
      expect(getWorkflow(created.id)).toBeUndefined();
    });

    it('should return false for non-existent workflow', async () => {
      const result = await deleteWorkflow('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('duplicateWorkflow', () => {
    it('should create a copy with new name', async () => {
      const original = await createWorkflow('Original', 'Description');
      await updateWorkflow(original.id, {
        nodes: [
          {
            id: 'node-1',
            type: 'input',
            position: { x: 100, y: 100 },
            data: { type: 'input', name: 'Input' },
          },
        ],
      });

      const duplicate = await duplicateWorkflow(original.id, 'Copy of Original');

      expect(duplicate).toBeDefined();
      expect(duplicate?.id).not.toBe(original.id);
      expect(duplicate?.name).toBe('Copy of Original');
      expect(duplicate?.nodes.length).toBe(1);
    });

    it('should return undefined for non-existent workflow', async () => {
      const result = await duplicateWorkflow('fake-id', 'Copy');

      expect(result).toBeUndefined();
    });
  });
});
