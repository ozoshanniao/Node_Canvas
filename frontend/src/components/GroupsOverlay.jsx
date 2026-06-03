import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { ViewportPortal, useStore } from '@xyflow/react';
import { GROUP_COLORS, getGroupColor, getSelectedNodesBounds } from '../utils/groupBoxes';

const DEBUG_GROUPS = import.meta.env.DEV;

const stopCanvasEvent = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

const isValidBounds = (bounds) =>
  Boolean(bounds) &&
  Number.isFinite(bounds.x) &&
  Number.isFinite(bounds.y) &&
  Number.isFinite(bounds.width) &&
  Number.isFinite(bounds.height);

function SelectionToolbar({
  bounds,
  zoom,
  selectedNodeIds,
  onCreateGroup,
}) {
  const { t } = useI18n();
  if (!isValidBounds(bounds)) return null;

  return (
    <div
      className="nodrag nopan pointer-events-auto absolute z-[65] flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full border border-white/10 bg-[#181818]/78 px-2.5 py-2 shadow-[0_14px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      style={{
        left: bounds.x + bounds.width / 2,
        top: bounds.y - 50,
        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
        transformOrigin: 'center bottom',
      }}
      onMouseDown={stopCanvasEvent}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onMouseDown={stopCanvasEvent}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          stopCanvasEvent(event);
          if (DEBUG_GROUPS) {
            console.debug('[groups] Create Group click', {
              selectedCount: selectedNodeIds.length,
              selectedNodeIds,
            });
          }
          onCreateGroup(selectedNodeIds);
        }}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-light text-white/65 transition-colors hover:bg-white/10 hover:text-white"
      >
        {t('groups.createGroup')}
      </button>
    </div>
  );
}

