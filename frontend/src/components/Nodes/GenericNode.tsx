import { memo, ReactElement } from 'react';
import { NodeProps } from '@xyflow/react';
import {
  Sparkles,
  Code,
  Code2,
  ArrowRightCircle,
  CheckCircle2,
  GitBranch,
  Merge,
  HelpCircle,
  UserCheck,
  LucideIcon,
} from 'lucide-react';
import { BaseNode } from './BaseNode';
import { FlowNode } from '../../stores/workflowStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { NodeSchemaDefinition } from '../../types/schema';

// Icon mapping - maps schema icon names to Lucide icons
const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Code,
  Code2,
  ArrowRightCircle,
  CheckCircle2,
  GitBranch,
  Merge,
  UserCheck,
};

/**
 * Get the icon component for a schema
 */
function getIcon(iconName: string): ReactElement {
  const IconComponent = iconMap[iconName] || HelpCircle;
  return <IconComponent size={16} />;
}

/**
 * Generate preview content based on node type and config
 */
function NodePreview({ schema, config }: { schema: NodeSchemaDefinition; config: Record<string, unknown> }) {
  const nodeType = schema.meta.type;

  // Custom preview for agent nodes
  if (nodeType === 'claude-agent' || nodeType === 'codex-agent') {
    const tools = config.tools as string[] | undefined;
    return (
      <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
        <div className="flex justify-between">
          <span>Model:</span>
          <span className="font-medium">{String(config.model || 'default')}</span>
        </div>
        {nodeType === 'claude-agent' && tools && (
          <div className="flex justify-between">
            <span>Tools:</span>
            <span className="font-medium">{tools.length}</span>
          </div>
        )}
        {nodeType === 'codex-agent' && Boolean(config.sandbox) && (
          <div className="flex justify-between">
            <span>Sandbox:</span>
            <span className="font-medium">{String(config.sandbox)}</span>
          </div>
        )}
        {Boolean(config.maxTurns) && (
          <div className="flex justify-between">
            <span>Max Turns:</span>
            <span className="font-medium">{String(config.maxTurns)}</span>
          </div>
        )}
      </div>
    );
  }

  // Custom preview for condition nodes
  if (nodeType === 'condition') {
    const rawConditions = Array.isArray(config.conditions)
      ? (config.conditions as Array<{
        inputReference?: string;
        operator?: string;
        compareValue?: string;
        joiner?: string;
      }>)
      : [];
    const legacyInputRef = (config.inputReference as string) || '';
    const legacyOperator = (config.operator as string) || 'equals';
    const legacyCompareValue = (config.compareValue as string) || '';

    const conditions = rawConditions.length > 0
      ? rawConditions
      : legacyInputRef || legacyCompareValue
        ? [{ inputReference: legacyInputRef, operator: legacyOperator, compareValue: legacyCompareValue }]
        : [];

    const primaryCondition = conditions.find((condition) => condition.inputReference) || conditions[0];

    // Shorten operator for display
    const operatorLabels: Record<string, string> = {
      equals: '==',
      not_equals: '!=',
      contains: 'contains',
      not_contains: '!contains',
      greater_than: '>',
      less_than: '<',
      greater_than_or_equals: '>=',
      less_than_or_equals: '<=',
      is_empty: 'empty?',
      is_not_empty: 'not empty?',
      regex: 'regex',
    };

    if (!primaryCondition || !primaryCondition.inputReference) {
      return (
        <div className="text-xs text-gray-600 dark:text-gray-300">
          <span className="text-gray-400 italic">No condition set</span>
        </div>
      );
    }

    const inputRef = primaryCondition.inputReference;
    const operator = primaryCondition.operator || 'equals';
    const compareValue = primaryCondition.compareValue || '';

    // Extract just the field name from reference like {{NodeName.field}}
    const fieldMatch = inputRef.match(/\{\{([^}]+)\}\}/);
    const fieldDisplay = fieldMatch ? fieldMatch[1] : inputRef;

    const isUnary = operator === 'is_empty' || operator === 'is_not_empty';
    const joiners = conditions.slice(1).map((condition) => condition.joiner || 'and');
    const logicLabel = joiners.length === 0
      ? null
      : joiners.every((joiner) => joiner === 'and')
        ? 'AND'
        : joiners.every((joiner) => joiner === 'or')
          ? 'OR'
          : 'Mixed';

    return (
      <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
        <div className="truncate">
          <code className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded">
            {fieldDisplay.length > 18 ? fieldDisplay.slice(0, 18) + '...' : fieldDisplay}
          </code>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-medium text-amber-600">{operatorLabels[operator] || operator}</span>
          {!isUnary && compareValue && (
            <span className="truncate text-gray-500">
              {compareValue.length > 12 ? compareValue.slice(0, 12) + '...' : compareValue}
            </span>
          )}
        </div>
        {logicLabel && (
          <div className="text-[10px] text-gray-500">
            {logicLabel} • {conditions.length} conditions
          </div>
        )}
      </div>
    );
  }

  // Custom preview for input nodes
  if (nodeType === 'input') {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {String(config.description || 'User input')}
      </div>
    );
  }

  // Custom preview for output nodes
  if (nodeType === 'output') {
    return (
      <div className="text-xs text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>Format:</span>
          <span className="font-medium">{String(config.format || 'raw')}</span>
        </div>
      </div>
    );
  }

  // Custom preview for merge nodes
  if (nodeType === 'merge') {
    return (
      <div className="text-xs text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>Strategy:</span>
          <span className="font-medium">{String(config.strategy || 'wait-all')}</span>
        </div>
      </div>
    );
  }

  // Custom preview for JavaScript nodes
  if (nodeType === 'javascript') {
    const timeout = config.timeout as number | undefined;
    const inputMappings = config.inputMappings as Array<{ nodeName: string }> | undefined;
    const inputNames = inputMappings?.map((s) => s.nodeName).filter(Boolean) || [];

    return (
      <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
        {inputNames.length > 0 ? (
          <div className="flex justify-between">
            <span>Inputs:</span>
            <span className="font-medium">
              {inputNames.join(', ').slice(0, 15)}
              {inputNames.join(', ').length > 15 ? '...' : ''}
            </span>
          </div>
        ) : (
          <span className="text-gray-400 italic">Inputs: auto</span>
        )}
        {timeout && (
          <div className="flex justify-between">
            <span>Timeout:</span>
            <span className="font-medium">{timeout}ms</span>
          </div>
        )}
      </div>
    );
  }

  // Custom preview for approval nodes
  if (nodeType === 'approval') {
    const inputSelections = config.inputSelections as Array<{ nodeName: string }> | undefined;
    const timeout = config.timeoutMinutes as number | undefined;

    return (
      <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
        {inputSelections && inputSelections.length > 0 ? (
          <div className="flex justify-between">
            <span>Inputs:</span>
            <span className="font-medium">
              {inputSelections.map(s => s.nodeName).join(', ').slice(0, 15)}
              {inputSelections.map(s => s.nodeName).join(', ').length > 15 ? '...' : ''}
            </span>
          </div>
        ) : (
          <span className="text-gray-400 italic">No inputs selected</span>
        )}
        {timeout && (
          <div className="flex justify-between">
            <span>Timeout:</span>
            <span className="font-medium">{timeout}m</span>
          </div>
        )}
      </div>
    );
  }

  // Default: show first few properties with values
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400">
      {schema.meta.description}
    </div>
  );
}

