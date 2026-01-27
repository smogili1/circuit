/**
 * Route configuration for the application
 *
 * Routes:
 * - / - Redirects to first workflow or /workflows
 * - /workflows - Design mode (shows workflow list)
 * - /workflows/:workflowId - Design mode for specific workflow
 * - /workflows/:workflowId/executions - Execution list for workflow
 * - /workflows/:workflowId/executions/:executionId - View specific execution
 * - /mcp - MCP Servers configuration page
 * - * - 404 Not Found page
 *
 * Note: Routes are defined in App.tsx directly since they need access to socket state and handlers
 * This file serves as documentation for the route structure.
 */

export const routePaths = {
  home: '/',
  workflows: '/workflows',
  workflowDesign: (workflowId: string) => `/workflows/${workflowId}`,
  workflowExecutions: (workflowId: string) => `/workflows/${workflowId}/executions`,
  executionDetail: (workflowId: string, executionId: string) => `/workflows/${workflowId}/executions/${executionId}`,
  mcp: '/mcp',
} as const;
