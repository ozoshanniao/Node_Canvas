import { memo, useMemo, useRef } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import CustomSelect from '../components/CustomSelect';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeOmniParamsOutput } from '../utils/nodeOutputs';
import { countRender } from '../utils/perfDebug';

const ROLE_OPTIONS = ['reference', 'first_frame', 'end_frame'];

export const OmniComposerNode = memo(function OmniComposerNode({ id, data }) {
  countRender('OmniComposerNode');
  const { setNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const promptRef = useRef(null);
  const prompt = data?.prompt || '';
  const multiShot = Boolean(data?.multiShot);
  const shotType = ['intelligence', 'customize'].includes(data?.shotType) ? data.shotType : 'intelligence';
  const elements = useMemo(
    () => (Array.isArray(data?.elements) && data.elements.length ? data.elements : ['']),
    [data]
  );
  // TODO: Phase 2 - OmniComposerNode will natively manage element aliases and validation shared with VideoNode.

  const output = useMemo(
    () => getNodeOmniParamsOutput({ id, type: 'omniComposerNode', data: { ...data, elements } }, edges, nodes),
    [data, edges, elements, id, nodes]
  );

  const updateData = (patch) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node
      )
    );
  };

  const updateElement = (index, value) => {
    updateData({ elements: elements.map((element, elementIndex) => (elementIndex === index ? value : element)) });
  };

  const addElement = () => {
    if (elements.length >= 3) return;
    updateData({ elements: [...elements, ''] });
  };

  const removeElement = (index) => {
    if (elements.length <= 1) {
      updateData({ elements: [''] });
      return;
    }
    updateData({ elements: elements.filter((_, elementIndex) => elementIndex !== index) });
  };

  const updateImageRole = (alias, role) => {
    updateData({
      imageRoles: {
        ...(data?.imageRoles || {}),
        [alias]: role,
      },
    });
  };

  const updateShotSettings = (patch) => {
    updateData({
      multiShot,
      shotType,
      ...patch,
    });
  };

  const insertAlias = (alias) => {
    const tag = `@${alias}`;
    const textarea = promptRef.current;
    if (!textarea) {
      updateData({ prompt: `${prompt}${prompt ? ' ' : ''}${tag}` });
      return;
    }

    const start = textarea.selectionStart ?? prompt.length;
    const end = textarea.selectionEnd ?? prompt.length;
    const nextPrompt = `${prompt.slice(0, start)}${tag}${prompt.slice(end)}`;
    updateData({ prompt: nextPrompt });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const aliasPills = [
    ...output.images.map((image) => image.alias),
    ...elements
      .map((element, index) => ({ element, index }))
      .filter((item) => String(item.element || '').trim())
      .map((item) => `element_${item.index + 1}`),
  ];

  return (
    <div className="relative h-full min-h-[300px] w-full min-w-[380px] select-none text-white group">
      <div className="canvas-node-card relative flex h-full w-full flex-col rounded-[24px] border border-white/5 bg-[#181818] p-4 transition-colors duration-100 hover:border-white/20">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/55">
            Omni Composer
          </div>
          <div className={`truncate text-[11px] ${output.isValid ? 'text-white/30' : 'text-red-300/70'}`}>
            {output.isValid ? 'Valid' : output.errors[0]}
          </div>
        </div>

        <div
          className="nodrag nowheel mb-3 flex shrink-0 items-center gap-1.5 rounded-full border border-white/5 bg-[#121212]/70 px-2.5 py-1.5"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => updateShotSettings({ multiShot: !multiShot })}
            className={`rounded-full px-2 py-1 text-[11px] transition-colors ${
              multiShot ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white'
            }`}
          >
            Multi Shot {multiShot ? 'On' : 'Off'}
          </button>
          {multiShot && (
            <>
              <div className="h-3 w-px bg-white/10" />
              <CustomSelect
                value={shotType}
                onChange={(val) => updateShotSettings({ shotType: val })}
                options={['intelligence', 'customize']}
                className="relative nodrag"
                buttonClassName="flex items-center justify-between gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/60 outline-none transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                menuClassName="nowheel nodrag animate-in fade-in zoom-in-95 absolute left-1/2 top-full z-[70] mt-1.5 min-w-[120px] -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl duration-150"
                optionClassName="text-center text-[11px]"
              />
            </>
          )}
        </div>

        <div
          className="nodrag nowheel min-h-0 flex-1 flex flex-col gap-3 overflow-y-auto pr-1"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <label className="flex flex-col gap-1.5 min-h-[120px] flex-grow flex-1">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30 shrink-0">Prompt</span>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => updateData({ prompt: event.target.value })}
              className="nodrag nowheel w-full flex-grow flex-1 min-h-[96px] resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75 outline-none transition-colors hover:border-white/20"
              placeholder="Use @image_1 and @element_1 in your prompt..."
            />
          </label>

          <div className="grid gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Available References</span>
            <div className="flex flex-wrap gap-1.5">
              {aliasPills.length ? (
                aliasPills.map((alias) => (
                  <button
                    key={alias}
                    type="button"
                    onClick={() => insertAlias(alias)}
                    className="nodrag nowheel rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    @{alias}
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-white/25">Connect images or add elements to create references.</span>
              )}
            </div>
          </div>

          <div className="grid gap-1.5 shrink-0">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Image References</span>
            {output.images.length ? (
              <div className="grid gap-1.5">
                {output.images.map((image) => (
                  <div key={image.alias} className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/15 p-2">
                    <span className="w-16 text-[11px] text-white/45">{image.alias}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-white/25">{image.url}</span>
                    <CustomSelect
                      value={image.role}
                      onChange={(value) => updateImageRole(image.alias, value)}
                      options={ROLE_OPTIONS}
                      className="relative w-[116px] shrink-0 nodrag"
                      buttonClassName="flex w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/60 outline-none transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
                      menuClassName="nowheel nodrag animate-in fade-in zoom-in-95 absolute left-1/2 top-full z-[70] mt-1.5 min-w-[124px] -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl duration-150"
                      optionClassName="text-center text-[11px]"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[11px] text-white/25">
                No image references connected.
              </div>
            )}
          </div>

          <div className="grid gap-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Elements</span>
              <button
                type="button"
                onClick={addElement}
                disabled={elements.length >= 3}
                className="nodrag nowheel text-[10px] text-white/45 transition-colors hover:text-white disabled:opacity-30"
              >
                + Add Element
              </button>
            </div>
            <div className="grid gap-1.5">
              {elements.map((element, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <span className="w-16 text-[11px] text-white/35">element_{index + 1}</span>
                  <input
                    type="text"
                    value={element}
                    onChange={(event) => updateElement(index, event.target.value)}
                    className="nodrag nowheel h-8 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-xs text-white/70 outline-none"
                    placeholder="Element ID"
                  />
                  <button
                    type="button"
                    onClick={() => removeElement(index)}
                    className="nodrag nowheel h-8 rounded-xl border border-white/5 bg-black/25 px-2 text-xs text-white/35 transition-colors hover:border-red-500/30 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          {output.errors.length > 0 && (
            <div className="rounded-xl border border-red-400/10 bg-red-500/5 px-3 py-2 text-[11px] text-red-200/70 shrink-0">
              {output.errors[0]}
            </div>
          )}
        </div>
      </div>

      <div className="absolute left-0 top-1/2 z-20 flex -translate-y-1/2 items-center">
        <Handle
          type="target"
          id="image:references"
          position={Position.Left}
          className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
        />
        <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          images
        </span>
      </div>

      <div className="absolute left-0 top-[66%] z-20 flex -translate-y-1/2 items-center">
        <Handle
          type="target"
          id="multiPrompt:in"
          position={Position.Left}
          className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
        />
        <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          shots
        </span>
      </div>

      <div className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center">
        <span className="pointer-events-none absolute right-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          omniParams:out
        </span>
        <Handle
          type="source"
          id="omniParams:out"
          position={Position.Right}
          className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
        />
      </div>

      <NodeResizeCorner minWidth={380} minHeight={300} keepAspectRatio={false} />
    </div>
  );
});