function GenericNodeComponent(props: NodeProps<FlowNode>) {
  const { data } = props;
  // Cast to Record<string, unknown> via unknown for type safety
  const config = data.config as unknown as Record<string, unknown>;
  const nodeType = config.type as string;

  const getSchema = useSchemaStore((s) => s.getSchema);
  const schema = getSchema(nodeType);

  // If no schema found, render a fallback
  if (!schema) {
    return (
      <BaseNode
        {...props}
        icon={<HelpCircle size={16} />}
        color="#6b7280"
        borderColor="#4b5563"
      >
        <div className="text-xs text-gray-500">Unknown node type: {nodeType}</div>
      </BaseNode>
    );
  }

  // Determine handles from schema
  const showTargetHandle = nodeType !== 'input'; // Input nodes don't have target
  const showSourceHandle = nodeType !== 'output'; // Output nodes don't have source

  // Get custom source handles for condition nodes
  const sourceHandles = schema.handles?.source?.map((h) => ({
    id: h.id,
    label: h.label,
  }));

  return (
    <BaseNode
      {...props}
      icon={getIcon(schema.meta.icon)}
      color={schema.meta.color}
      borderColor={schema.meta.borderColor}
      showTargetHandle={showTargetHandle}
      showSourceHandle={!sourceHandles && showSourceHandle}
      sourceHandles={sourceHandles}
    >
      <NodePreview schema={schema} config={config} />

      {/* Handle labels for condition nodes */}
      {nodeType === 'condition' && (
        <>
          <div className="absolute right-[-60px] top-[20%] text-[10px] text-green-600 font-medium">
            True
          </div>
          <div className="absolute right-[-60px] top-[60%] text-[10px] text-red-600 font-medium">
            False
          </div>
        </>
      )}

      {/* Handle labels for approval nodes */}
      {nodeType === 'approval' && (
        <>
          <div className="absolute right-[-70px] top-[20%] text-[10px] text-green-600 font-medium">
            Approved
          </div>
          <div className="absolute right-[-70px] top-[60%] text-[10px] text-red-600 font-medium">
            Rejected
          </div>
        </>
      )}

    </BaseNode>
  );
}

export const GenericNode = memo(GenericNodeComponent);
