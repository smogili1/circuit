/**
 * Executor module index.
 * Registers all built-in executors and exports the registry.
 */

import { executorRegistry } from './registry.js';
import { inputExecutor } from './input.js';
import { claudeAgentExecutor } from './claude-agent.js';
import { codexAgentExecutor } from './codex-agent.js';
import { conditionExecutor } from './condition.js';
import { mergeExecutor } from './merge.js';
import { outputExecutor } from './output.js';
import { approvalExecutor } from './approval.js';
import { javascriptExecutor } from './javascript.js';
import { bashExecutor } from './bash.js';
import { selfReflectExecutor } from './self-reflect.js';

// Register all built-in executors
executorRegistry
  .register(inputExecutor)
  .register(claudeAgentExecutor)
  .register(codexAgentExecutor)
  .register(conditionExecutor)
  .register(mergeExecutor)
  .register(outputExecutor)
  .register(approvalExecutor)
  .register(javascriptExecutor)
  .register(bashExecutor)
  .register(selfReflectExecutor);

// Export everything
export { executorRegistry } from './registry.js';
export { ExecutorRegistry } from './registry.js';
export * from './types.js';

// Export individual executors for testing
export { inputExecutor } from './input.js';
export { claudeAgentExecutor } from './claude-agent.js';
export { codexAgentExecutor } from './codex-agent.js';
export { conditionExecutor } from './condition.js';
export { mergeExecutor } from './merge.js';
export { outputExecutor } from './output.js';
export { approvalExecutor, submitApproval, cancelApproval, cancelAllApprovals } from './approval.js';
export { javascriptExecutor } from './javascript.js';
export { bashExecutor } from './bash.js';
export {
  selfReflectExecutor,
  submitEvolutionApproval,
  cancelEvolutionApproval,
  cancelAllEvolutionApprovals,
} from './self-reflect.js';
