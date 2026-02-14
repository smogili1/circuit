#!/usr/bin/env node
/**
 * Comprehensive test runner for the Circuit backend.
 * Runs unit tests with coverage and workflow integration tests.
 *
 * Usage:
 *   node scripts/test-runner.js           # Run all tests
 *   node scripts/test-runner.js --unit    # Unit tests only
 *   node scripts/test-runner.js --workflow # Workflow tests only
 *   node scripts/test-runner.js --quick   # Skip expensive workflow tests (03, 04)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';
const TIMEOUT_MS = 120000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKFLOW_IDS = [
  'claude-01-basic',
  'claude-02-json',
  'claude-03-persist',
  'claude-04-transcript',
  'codex-01-basic',
  'codex-02-json',
  'codex-03-persist',
  'codex-04-transcript',
  'agents-05-chain',
];

const QUICK_WORKFLOW_IDS = [
  'claude-01-basic',
  'claude-02-json',
  'codex-01-basic',
  'codex-02-json',
  'agents-05-chain',
];

// Parse arguments
const args = process.argv.slice(2);
const unitOnly = args.includes('--unit');
const workflowOnly = args.includes('--workflow');
const quickMode = args.includes('--quick');
const verbose = args.includes('--verbose') || args.includes('-v');

// Results tracking
const results = {
  unit: { passed: 0, failed: 0, coverage: null },
  workflow: { passed: 0, failed: 0, errors: 0, details: [] },
};

async function runUnitTests() {
  console.log('\n' + '='.repeat(60));
  console.log('UNIT TESTS WITH COVERAGE');
  console.log('='.repeat(60) + '\n');

  return new Promise((resolve) => {
    const jest = spawn('npx', ['jest', '--coverage', '--coverageReporters=text', '--coverageReporters=text-summary'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    let coverageData = null;

    jest.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    jest.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    jest.on('close', (code) => {
      // Parse test results
      const testMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (testMatch) {
        results.unit.passed = parseInt(testMatch[1]);
        const total = parseInt(testMatch[2]);
        results.unit.failed = total - results.unit.passed;
      }

      // Parse coverage summary
      const coverageMatch = output.match(/All files[^\n]*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
      if (coverageMatch) {
        coverageData = {
          statements: parseFloat(coverageMatch[1]),
          branches: parseFloat(coverageMatch[2]),
          functions: parseFloat(coverageMatch[3]),
          lines: parseFloat(coverageMatch[4]),
        };
        results.unit.coverage = coverageData;
      }

      resolve(code === 0);
    });
  });
}

function runWorkflowTest(workflowId) {
  return new Promise((resolve) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    let resolved = false;
    let started = false;
    const nodeErrors = [];

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.disconnect();
        resolve({ status: 'error', error: 'Timeout' });
      }
    }, TIMEOUT_MS);

    const startExecution = () => {
      if (started) return;
      started = true;
      socket.emit('control', {
        type: 'start-execution',
        workflowId,
        input: 'test input',
      });
    };

    // The server emits `workflows` after wiring socket handlers.
    socket.on('workflows', () => {
      startExecution();
    });

    socket.on('connect', () => {
      // Fallback for older server behavior.
      setTimeout(startExecution, 200);
    });

    socket.on('event', (event) => {
      if (verbose && event.type === 'node-complete') {
        console.log(`    Node ${event.nodeId}: complete`);
      }

      if (event.type === 'node-error') {
        nodeErrors.push({ nodeId: event.nodeId, error: event.error });
      }

      if (event.type === 'execution-complete') {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          socket.disconnect();

          if (nodeErrors.length > 0) {
            resolve({ status: 'error', error: `Node errors: ${nodeErrors.map((e) => `${e.nodeId}: ${e.error}`).join('; ')}` });
            return;
          }

          // Check if workflow passed
          // For workflows with validators: check 'passed' field
          // For basic workflows: completion without error = success
          const output = event.result?.Output || event.result?.output || event.result;
          const hasValidator = output && typeof output.passed === 'boolean';
          const passed = hasValidator ? output.passed === true : true;
          resolve({ status: passed ? 'passed' : 'failed', result: output });
        }
      } else if (event.type === 'execution-error') {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          socket.disconnect();
          resolve({ status: 'error', error: event.error });
        }
      }
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ status: 'error', error: `Connection failed: ${err.message}` });
      }
    });
  });
}

async function runWorkflowTests() {
  console.log('\n' + '='.repeat(60));
  console.log('WORKFLOW INTEGRATION TESTS');
  console.log('='.repeat(60) + '\n');

  // Ensure default test working directory exists.
  await fs.mkdir('/tmp/agent-tests', { recursive: true });

  const workflowsToRun = quickMode ? QUICK_WORKFLOW_IDS : WORKFLOW_IDS;

  if (quickMode) {
    console.log('(Quick mode: skipping expensive persist/transcript tests)\n');
  }

  for (const workflowId of workflowsToRun) {
    process.stdout.write(`Testing ${workflowId}... `);

    const result = await runWorkflowTest(workflowId);

    if (result.status === 'passed') {
      console.log('\x1b[32m✓ PASSED\x1b[0m');
      results.workflow.passed++;
    } else if (result.status === 'failed') {
      console.log('\x1b[31m✗ FAILED\x1b[0m');
      results.workflow.failed++;
      if (verbose && result.result) {
        console.log(`    Checks: ${JSON.stringify(result.result.checks)}`);
      }
    } else {
      console.log(`\x1b[33m⚠ ERROR: ${result.error}\x1b[0m`);
      results.workflow.errors++;
    }

    results.workflow.details.push({ workflowId, ...result });
  }
}

function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST COVERAGE REPORT');
  console.log('='.repeat(60) + '\n');

  // Unit test summary
  if (!workflowOnly) {
    console.log('UNIT TESTS:');
    const unitTotal = results.unit.passed + results.unit.failed;
    const unitStatus = results.unit.failed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  Status: ${unitStatus}`);
    console.log(`  Passed: ${results.unit.passed}/${unitTotal}`);

    if (results.unit.coverage) {
      console.log('\n  Code Coverage:');
      const cov = results.unit.coverage;
      const formatCov = (val) => {
        const color = val >= 80 ? '\x1b[32m' : val >= 60 ? '\x1b[33m' : '\x1b[31m';
        return `${color}${val.toFixed(1)}%\x1b[0m`;
      };
      console.log(`    Statements: ${formatCov(cov.statements)}`);
      console.log(`    Branches:   ${formatCov(cov.branches)}`);
      console.log(`    Functions:  ${formatCov(cov.functions)}`);
      console.log(`    Lines:      ${formatCov(cov.lines)}`);
    }
  }

  // Workflow test summary
  if (!unitOnly) {
    console.log('\nWORKFLOW INTEGRATION TESTS:');
    const workflowTotal = results.workflow.passed + results.workflow.failed + results.workflow.errors;
    const workflowStatus = (results.workflow.failed === 0 && results.workflow.errors === 0)
      ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  Status: ${workflowStatus}`);
    console.log(`  Passed: ${results.workflow.passed}/${workflowTotal}`);
    if (results.workflow.failed > 0) console.log(`  Failed: ${results.workflow.failed}`);
    if (results.workflow.errors > 0) console.log(`  Errors: ${results.workflow.errors}`);

    // Show failed/errored workflows
    const failures = results.workflow.details.filter(d => d.status !== 'passed');
    if (failures.length > 0) {
      console.log('\n  Failed workflows:');
      for (const f of failures) {
        console.log(`    - ${f.workflowId}: ${f.status} ${f.error || ''}`);
      }
    }
  }

  // Overall summary
  console.log('\n' + '-'.repeat(60));
  const allPassed = results.unit.failed === 0 &&
                    results.workflow.failed === 0 &&
                    results.workflow.errors === 0;

  if (allPassed) {
    console.log('\x1b[32m✓ ALL TESTS PASSED\x1b[0m');
  } else {
    console.log('\x1b[31m✗ SOME TESTS FAILED\x1b[0m');
  }
  console.log('-'.repeat(60) + '\n');

  return allPassed;
}

async function main() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' CIRCUIT TEST RUNNER '.padStart(45).padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  let success = true;

  if (!workflowOnly) {
    const unitSuccess = await runUnitTests();
    if (!unitSuccess) success = false;
  }

  if (!unitOnly) {
    await runWorkflowTests();
  }

  const allPassed = printReport();

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
