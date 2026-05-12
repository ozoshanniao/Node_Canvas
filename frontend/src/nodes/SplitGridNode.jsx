import { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { SplitGridSettingsModal } from '../components/SplitGridSettingsModal';
import { getSplitGridCount, getSplitGridLabel } from '../utils/gridPresets';
import { splitImageToGrid } from '../utils/imageSplit';
import { buildSplitGridGenerateSets } from '../utils/splitGridGenerateSets';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { countRender } from '../utils/perfDebug';
import { normalizeImageInputEdgeLabels } from '../utils/edgeLabels';
import { getMatchingPreviewUrl } from '../utils/imagePreview';

const getFirstImageUrl = (output) => {
  if (!Array.isArray(output)) return '';

  const first = output.find(Boolean);
  if (!first) return '';
  if (typeof first === 'string') return first;
  return first.url || first.src || first.imageUrl || '';
};

export const SplitGridNode = memo(function SplitGridNode({ id, data }) {
  countRender('SplitGridNode');
  const nodes = useNodes();
  const edges = useEdges();
  const { getNodes, setNodes, setEdges } = useReactFlow();
  const lastHandledRunRequestRef = useRef(data?.runRequestId);

  const upstreamImage = useMemo(() => {
    const inputEdge = edges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
    );
    if (!inputEdge) return { connected: false, url: '' };

    const sourceNode = nodes.find((node) => node.id === inputEdge.source);
    const url = getFirstImageUrl(getNodeImageOutput(sourceNode, inputEdge.sourceHandle, inputEdge, nodes, edges));
    return {
      connected: true,
      url,
      previewUrl: getMatchingPreviewUrl(sourceNode?.data, url),
    };
  }, [edges, id, nodes]);

  const upstreamPreviewUrl = upstreamImage.url;
  const previewUrl = upstreamImage.connected ? resolveImageUrl(upstreamImage.previewUrl || upstreamPreviewUrl) : '';
  const rows = Number(data?.rows) || 2;
  const cols = Number(data?.cols) || 3;
  const sliceCount = getSplitGridCount(rows, cols);
  const slices = Array.isArray(data?.slices) ? data.slices : [];
  const status = data?.status || 'idle';
  const isSplitting = status === 'splitting';
  const isConfigured = Boolean(data?.splitReady);
  const settingsOpen = Boolean(data?.settingsOpen);
  const hasValidGrid = Number.isInteger(rows) && rows > 0 && Number.isInteger(cols) && cols > 0;
  const generatedSetCount = Number(data?.generatedSetCount) || 0;
  const gridLabel = `${getSplitGridLabel(rows, cols)} (${sliceCount} images)`;
  const statusText =
    isSplitting
      ? 'Splitting...'
      : status === 'error'
        ? data?.error || 'Split failed'
        : slices.length > 0
          ? `${slices.length} slices ready`
          : isConfigured
            ? 'Configured'
            : 'Not configured';

  const updateNodeData = (nextData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...nextData,
          },
        };
      })
    );
  };

  useEffect(() => {
    if (!upstreamPreviewUrl) return;
    if (data?.sourceImageUrl === upstreamPreviewUrl && data?.previewImageUrl === upstreamPreviewUrl) return;

    updateNodeData({
      sourceImageUrl: upstreamPreviewUrl,
      previewImageUrl: upstreamPreviewUrl,
    });
  }, [data?.previewImageUrl, data?.sourceImageUrl, upstreamPreviewUrl]);

  const openSettings = (event) => {
    event.stopPropagation();
    updateNodeData({ settingsOpen: true });
  };

  const closeSettings = () => {
    updateNodeData({ settingsOpen: false });
  };

  const handleSaveSettings = (nextData) => {
    const gridChanged =
      nextData.layout !== data?.layout ||
      nextData.rows !== data?.rows ||
      nextData.cols !== data?.cols;

    updateNodeData({
      ...nextData,
      ...(gridChanged ? { slices: [], status: 'idle', error: '' } : {}),
    });
  };

  const applySettingsPatch = (nextData) => {
    const gridChanged =
      nextData.layout !== data?.layout ||
      nextData.rows !== data?.rows ||
      nextData.cols !== data?.cols;

    return {
      ...nextData,
      ...(gridChanged ? { slices: [], status: 'idle', error: '' } : {}),
    };
  };

  const handleCreateGenerateSets = (nextData) => {
    const settingsPatch = applySettingsPatch(nextData);
    const safeRows = Number(nextData.rows) || 0;
    const safeCols = Number(nextData.cols) || 0;
    const count = safeRows * safeCols;

    if (count <= 0) return;

    const existingNodes = getNodes();
    const currentNode = existingNodes.find((node) => node.id === id) || {
      id,
      type: 'splitGridNode',
      position: { x: 0, y: 0 },
      data,
    };

    const { nodesToAdd, edgesToAdd } = buildSplitGridGenerateSets({
      splitGridNode: {
        ...currentNode,
        data: {
          ...currentNode.data,
          ...settingsPatch,
        },
      },
      rows: safeRows,
      cols: safeCols,
      defaultPrompt: nextData.defaultPrompt || '',
      generateSettings: nextData.generateSettings || {},
      existingNodes,
      imageNodeType: 'imageNode',
      projectPath: data?.projectPath || window.currentProjectPath,
    });

    if (!nodesToAdd.length) return;

    const now = new Date().toISOString();
    setNodes((nds) =>
      nds
        .map((node) => {
          if (node.id !== id) return node;
          return {
            ...node,
            data: {
              ...node.data,
              ...settingsPatch,
              generatedSetCount: (node.data?.generatedSetCount || 0) + count,
              lastGeneratedAt: now,
              settingsOpen: false,
            },
          };
        })
        .concat(nodesToAdd)
    );
    setEdges((eds) => normalizeImageInputEdgeLabels(eds.concat(edgesToAdd)));
  };

  const handleSplit = async (event = { stopPropagation: () => {} }) => {
    event.stopPropagation();

    const sourceImageUrl = upstreamPreviewUrl || data?.previewImageUrl || data?.sourceImageUrl;
    const validRows = Number.isInteger(rows) && rows > 0;
    const validCols = Number.isInteger(cols) && cols > 0;

    if (!sourceImageUrl) {
      updateNodeData({
        status: 'error',
        error: 'No source image to split.',
      });
      return;
    }

    if (!validRows || !validCols) {
      updateNodeData({ settingsOpen: true });
      return;
    }

    updateNodeData({
      status: 'splitting',
      error: '',
      sourceImageUrl,
      previewImageUrl: sourceImageUrl,
    });

    try {
      const nextSlices = await splitImageToGrid({
        imageUrl: sourceImageUrl,
        rows,
        cols,
      });

      updateNodeData({
        slices: nextSlices,
        splitReady: true,
        status: 'success',
        error: '',
        lastSplitAt: new Date().toISOString(),
        sourceImageUrl,
        previewImageUrl: sourceImageUrl,
      });
    } catch (error) {
      console.error('[SplitGrid split failed]', error);
      updateNodeData({
        status: 'error',
        error: error?.message || 'Failed to split image.',
      });
    }
  };

  useEffect(() => {
    if (!data?.runRequestId || lastHandledRunRequestRef.current === data.runRequestId) return;
    lastHandledRunRequestRef.current = data.runRequestId;
    handleSplit();
  }, [data?.runRequestId]);

  return (
    <div className="relative h-full min-h-[260px] w-full min-w-[340px] select-none text-white group">
      <div className="canvas-node-card canvas-image-node-card relative flex h-full min-h-[260px] w-full min-w-[340px] flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] transition-colors duration-100 hover:border-white/20">
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs font-light text-white/70 backdrop-blur-md">
            <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 17h16M7 4v16M17 4v16" />
            </svg>
            <span>Split Grid</span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 nodrag nopan">
            <button
              type="button"
              onClick={openSettings}
              className="rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-light text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={handleSplit}
              disabled={isSplitting}
              className="rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-light text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
            >
              {isSplitting ? 'Splitting' : 'Split'}
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-black/30">
          {previewUrl ? (
            <>
              <img
                src={previewUrl}
                alt="Split grid source preview"
                draggable={false}
                className="canvas-image-preview absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
              />
              {hasValidGrid && (
                <div className="pointer-events-none absolute inset-0">
                  {Array.from({ length: Math.max(cols - 1, 0) }, (_, index) => (
                    <div
                      key={`col-${index + 1}`}
                      className="absolute top-0 h-full w-px bg-white/30"
                      style={{ left: `${((index + 1) / cols) * 100}%` }}
                    />
                  ))}
                  {Array.from({ length: Math.max(rows - 1, 0) }, (_, index) => (
                    <div
                      key={`row-${index + 1}`}
                      className="absolute left-0 h-px w-full bg-white/30"
                      style={{ top: `${((index + 1) / rows) * 100}%` }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-[190px] items-center justify-center text-sm font-light text-white/25">
              Connect image
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35" />
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-white/5 bg-[#141414]/90 px-4 py-3 text-[11px] font-light backdrop-blur-md">
          <InfoItem label="Grid" value={gridLabel} />
          <InfoItem label="Slices" value={slices.length > 0 ? `${slices.length} ready` : 'Not split'} />
          <InfoItem label="Sets" value={generatedSetCount > 0 ? `${generatedSetCount} created` : 'No generate sets'} />
          <InfoItem label="Status" value={statusText} tone={status === 'error' ? 'error' : 'normal'} />
        </div>
      </div>

      <Handle
        type="target"
        id="image:in"
        position={Position.Left}
        className="!left-[-5px] !top-1/2 !z-30 !h-2 !w-2 !-translate-y-1/2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
      />

      <Handle
        type="source"
        id="image:out"
        position={Position.Right}
        className="!right-[-5px] !top-1/2 !z-30 !h-2 !w-2 !-translate-y-1/2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
      />

      <SplitGridSettingsModal
        open={settingsOpen}
        data={data}
        onSave={handleSaveSettings}
        onCreateSets={handleCreateGenerateSets}
        onClose={closeSettings}
      />
    </div>
  );
});

function InfoItem({ label, value, tone = 'normal' }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 truncate uppercase tracking-[0.16em] text-white/25">{label}</div>
      <div className={`truncate ${tone === 'error' ? 'text-red-300/80' : 'text-white/70'}`}>{value}</div>
    </div>
  );
}
