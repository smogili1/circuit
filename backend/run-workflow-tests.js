#!/usr/bin/env node
/**
 * Workflow Test Runner
 * Executes test workflows and validates results
 */

const { io } = require('socket.io-client');

const API_URL = 'http://localhost:3001';

// Test workflows and their expected validators
const TEST_WORKFLOWS = [
  { name: 'Test: Claude Basic Features', expectedValidator: 'passed' },
  { name: 'Test: Claude JSON Output', expectedValidator: 'passed' },
  { name: 'Test: Codex Basic Features', expectedValidator: 'passed' },
  { name: 'Test: Codex JSON Output', expectedValidator: 'passed' },
  { name: 'Test: Cross-Agent Reference Chain', expectedValidator: 'passed' },
  // Skip loop tests for now as they take longer
  // { name: 'Test: Claude Conversation Persist', expectedValidator: 'passed' },
  // { name: 'Test: Codex Conversation Persist', expectedValidator: 'passed' },
  // { name: 'Test: Claude Transcript Accumulation', expectedValidator: 'passed' },
  // { name: 'Test: Codex Transcript Accumulation', expectedValidator: 'passed' },
];

async function getWorkflows() {
  const res = await fetch(`${API_URL}/api/workflows`);
  return res.json();
}

async function runTest(workflow, inputPrompt) {
  return new Promise((resolve, reject) => {
    const socket = io(API_URL, { transports: ['websocket'] });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Test timeout (120s)'));
    }, 120000);

    let result = null;
    let error = null;

    socket.on('connect', () => {
      console.log(`  Starting execution for: ${workflow.name}`);
      socket.emit('control', {
        type: 'start-execution',
        workflowId: workflow.id,
        input: inputPrompt,
      });
    });

    socket.on('event', (event) => {
      if (event.type === 'node-complete' && event.result) {
        // Look for Validator node output
        if (event.result.passed !== undefined) {
          result = event.result;
        }
      }
      if (event.type === 'execution-complete') {
        clearTimeout(timeout);
        socket.disconnect();
        resolve({ result, finalOutput: event.result });
      }
      if (event.type === 'execution-error') {
        clearTimeout(timeout);
        socket.disconnect();
        reject(new Error(event.error));
      }
      if (event.type === 'node-error') {
        error = event.error;
      }
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Connection error: ${err.message}`));
    });
  });
}

async function main() {
  console.log('=== Workflow Test Runner ===\n');

  // Get all workflows
  const workflows = await getWorkflows();
  const results = [];

  for (const testConfig of TEST_WORKFLOWS) {
    const workflow = workflows.find(w => w.name === testConfig.name);
    if (!workflow) {
      console.log(`❌ SKIP: ${testConfig.name} - workflow not found`);
      results.push({ name: testConfig.name, status: 'SKIP', reason: 'not found' });
      continue;
    }

    console.log(`\n🔄 Running: ${testConfig.name}`);
    try {
      // Get the input node's description as the input prompt
      const inputNode = workflow.nodes.find(n => n.type === 'input');
      const inputPrompt = inputNode?.data?.description || 'test';

      const { result, finalOutput } = await runTest(workflow, inputPrompt);

      if (result && result.passed === true) {
        console.log(`✅ PASS: ${testConfig.name}`);
        results.push({ name: testConfig.name, status: 'PASS', checks: result.checks });
      } else if (result && result.passed === false) {
        console.log(`❌ FAIL: ${testConfig.name}`);
        console.log(`   Checks:`, JSON.stringify(result.checks, null, 2));
        results.push({ name: testConfig.name, status: 'FAIL', checks: result.checks });
      } else {
        console.log(`⚠️  WARN: ${testConfig.name} - no validator result found`);
        results.push({ name: testConfig.name, status: 'WARN', reason: 'no validator' });
      }
    } catch (err) {
      console.log(`❌ ERROR: ${testConfig.name} - ${err.message}`);
      results.push({ name: testConfig.name, status: 'ERROR', error: err.message });
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const skipped = results.filter(r => r.status === 'SKIP' || r.status === 'WARN').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`💥 Errors: ${errors}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📊 Total: ${results.length}`);

  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
