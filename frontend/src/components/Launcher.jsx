import React from 'react';

export function Launcher({ onLaunch }) {
  const triggerFolderPicker = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/select-folder');
      const { path } = await res.json();

      if (!path) return;

      const initRes = await fetch('http://127.0.0.1:8000/api/project/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      const result = await initRes.json();
      if (result.status === 'success') {
        onLaunch(path, result.data, null);
      }
    } catch (error) {
      console.error('Launcher Error:', error);
    }
  };

  const handleLoadProject = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/select-project-file');
      const data = await res.json();

      if (!data.projectPath) return;

      onLaunch(data.projectPath, data.content, data.projectFilePath);
    } catch (error) {
      console.error('Load Error:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 select-none font-light">
      <div className="w-full max-w-[460px] bg-[#141414] border border-white/5 rounded-[40px] p-12 shadow-2xl flex flex-col items-center gap-12">
        <div className="flex flex-col items-center gap-4">
          <div className="text-[64px] font-light tracking-tighter text-white leading-none">oZo</div>
          <div className="text-white/20 text-[10px] font-light tracking-[0.5em] uppercase">Node AI Canvas</div>
        </div>

        <div className="w-full flex flex-col gap-5">
          <button
            onClick={triggerFolderPicker}
            className="w-full bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 text-white rounded-[24px] py-7 px-8 flex flex-col items-center gap-1.5 transition-all group active:scale-[0.98]"
          >
            <span className="text-sm font-light tracking-wider">CREATE WORKSPACE</span>
            <span className="text-[9px] text-white/20 font-light tracking-widest uppercase group-hover:text-white/40">Select directory to initialize</span>
          </button>

          <button
            onClick={handleLoadProject}
            className="w-full bg-white text-black hover:bg-opacity-90 rounded-[24px] py-7 px-8 flex flex-col items-center gap-1.5 transition-all active:scale-[0.98]"
          >
            <span className="text-sm font-light tracking-wider">OPEN WORKSPACE</span>
            <span className="text-[9px] text-black/40 font-light tracking-widest uppercase">Load specific project JSON</span>
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 opacity-20">
          <div className="text-[9px] text-white font-light tracking-[0.3em] uppercase">Production Ready</div>
          <div className="text-[8px] text-white font-light">v1.0.0 - 2026-05</div>
        </div>
      </div>
    </div>
  );
}
