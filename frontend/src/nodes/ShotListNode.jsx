import { memo, useMemo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeMultiPromptOutput } from '../utils/nodeOutputs';
import { countRender } from '../utils/perfDebug';

const createShot = () => ({
  id: `shot-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  prompt: '',
  duration: 3,
});

export const ShotListNode = memo(function ShotListNode({ id, data }) {
  countRender('ShotListNode');
  const { setNodes } = useReactFlow();
  const shots = useMemo(
    () => (Array.isArray(data?.shots) && data.shots.length ? data.shots : [createShot()]),
    [data?.shots]
  );
  const output = useMemo(
    () => getNodeMultiPromptOutput({ type: 'shotListNode', data: { shots } }),
    [shots]
  );

  const updateShots = (nextShots) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                shots: nextShots,
              },
            }
          : node
      )
    );
  };

  const updateShot = (index, patch) => {
    updateShots(shots.map((shot, shotIndex) => (shotIndex === index ? { ...shot, ...patch } : shot)));
  };

  const moveShot = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= shots.length) return;
    const nextShots = [...shots];
    [nextShots[index], nextShots[nextIndex]] = [nextShots[nextIndex], nextShots[index]];
    updateShots(nextShots);
  };
  const shouldDistributeShots = shots.length > 0 && shots.length <= 3;

  return (
    <div className="relative flex h-full min-h-[260px] w-full min-w-[360px] select-none flex-col text-white group">
      <div className="canvas-node-card relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] p-4 transition-colors duration-100 hover:border-white/20">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/55">
            Shot List
          </div>
          <div className="text-[11px] font-light text-white/35">Total: {output.totalDuration}s</div>
        </div>

        <div
          className="nowheel nodrag flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
          onWheel={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {shots.map((shot, index) => (
            <div
              key={shot.id || index}
              className={`flex flex-col rounded-xl border border-white/5 bg-black/15 p-2.5 ${
                shouldDistributeShots ? 'min-h-[150px] flex-1' : 'min-h-[150px] shrink-0'
              }`}
            >
              <div className="mb-2 flex shrink-0 items-center gap-2">
                <span className="w-6 text-xs text-white/35">#{index + 1}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={shot.duration}
                  onChange={(event) => updateShot(index, { duration: Number(event.target.value) })}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="nodrag nowheel h-7 w-14 rounded-lg border border-white/10 bg-black/25 px-2 text-xs text-white/75 outline-none"
                />
                <button type="button" onClick={() => moveShot(index, -1)} className="nodrag nowheel rounded px-2 text-xs text-white/35 hover:bg-white/5 hover:text-white">Up</button>
                <button type="button" onClick={() => moveShot(index, 1)} className="nodrag nowheel rounded px-2 text-xs text-white/35 hover:bg-white/5 hover:text-white">Down</button>
                <button
                  type="button"
                  onClick={() => updateShots(shots.filter((_, shotIndex) => shotIndex !== index))}
                  className="nodrag nowheel ml-auto rounded px-2 text-xs text-white/35 hover:bg-white/5 hover:text-red-200"
                >
                  Delete
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <textarea
                  value={shot.prompt}
                  maxLength={512}
                  onChange={(event) => updateShot(index, { prompt: event.target.value })}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                  className="nodrag nowheel h-full min-h-[96px] w-full resize-none rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/75 outline-none"
                  placeholder="Shot prompt..."
                />
              </div>
            </div>
          ))}
        </div>

        <div
          className="nodrag nowheel mt-3 flex shrink-0 items-center justify-between gap-3"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => shots.length < 6 && updateShots([...shots, createShot()])}
            disabled={shots.length >= 6}
            className="nodrag nowheel rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-35"
          >
            Add Shot
          </button>
          <div className={`truncate text-[11px] ${output.isValid ? 'text-white/30' : 'text-red-300/70'}`}>
            {output.isValid ? 'Valid' : output.errors[0]}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        id="multiPrompt:out"
        position={Position.Right}
        className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
      />

      <NodeResizeCorner
        minWidth={360}
        minHeight={260}
        keepAspectRatio={false}
      />
    </div>
  );
});
