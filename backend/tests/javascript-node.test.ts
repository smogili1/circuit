import { DAGExecutionEngine } from '../src/orchestrator/engine';
import { Workflow } from '../src/workflows/types';
import '../src/orchestrator/executors';

describe('JavaScript Node Execution', () => {
  const baseWorkflow = (): Workflow => ({
    id: 'workflow-js',
    name: 'JavaScript Workflow',
    nodes: [],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it('should execute JavaScript and return result', async () => {
    const workflow = baseWorkflow();
    workflow.nodes = [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'js-1',
        type: 'javascript',
        position: { x: 150, y: 0 },
        data: {
          type: 'javascript',
          name: 'Transform',
          code: 'const { Input } = inputs; return String(Input.result).toUpperCase();',
          timeout: 1000,
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 300, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ];

    workflow.edges = [
      { id: 'e1', source: 'input-1', target: 'js-1' },
      { id: 'e2', source: 'js-1', target: 'output-1' },
    ];

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('hello');

    // JavaScript executor returns raw return value from user code
    expect(engine.getNodeState('js-1')?.output).toEqual('HELLO');
    expect(engine.getNodeState('output-1')?.output).toEqual('HELLO');
  });

  it('should respect input mappings', async () => {
    const workflow = baseWorkflow();
    workflow.nodes = [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Alpha' },
      },
      {
        id: 'input-2',
        type: 'input',
        position: { x: 0, y: 100 },
        data: { type: 'input', name: 'Beta' },
      },
      {
        id: 'js-1',
        type: 'javascript',
        position: { x: 150, y: 50 },
        data: {
          type: 'javascript',
          name: 'Select Inputs',
          code: 'return Object.keys(inputs);',
          inputMappings: [
            { nodeId: 'input-1', nodeName: 'Alpha', fields: [] },
          ],
        },
      },
    ];

    workflow.edges = [
      { id: 'e1', source: 'input-1', target: 'js-1' },
      { id: 'e2', source: 'input-2', target: 'js-1' },
    ];

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('test');

    // JavaScript executor returns raw return value from user code
    const output = engine.getNodeState('js-1')?.output as string[];
    expect(output?.sort()).toEqual(['Alpha']);
  });

  it('should include transitive predecessors when no mappings are provided', async () => {
    const workflow = baseWorkflow();
    workflow.nodes = [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'js-1',
        type: 'javascript',
        position: { x: 150, y: 0 },
        data: {
          type: 'javascript',
          name: 'Preprocess',
          code: 'return inputs.Input.result + \"-mid\";',
        },
      },
      {
        id: 'js-2',
        type: 'javascript',
        position: { x: 300, y: 0 },
        data: {
          type: 'javascript',
          name: 'Aggregator',
          code: 'const { Input, Preprocess } = inputs; return `${Input.result}|${Preprocess.result}`;',
        },
      },
    ];

    workflow.edges = [
      { id: 'e1', source: 'input-1', target: 'js-1' },
      { id: 'e2', source: 'js-1', target: 'js-2' },
    ];

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('seed');

    expect(engine.getNodeState('js-2')?.output).toEqual('seed|seed-mid');
  });

  it('should mark node as error when code throws', async () => {
    const workflow = baseWorkflow();
    workflow.nodes = [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'js-1',
        type: 'javascript',
        position: { x: 150, y: 0 },
        data: {
          type: 'javascript',
          name: 'Throws',
          code: 'throw new Error("boom");',
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 300, y: 0 },
        data: { type: 'output', name: 'Output' },
      },
    ];

    workflow.edges = [
      { id: 'e1', source: 'input-1', target: 'js-1' },
      { id: 'e2', source: 'js-1', target: 'output-1' },
    ];

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('ignored');

    expect(engine.getNodeState('js-1')?.status).toBe('error');
    // Downstream nodes should also be marked as error (error propagation)
    expect(engine.getNodeState('output-1')?.status).toBe('error');
  });

  it('should enforce timeout limits', async () => {
    const workflow = baseWorkflow();
    workflow.nodes = [
      {
        id: 'input-1',
        type: 'input',
        position: { x: 0, y: 0 },
        data: { type: 'input', name: 'Input' },
      },
      {
        id: 'js-1',
        type: 'javascript',
        position: { x: 150, y: 0 },
        data: {
          type: 'javascript',
          name: 'Timeout',
          code: 'while (true) {}',
          timeout: 20,
        },
      },
    ];

    workflow.edges = [
      { id: 'e1', source: 'input-1', target: 'js-1' },
    ];

    const engine = new DAGExecutionEngine(workflow);
    await engine.execute('ignored');

    expect(engine.getNodeState('js-1')?.status).toBe('error');
  });
});
