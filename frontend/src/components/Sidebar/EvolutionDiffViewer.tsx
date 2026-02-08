import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, Edit3 } from 'lucide-react';
import { MutationOp, Workflow, WorkflowNode, WorkflowEdge } from '../../types/workflow';

interface EvolutionDiffViewerProps {
  beforeWorkflow: Workflow;
  afterWorkflow: Workflow;
  mutations: MutationOp[];
}

interface DiffItem {
  type: 'added' | 'removed' | 'modified';
  category: 'node' | 'edge' | 'config' | 'workflow';
  label: string;
  before?: unknown;
  after?: unknown;
  nodeId?: string;
}

function buildDiffItems(
  beforeWorkflow: Workflow,
  afterWorkflow: Workflow,
  mutations: MutationOp[]
): DiffItem[] {
  const items: DiffItem[] = [];
  const beforeNodesMap = new Map(beforeWorkflow.nodes.map(n => [n.id, n]));
  const afterNodesMap = new Map(afterWorkflow.nodes.map(n => [n.id, n]));
  const beforeEdgesMap = new Map(beforeWorkflow.edges.map(e => [e.id, e]));
  const afterEdgesMap = new Map(afterWorkflow.edges.map(e => [e.id, e]));

  // Track changes by nodeId
  const processedNodes = new Set<string>();
  const processedEdges = new Set<string>();

  for (const mutation of mutations) {
    switch (mutation.op) {
      case 'add-node': {
        const node = afterNodesMap.get(mutation.node.id);
        if (node && !processedNodes.has(mutation.node.id)) {
          items.push({
            type: 'added',
            category: 'node',
            label: `Node: ${node.data.name}`,
            after: node,
            nodeId: node.id,
          });
          processedNodes.add(mutation.node.id);
        }
        break;
      }
      case 'remove-node': {
        const node = beforeNodesMap.get(mutation.nodeId);
        if (node && !processedNodes.has(mutation.nodeId)) {
          items.push({
            type: 'removed',
            category: 'node',
            label: `Node: ${node.data.name}`,
            before: node,
            nodeId: node.id,
          });
          processedNodes.add(mutation.nodeId);
        }
        break;
      }
      case 'update-node-config':
      case 'update-prompt':
      case 'update-model': {
        const beforeNode = beforeNodesMap.get(mutation.nodeId);
        const afterNode = afterNodesMap.get(mutation.nodeId);
        if (beforeNode && afterNode && !processedNodes.has(mutation.nodeId)) {
          items.push({
            type: 'modified',
            category: 'config',
            label: `Node Config: ${afterNode.data.name}`,
            before: beforeNode.data,
            after: afterNode.data,
            nodeId: mutation.nodeId,
          });
          processedNodes.add(mutation.nodeId);
        }
        break;
      }
      case 'add-edge': {
        const edge = afterEdgesMap.get(mutation.edge.id);
        if (edge && !processedEdges.has(mutation.edge.id)) {
          items.push({
            type: 'added',
            category: 'edge',
            label: `Edge: ${edge.source} → ${edge.target}`,
            after: edge,
          });
          processedEdges.add(mutation.edge.id);
        }
        break;
      }
      case 'remove-edge': {
        const edge = beforeEdgesMap.get(mutation.edgeId);
        if (edge && !processedEdges.has(mutation.edgeId)) {
          items.push({
            type: 'removed',
            category: 'edge',
            label: `Edge: ${edge.source} → ${edge.target}`,
            before: edge,
          });
          processedEdges.add(mutation.edgeId);
        }
        break;
      }
      case 'update-workflow-setting': {
        items.push({
          type: 'modified',
          category: 'workflow',
          label: `Workflow: ${mutation.field}`,
          before: (beforeWorkflow as Record<string, unknown>)[mutation.field],
          after: mutation.value,
        });
        break;
      }
    }
  }

  return items;
}

function getIcon(type: DiffItem['type']) {
  switch (type) {
    case 'added':
      return <Plus size={14} className="text-green-600 dark:text-green-400" />;
    case 'removed':
      return <Minus size={14} className="text-red-600 dark:text-red-400" />;
    case 'modified':
      return <Edit3 size={14} className="text-amber-600 dark:text-amber-400" />;
  }
}

function getBadgeColor(type: DiffItem['type']) {
  switch (type) {
    case 'added':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'removed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'modified':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  }
}

export function EvolutionDiffViewer({
  beforeWorkflow,
  afterWorkflow,
  mutations,
}: EvolutionDiffViewerProps) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const diffItems = buildDiffItems(beforeWorkflow, afterWorkflow, mutations);

  const toggleItem = (index: number) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setExpandedItems(newSet);
  };

  if (diffItems.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-4">
        No changes detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        Changes ({diffItems.length})
      </div>
      {diffItems.map((item, index) => {
        const isExpanded = expandedItems.has(index);
        const hasDetails = item.before !== undefined || item.after !== undefined;

        return (
          <div
            key={index}
            className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => hasDetails && toggleItem(index)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left
                bg-gray-50 dark:bg-gray-800 text-sm
                ${hasDetails ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : 'cursor-default'}`}
              disabled={!hasDetails}
            >
              {hasDetails && (
                <>
                  {isExpanded ? (
                    <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
                  )}
                </>
              )}
              {getIcon(item.type)}
              <span className="flex-1 text-gray-800 dark:text-gray-200 font-medium">
                {item.label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${getBadgeColor(
                  item.type
                )}`}
              >
                {item.type}
              </span>
            </button>

            {isExpanded && hasDetails && (
              <div className="p-3 bg-white dark:bg-gray-900 space-y-3 text-xs">
                {item.before !== undefined && (
                  <div>
                    <div className="text-red-600 dark:text-red-400 font-medium mb-1 flex items-center gap-1">
                      <Minus size={12} />
                      Before
                    </div>
                    <pre className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-2 rounded overflow-x-auto">
                      {JSON.stringify(item.before, null, 2)}
                    </pre>
                  </div>
                )}
                {item.after !== undefined && (
                  <div>
                    <div className="text-green-600 dark:text-green-400 font-medium mb-1 flex items-center gap-1">
                      <Plus size={12} />
                      After
                    </div>
                    <pre className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-2 rounded overflow-x-auto">
                      {JSON.stringify(item.after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