function GroupMenu({ group, onRenameGroup, onChangeGroupColor, onDeleteGroup, onClose }) {
  const { t } = useI18n();
  return (
    <div
      className="pointer-events-auto absolute bottom-full left-0 z-[90] mb-2 w-[168px] overflow-hidden rounded-[14px] border border-white/10 bg-[#141414]/95 py-1.5 shadow-2xl backdrop-blur-xl"
      onMouseDown={stopCanvasEvent}
      onPointerDown={stopCanvasEvent}
    >
      <button
        type="button"
        className="flex w-full px-3 py-2 text-left text-xs font-light text-white/55 transition-colors hover:bg-white/5 hover:text-white/85"
        onClick={() => {
          const nextName = window.prompt(t('groups.renamePrompt'), group.name);
          if (nextName?.trim()) onRenameGroup(group.id, nextName.trim());
          onClose();
        }}
      >
        {t('groups.rename')}
      </button>
      <div className="border-t border-white/5 px-3 py-2">
        <div className="mb-2 text-[10px] font-light uppercase tracking-[0.14em] text-white/25">{t('groups.color')}</div>
        <div className="grid grid-cols-6 gap-1.5">
          {GROUP_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              aria-label={color.label}
              title={color.label}
              className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                group.color === color.id ? 'border-white/70' : 'border-white/10'
              }`}
              style={{ background: color.accent }}
              onClick={() => {
                onChangeGroupColor(group.id, color.id);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="flex w-full border-t border-white/5 px-3 py-2 text-left text-xs font-light text-red-200/55 transition-colors hover:bg-red-500/10 hover:text-red-100"
        onClick={() => {
          onDeleteGroup(group.id);
          onClose();
        }}
      >
        {t('groups.delete')}
      </button>
    </div>
  );
}

function GroupControls({
  group,
  zoom,
  onMoveGroup,
  onResizeGroup,
  onDeleteGroup,
  onRenameGroup,
  onChangeGroupColor,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dragRef = useRef(null);
  const { t } = useI18n();
  const color = getGroupColor(group.color);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;

      const delta = {
        x: (event.clientX - drag.lastClient.x) / zoom,
        y: (event.clientY - drag.lastClient.y) / zoom,
      };
      drag.lastClient = { x: event.clientX, y: event.clientY };

      if (drag.kind === 'move') {
        onMoveGroup(group.id, delta, false);
      } else {
        onResizeGroup(group.id, drag.handle, delta, false);
      }
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      if (drag.kind === 'move') {
        onMoveGroup(group.id, { x: 0, y: 0 }, true);
      } else {
        onResizeGroup(group.id, drag.handle, { x: 0, y: 0 }, true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [group.id, onMoveGroup, onResizeGroup, zoom]);

  const startDrag = (event, kind, handle = null) => {
    stopCanvasEvent(event);
    setMenuOpen(false);
    dragRef.current = {
      kind,
      handle,
      lastClient: { x: event.clientX, y: event.clientY },
    };
  };

  const handles = [
    {
      id: 'nw',
      cursorClassName: 'cursor-nwse-resize',
      markerClassName: 'rotate-180',
      x: () => 0,
      y: () => 0,
    },
    {
      id: 'ne',
      cursorClassName: 'cursor-nesw-resize',
      markerClassName: '-rotate-90',
      x: (targetGroup) => targetGroup.size.width,
      y: () => 0,
    },
    {
      id: 'sw',
      cursorClassName: 'cursor-nesw-resize',
      markerClassName: 'rotate-90',
      x: () => 0,
      y: (targetGroup) => targetGroup.size.height,
    },
    {
      id: 'se',
      cursorClassName: 'cursor-nwse-resize',
      markerClassName: '',
      x: (targetGroup) => targetGroup.size.width,
      y: (targetGroup) => targetGroup.size.height,
    },
  ];

  return (
    <>
      <div
        className="nodrag nopan pointer-events-none absolute z-[80] h-0 w-0 overflow-visible"
        style={{
          left: group.position.x,
          top: group.position.y,
        }}
      >
        <div
          className="pointer-events-auto relative inline-flex min-w-[72px] cursor-grab select-none items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-[#181818]/90 px-3 py-1.5 text-xs font-medium text-white/85 shadow-lg backdrop-blur transition-colors hover:text-white active:cursor-grabbing"
          style={{
            borderColor: color.border,
            transform: `translate(16px, calc(-100% - 8px)) scale(${1 / zoom})`,
            transformOrigin: 'left bottom',
          }}
          onMouseDown={(event) => startDrag(event, 'move')}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: color.accent }} />
          <span className="block max-w-[210px] truncate">{group.name || t('groups.defaultName')}</span>
          <button
            type="button"
            aria-label="Group menu"
            className="ml-0.5 rounded-full px-1.5 text-sm leading-none text-white/35 transition-colors hover:bg-white/10 hover:text-white/75"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
          >
            ...
          </button>
          {menuOpen && (
            <GroupMenu
              group={group}
              onRenameGroup={onRenameGroup}
              onChangeGroupColor={onChangeGroupColor}
              onDeleteGroup={onDeleteGroup}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {handles.map((handle) => (
        <div
          key={handle.id}
          className="nodrag nopan pointer-events-none absolute z-[60] h-0 w-0 overflow-visible"
          style={{
            left: group.position.x + handle.x(group),
            top: group.position.y + handle.y(group),
          }}
        >
          <button
            type="button"
            aria-label={`Resize group ${handle.id}`}
            className={`group/resize pointer-events-auto h-6 w-6 border-none bg-transparent ${handle.cursorClassName}`}
            style={{
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              transformOrigin: 'center center',
            }}
            onMouseDown={(event) => startDrag(event, 'resize', handle.id)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className={`absolute inset-0 ${handle.markerClassName}`}>
              <div className="absolute bottom-1.5 right-1.5 h-3 w-3 rounded-br-[8px] border-b border-r border-white/20 transition-colors group-hover/resize:border-white/65" />
              <div className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-white/15 transition-colors group-hover/resize:bg-white/55" />
            </div>
          </button>
        </div>
      ))}
    </>
  );
}

export function GroupsOverlay({
  nodes,
  groups,
  onCreateGroup,
  onMoveGroup,
  onResizeGroup,
  onDeleteGroup,
  onRenameGroup,
  onChangeGroupColor,
}) {
  const zoom = useStore((store) => store.transform?.[2] || 1);
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const selectedNodeIds = useMemo(() => selectedNodes.map((node) => node.id), [selectedNodes]);
  const selectedBounds = useMemo(() => {
    if (selectedNodes.length < 2) return null;
    return getSelectedNodesBounds(selectedNodes);
  }, [selectedNodes]);

  useEffect(() => {
    if (!DEBUG_GROUPS) return;
    console.debug('[groups] overlay render', {
      groupCount: Object.keys(groups || {}).length,
      selectedCount: selectedNodeIds.length,
      selectedNodeIds,
    });
  }, [groups, selectedNodeIds]);

  return (
    <>
      <ViewportPortal>
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {Object.values(groups || {}).map((group) => {
            const color = getGroupColor(group.color);
            return (
              <div
                key={group.id}
                className="absolute rounded-[24px] border"
                style={{
                  left: group.position.x,
                  top: group.position.y,
                  width: group.size.width,
                  height: group.size.height,
                  background: color.background,
                  borderColor: color.border,
                  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02)`,
                }}
              />
            );
          })}
        </div>
      </ViewportPortal>

      <ViewportPortal>
        <div className="pointer-events-none absolute inset-0 z-[60]">
          <SelectionToolbar
            bounds={selectedBounds}
            zoom={zoom}
            selectedNodeIds={selectedNodeIds}
            onCreateGroup={onCreateGroup}
          />

          {Object.values(groups || {}).map((group) => (
            <GroupControls
              key={group.id}
              group={group}
              zoom={zoom}
              onMoveGroup={onMoveGroup}
              onResizeGroup={onResizeGroup}
              onDeleteGroup={onDeleteGroup}
              onRenameGroup={onRenameGroup}
              onChangeGroupColor={onChangeGroupColor}
            />
          ))}
        </div>
      </ViewportPortal>
    </>
  );
}
