import { readEvolutionHistory } from '../../../src/orchestrator/evolution-applier';
import type { EvolutionHistoryRecord } from '../../../src/orchestrator/evolution-applier';
import * as fs from 'fs/promises';

// Mock file system
jest.mock('fs/promises');

describe('Evolution History API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readEvolutionHistory', () => {
    it('should read and parse evolution history from JSONL file', async () => {
      const record1: EvolutionHistoryRecord = {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'auto-apply',
        evolution: {
          reasoning: 'First evolution',
          mutations: [
            {
              op: 'update-model',
              nodeId: 'agent-1',
              newModel: 'opus',
            },
          ],
          expectedImpact: 'Better quality',
        },
        applied: true,
        beforeSnapshot: {
          id: 'workflow-1',
          name: 'Test',
          nodes: [],
          edges: [],
          capturedAt: new Date('2024-01-01T09:59:00Z'),
        },
        afterSnapshot: {
          id: 'workflow-1',
          name: 'Test',
          nodes: [],
          edges: [],
          capturedAt: new Date('2024-01-01T10:00:00Z'),
        },
      };

      const record2: EvolutionHistoryRecord = {
        timestamp: new Date('2024-01-01T11:00:00Z'),
        workflowId: 'workflow-1',
        executionId: 'exec-2',
        nodeId: 'self-1',
        mode: 'suggest',
        evolution: {
          reasoning: 'Second evolution',
          mutations: [],
          expectedImpact: 'None',
        },
        applied: false,
      };

      const jsonlContent = `${JSON.stringify(record1)}\n${JSON.stringify(record2)}\n`;
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(2);
      expect(history[0].executionId).toBe('exec-1');
      expect(history[0].applied).toBe(true);
      expect(history[1].executionId).toBe('exec-2');
      expect(history[1].applied).toBe(false);
    });

    it('should return empty array when file does not exist', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT: file not found'));

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toEqual([]);
    });

    it('should filter out empty lines', async () => {
      const record: EvolutionHistoryRecord = {
        timestamp: new Date(),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'dry-run',
        evolution: {
          reasoning: 'Test',
          mutations: [],
          expectedImpact: 'None',
        },
        applied: false,
      };

      const jsonlContent = `${JSON.stringify(record)}\n\n\n${JSON.stringify(record)}\n`;
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(2);
    });

    it('should parse records in chronological order', async () => {
      const records = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-1',
          nodeId: 'self-1',
          mode: 'auto-apply',
          evolution: { reasoning: '1', mutations: [], expectedImpact: 'None' },
          applied: true,
        },
        {
          timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-2',
          nodeId: 'self-1',
          mode: 'auto-apply',
          evolution: { reasoning: '2', mutations: [], expectedImpact: 'None' },
          applied: true,
        },
        {
          timestamp: new Date('2024-01-01T12:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-3',
          nodeId: 'self-1',
          mode: 'auto-apply',
          evolution: { reasoning: '3', mutations: [], expectedImpact: 'None' },
          applied: true,
        },
      ];

      const jsonlContent = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(3);
      expect(history[0].evolution.reasoning).toBe('1');
      expect(history[1].evolution.reasoning).toBe('2');
      expect(history[2].evolution.reasoning).toBe('3');
    });

    it('should include all record fields', async () => {
      const record: EvolutionHistoryRecord = {
        timestamp: new Date('2024-01-01T10:00:00Z'),
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'suggest',
        evolution: {
          reasoning: 'Test evolution',
          mutations: [
            {
              op: 'update-model',
              nodeId: 'agent-1',
              newModel: 'opus',
            },
          ],
          expectedImpact: 'Better quality',
          riskAssessment: 'Low risk',
          rollbackPlan: 'Revert to sonnet',
        },
        applied: true,
        approvalResponse: {
          approved: true,
          comment: 'Looks good',
          reviewedBy: 'user@example.com',
          reviewedAt: new Date('2024-01-01T10:05:00Z'),
        },
        beforeSnapshot: {
          id: 'workflow-1',
          name: 'Test',
          nodes: [{ id: 'agent-1', type: 'claude-agent', position: { x: 0, y: 0 }, data: { model: 'sonnet' } }],
          edges: [],
          capturedAt: new Date('2024-01-01T09:59:00Z'),
        },
        afterSnapshot: {
          id: 'workflow-1',
          name: 'Test',
          nodes: [{ id: 'agent-1', type: 'claude-agent', position: { x: 0, y: 0 }, data: { model: 'opus' } }],
          edges: [],
          capturedAt: new Date('2024-01-01T10:00:00Z'),
        },
      };

      const jsonlContent = JSON.stringify(record) + '\n';
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        nodeId: 'self-1',
        mode: 'suggest',
        applied: true,
      });
      expect(history[0].evolution).toHaveProperty('reasoning');
      expect(history[0].evolution).toHaveProperty('mutations');
      expect(history[0].evolution).toHaveProperty('expectedImpact');
      expect(history[0].approvalResponse).toBeDefined();
      expect(history[0].beforeSnapshot).toBeDefined();
      expect(history[0].afterSnapshot).toBeDefined();
    });
  });

  describe('Evolution history tracking scenarios', () => {
    it('should track multiple evolutions across executions', async () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        timestamp: new Date(`2024-01-01T${10 + i}:00:00Z`).toISOString(),
        workflowId: 'workflow-1',
        executionId: `exec-${i + 1}`,
        nodeId: 'self-1',
        mode: 'auto-apply',
        evolution: {
          reasoning: `Evolution ${i + 1}`,
          mutations: [],
          expectedImpact: 'None',
        },
        applied: true,
      }));

      const jsonlContent = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(5);
      history.forEach((record, i) => {
        expect(record.executionId).toBe(`exec-${i + 1}`);
      });
    });

    it('should track both applied and rejected evolutions', async () => {
      const records = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-1',
          nodeId: 'self-1',
          mode: 'auto-apply',
          evolution: { reasoning: 'Auto applied', mutations: [], expectedImpact: 'None' },
          applied: true,
        },
        {
          timestamp: new Date('2024-01-01T11:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-2',
          nodeId: 'self-1',
          mode: 'suggest',
          evolution: { reasoning: 'Rejected', mutations: [], expectedImpact: 'None' },
          applied: false,
          approvalResponse: {
            approved: false,
            comment: 'Not ready',
            reviewedBy: 'user@example.com',
          },
        },
        {
          timestamp: new Date('2024-01-01T12:00:00Z').toISOString(),
          workflowId: 'workflow-1',
          executionId: 'exec-3',
          nodeId: 'self-1',
          mode: 'dry-run',
          evolution: { reasoning: 'Dry run', mutations: [], expectedImpact: 'None' },
          applied: false,
        },
      ];

      const jsonlContent = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      (fs.readFile as jest.Mock).mockResolvedValue(jsonlContent);

      const history = await readEvolutionHistory('workflow-1');

      expect(history).toHaveLength(3);
      expect(history.filter((r) => r.applied)).toHaveLength(1);
      expect(history.filter((r) => !r.applied)).toHaveLength(2);
    });
  });
});
