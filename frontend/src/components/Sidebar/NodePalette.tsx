import { ReactElement, useMemo } from 'react';
import {
  Sparkles,
  Code,
  Code2,
  ArrowRightCircle,
  CheckCircle2,
  GitBranch,
  Merge,
  HelpCircle,
  LucideIcon,
} from 'lucide-react';
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
};

function getIcon(iconName: string): ReactElement {
  const IconComponent = iconMap[iconName] || HelpCircle;
  return <IconComponent size={20} />;
}

interface PaletteItem {
  type: string;
  label: string;
  description: string;
  icon: ReactElement;
  color: string;
  category: 'agents' | 'flow';
}

function schemaToPaletteItem(schema: NodeSchemaDefinition): PaletteItem {
  return {
    type: schema.meta.type,
    label: schema.meta.displayName,
    description: schema.meta.description,
    icon: getIcon(schema.meta.icon),
    color: schema.meta.color,
    category: schema.meta.category,
  };
}

function DraggableNode({ item }: { item: PaletteItem }) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', item.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="
        flex items-center gap-3 p-3 rounded-lg cursor-grab
        bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
        hover:border-gray-400 dark:hover:border-gray-500
        hover:shadow-md transition-all
        active:cursor-grabbing
      "
    >
      <div
        className="p-2 rounded-md text-white"
        style={{ backgroundColor: item.color }}
      >
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
          {item.label}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {item.description}
        </div>
      </div>
    </div>
  );
}

export function NodePalette() {
  const schemas = useSchemaStore((s) => s.schemas);

  // Convert schemas to palette items and group by category
  const { agentItems, flowItems } = useMemo(() => {
    // Filter out hidden nodes (input/output are auto-added to workflows)
    const items = Object.values(schemas)
      .filter((schema) => !schema.meta.hidden)
      .map(schemaToPaletteItem);

    // Sort flow items alphabetically
    return {
      agentItems: items
        .filter((i) => i.category === 'agents')
        .sort((a, b) => a.label.localeCompare(b.label)),
      flowItems: items
        .filter((i) => i.category === 'flow')
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [schemas]);

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        Drag to Add
      </h3>

      {/* Flow nodes */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Flow
        </h4>
        {flowItems.map((item) => (
          <DraggableNode key={item.type} item={item} />
        ))}
      </div>

      {/* Agent nodes */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Agents
        </h4>
        {agentItems.map((item) => (
          <DraggableNode key={item.type} item={item} />
        ))}
      </div>
    </div>
  );
}
