import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, Copy, Edit2, Check, X } from 'lucide-react';
import { Workflow } from '../../types/workflow';

interface WorkflowListProps {
  workflows: Workflow[];
  selectedId: string | null;
  onSelect?: () => void; // Optional callback after navigation
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string, newName: string) => void;
  onRename: (id: string, newName: string) => void;
}

export function WorkflowList({
  workflows,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  onRename,
}: WorkflowListProps) {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim());
      setNewName('');
      setIsCreating(false);
    }
  };

  const handleStartEdit = (workflow: Workflow) => {
    setEditingId(workflow.id);
    setEditName(workflow.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Workflows
          </h2>
          <button
            onClick={() => setIsCreating(true)}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
            title="Create new workflow"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Create new workflow input */}
        {isCreating && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workflow name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              className="flex-1 px-3 py-2 text-sm border rounded-md
                dark:bg-gray-800 dark:border-gray-600"
            />
            <button
              onClick={handleCreate}
              className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Workflow list */}
      <div className="flex-1 overflow-y-auto p-2">
        {workflows.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No workflows yet</p>
            <p className="text-xs">Click + to create one</p>
          </div>
        ) : (
          <div className="space-y-1">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`
                  group flex items-center gap-2 p-3 rounded-lg cursor-pointer
                  ${
                    selectedId === workflow.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                  }
                `}
                onClick={() => {
                  navigate(`/workflows/${workflow.id}`);
                  onSelect?.();
                }}
              >
                <FileText
                  size={16}
                  className={
                    selectedId === workflow.id
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400'
                  }
                />

                {editingId === workflow.id ? (
                  <div className="flex-1 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className="flex-1 px-2 py-1 text-sm border rounded
                        dark:bg-gray-800 dark:border-gray-600"
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {workflow.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {workflow.nodes.length} nodes
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="hidden group-hover:flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleStartEdit(workflow)}
                        className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        title="Rename"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => onDuplicate(workflow.id, `${workflow.name} (Copy)`)}
                        className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        title="Duplicate"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${workflow.name}"?`)) {
                            onDelete(workflow.id);
                          }
                        }}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
