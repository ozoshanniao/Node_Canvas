import { useReactFlow } from '@xyflow/react';
import { stopEdgeActionEvent } from '../utils/edgeActions';

export function EdgeActionToolbar({ edgeId }) {
  const { deleteElements } = useReactFlow();

  const handleDelete = (event) => {
    stopEdgeActionEvent(event);
    deleteElements({ edges: [{ id: edgeId }] });
  };

  return (
    <button
      type="button"
      aria-label="Delete connection"
      title="Delete connection"
      data-edge-local-delete="true"
      onPointerDown={stopEdgeActionEvent}
      onMouseDown={stopEdgeActionEvent}
      onClick={handleDelete}
      className="nodrag nopan pointer-events-auto inline-flex w-5 h-5 flex-none items-center justify-center box-border p-0 m-0 leading-none bg-[#141414]/95 border border-white/10 rounded-full text-white/40 hover:text-red-500 hover:border-red-500 shadow-sm"
      style={{ pointerEvents: 'all' }}
    >
      <svg className="block w-2.5 h-2.5 flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a1 1 0 001 1h3m-10 0h3m0 0V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
        />
      </svg>
    </button>
  );
}
