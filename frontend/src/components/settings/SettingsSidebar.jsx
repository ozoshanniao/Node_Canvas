export function SettingsSidebar({ tabs, activeTab, onChange, label }) {
  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/5 bg-black/15 p-3 md:w-[210px] md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-5"
      aria-label={label}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
            activeTab === tab.id
              ? 'bg-white/10 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
              : 'font-medium text-white/40 hover:bg-white/5 hover:text-white/75'
          }`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
