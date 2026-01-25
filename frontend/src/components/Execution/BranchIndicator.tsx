import { memo } from 'react';
import { GitBranch, ArrowRight, Check, X } from 'lucide-react';

export interface BranchPath {
  nodeId: string;
  nodeName: string;
  condition: boolean;
  takenAt: string;
}

interface BranchIndicatorProps {
  branchPath: BranchPath;
  compact?: boolean;
  className?: string;
}

function BranchIndicatorComponent({
  branchPath,
  compact = false,
  className = '',
}: BranchIndicatorProps) {
  const isTruePath = branchPath.condition;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          isTruePath
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        } ${className}`}
        title={`Branch: ${branchPath.nodeName} -> ${isTruePath ? 'True' : 'False'}`}
      >
        <GitBranch size={10} />
        {isTruePath ? <Check size={10} /> : <X size={10} />}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        isTruePath
          ? 'bg-green-500/10 border border-green-500/30'
          : 'bg-red-500/10 border border-red-500/30'
      } ${className}`}
    >
      <GitBranch
        size={14}
        className={isTruePath ? 'text-green-400' : 'text-red-400'}
      />
      <span className="text-xs text-gray-300">{branchPath.nodeName}</span>
      <ArrowRight size={12} className="text-gray-500" />
      <span
        className={`text-xs font-medium ${
          isTruePath ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {isTruePath ? 'True' : 'False'}
      </span>
    </div>
  );
}

export const BranchIndicator = memo(BranchIndicatorComponent);

// Branch path list for showing multiple branches taken
interface BranchPathListProps {
  branchPaths: BranchPath[];
  compact?: boolean;
  maxVisible?: number;
  className?: string;
}

function BranchPathListComponent({
  branchPaths,
  compact = false,
  maxVisible = 3,
  className = '',
}: BranchPathListProps) {
  if (branchPaths.length === 0) return null;

  const visiblePaths = branchPaths.slice(0, maxVisible);
  const hiddenCount = branchPaths.length - maxVisible;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {visiblePaths.map((path) => (
        <BranchIndicator
          key={`${path.nodeId}-${path.takenAt}`}
          branchPath={path}
          compact={compact}
        />
      ))}
      {hiddenCount > 0 && (
        <span className="text-xs text-gray-500">+{hiddenCount} more</span>
      )}
    </div>
  );
}

export const BranchPathList = memo(BranchPathListComponent);

// Execution path visualization showing the flow
interface ExecutionPathProps {
  branchPaths: BranchPath[];
  className?: string;
}

function ExecutionPathComponent({
  branchPaths,
  className = '',
}: ExecutionPathProps) {
  if (branchPaths.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
        <GitBranch size={12} />
        <span className="font-medium">Execution Path</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {branchPaths.map((path, index) => (
          <div key={`${path.nodeId}-${path.takenAt}`} className="flex items-center">
            {index > 0 && (
              <div className="w-4 h-px bg-gray-600 mx-1" />
            )}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                path.condition
                  ? 'bg-green-950/50 text-green-400 border border-green-500/30'
                  : 'bg-red-950/50 text-red-400 border border-red-500/30'
              }`}
            >
              <span className="font-medium">{path.nodeName}</span>
              <span className="opacity-70">
                {path.condition ? '(T)' : '(F)'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ExecutionPath = memo(ExecutionPathComponent);

// Mini branch indicator for timeline nodes
interface MiniBranchIndicatorProps {
  condition: boolean;
  className?: string;
}

function MiniBranchIndicatorComponent({
  condition,
  className = '',
}: MiniBranchIndicatorProps) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
        condition
          ? 'bg-green-500/30 text-green-400 border border-green-500/40'
          : 'bg-red-500/30 text-red-400 border border-red-500/40'
      } ${className}`}
      title={condition ? 'True path taken' : 'False path taken'}
    >
      {condition ? 'T' : 'F'}
    </span>
  );
}

export const MiniBranchIndicator = memo(MiniBranchIndicatorComponent);
