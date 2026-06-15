import { useMemo, useState } from 'react';
import { DOCK_CATEGORIES, getDockCategoryNodes } from '../utils/nodeCategories';
import { NODE_DEFINITIONS, getNodeDefinitionText } from '../nodes/nodeDefinitions';
import { useI18n } from '../hooks/useI18n';

const CATEGORY_DOTS = {
  Text: 'bg-white/45',
  Image: 'bg-white/35',
  Video: 'bg-white/25',
  Audio: 'bg-white/20',
  Tools: 'bg-white/30',
};

const DockButton = ({ active, disabled = false, children, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-light transition-colors duration-100 active:scale-95 ${
      active
        ? 'bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.18)]'
        : disabled
          ? 'cursor-default text-white/25 opacity-40'
          : 'cursor-pointer text-white/50 hover:bg-white/5 hover:text-white'
    }`}
  >
    {children}
  </button>
);

const NodeItem = ({ definition, onCreateNode, t }) => (
  <button
    type="button"
    onClick={() => onCreateNode(definition.type)}
    className="group flex w-full items-center justify-between gap-4 rounded-[14px] px-4 py-3 text-left transition-colors hover:bg-white/5"
  >
    <div className="min-w-0">
      <div className="truncate text-sm font-light text-white/75 group-hover:text-white">
        {getNodeDefinitionText(t, definition)}
      </div>
    </div>
    <span className="text-xs text-white/20 transition-colors group-hover:text-white/45">&gt;</span>
  </button>
);

export function NodeDock({ onCreateNode, onRunSelected, selectedRunnableNode }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const { t } = useI18n();

  const activeDefinition = useMemo(
    () => DOCK_CATEGORIES.find((category) => category.id === activeCategory),
    [activeCategory]
  );
  const activeNodes = useMemo(
    () => (activeDefinition ? getDockCategoryNodes(activeDefinition, NODE_DEFINITIONS) : []),
    [activeDefinition]
  );

  const handleCategoryClick = (categoryId) => {
    setActiveCategory((current) => (current === categoryId ? null : categoryId));
  };

  const handleCreateNode = (type) => {
    onCreateNode(type);
    setActiveCategory(null);
  };

  const handleRun = () => {
    if (!selectedRunnableNode) return;
    setActiveCategory(null);
    onRunSelected();
  };

  return (
    <div
      onMouseDown={(event) => event.stopPropagation()}
      className="absolute bottom-6 left-1/2 z-[99] -translate-x-1/2 select-none pointer-events-auto"
    >
      {activeDefinition && (
        <div className="absolute bottom-[64px] left-1/2 w-[360px] -translate-x-1/2 rounded-[24px] border border-white/10 bg-[#181818]/90 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-2">
            <div className="text-[11px] font-light uppercase tracking-[0.24em] text-white/35">
              {t(`category.${activeDefinition.id}`) || activeDefinition.label}
            </div>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className="rounded-full px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
            >
              Esc
            </button>
          </div>

          {activeNodes.length > 0 ? (
            <div className="grid gap-1">
              {activeNodes.map((definition) => (
                <NodeItem
                  key={definition.type}
                  definition={definition}
                  t={t}
                  onCreateNode={handleCreateNode}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-[18px] border border-white/5 bg-black/20 text-sm font-light text-white/25">
              {t('dock.comingSoon')}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#141414]/65 px-3 py-2 shadow-[0_15px_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
        {DOCK_CATEGORIES.map((category) => (
          <DockButton
            key={category.id}
            active={activeCategory === category.id}
            onClick={() => handleCategoryClick(category.id)}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOTS[category.id] || 'bg-white/30'}`} />
            {t(`category.${category.id}`) || category.label}
          </DockButton>
        ))}

        <div className="mx-1 h-4 w-px bg-white/10" />

        <DockButton
          active={Boolean(selectedRunnableNode)}
          disabled={!selectedRunnableNode}
          onClick={handleRun}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
          {t('dock.run')}
        </DockButton>
      </div>
    </div>
  );
}
