import { useState, useRef, useEffect } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { useImageAspect } from '../hooks/useImageAspect';
import { getNodeImageOutput, getNodeTextOutput } from '../utils/nodeOutputs';
import { setLastNodeDefaults } from '../utils/nodeDefaults';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { getImageNodeAspectRatio, getImageNodeSizeByAspectRatio } from '../utils/nodeSizing';
import { countRender } from '../utils/perfDebug';
import {
  fetchImageGenerationRegistry,
  getImageAspectRatioOptions,
  getImageModelConfig,
  getImageModelOptions,
  getImageProviderOptions,
  getImageResolutionOptions,
  normalizeImageGenerationSettings,
} from '../utils/imageGenerationOptions';

// 1. 追加解构 id
export function ImageNode({ id, data }) {
  countRender('ImageNode');
  const containerRef = useRef(null); // 🌟 建立容器引用
  const lastHandledRunRequestRef = useRef(data?.runRequestId);
  const { setNodes, getNodes, getEdges, setEdges } = useReactFlow();

  const [registry, setRegistry] = useState(null); // 🌟 存储后端 specs
  const [showAdvanced, setShowAdvanced] = useState(false); // 🌟 控制副胶囊显示
  const [currentIndex, setCurrentIndex] = useState(0); // 🌟 记录当前预览的是第几张图

  useEffect(() => {
  const fetchSpecs = async () => {
    try {
      const result = await fetchImageGenerationRegistry();
      setRegistry(result);
    } catch (err) {
      console.error("抓取规格失败:", err);
    }
  };
  fetchSpecs();
}, []);

  // 🌟 新增：图片比例自动校准逻辑 (与 ImageInputNode 保持绝对一致)
  const handleImageLoad = useImageAspect(id, containerRef);
  
  // --- 2. 核心状态管理 (升级为全局受控) ---
  
  // 🌟 读取主画布派发过来的值，如果为空则自动fallback到默认值
  const normalizedGenerationSettings = normalizeImageGenerationSettings(data, registry);
  const provider = normalizedGenerationSettings.provider;
  const providerOptions = getImageProviderOptions(registry);
  const availableModels = getImageModelOptions(provider, registry).map((item) => item.id);
  const model = normalizedGenerationSettings.model;

  // 🌟 从统一配置源里抓取当前模型的“能力说明书”
  const currentSpec = getImageModelConfig(provider, model, registry) || {};

  const availableRatios = getImageAspectRatioOptions(provider, model, registry).map((item) => item.id);
  const availableResolutions = getImageResolutionOptions(provider, model, registry).map((item) => item.id);
  const ratio = normalizedGenerationSettings.aspectRatio || getImageNodeAspectRatio(data);
  const resolution = normalizedGenerationSettings.resolution;

  const imageUrlForBackend = async (url) => {
    if (!url || !url.startsWith('blob:')) return url;
    const blob = await fetch(url).then((res) => res.blob());
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 【唯一保留的局部状态】控制当前打开的下拉菜单（因为画布主壳不需要关心谁的菜单开了）
  const [activeMenu, setActiveMenu] = useState(null);

  // 🌟 智能比例校准：确保节点永远缩放在 600x600 的安全区内
  const handleRatioChange = (ratioStr) => {
    const { width, height } = getImageNodeSizeByAspectRatio(ratioStr);

    // 1. 同步数据状态
    updateNodeData({ ratio: ratioStr, aspectRatio: ratioStr });

    // 2. 物理调整节点尺寸
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            width,
            height,
          };
        }
        return node;
      })
    );
  };

  // 🌟 必须定义这个函数，否则点击菜单会崩溃
  const updateNodeData = (newData) => {
    setLastNodeDefaults('imageGeneration', newData);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );
  };

  const toggleMenu = (menuName) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  // 服务商切换联动
  const handleProviderSelect = (value) => {
    const nextSettings = normalizeImageGenerationSettings(
      {
        ...data,
        provider: value,
        model: undefined,
        ratio: undefined,
        aspectRatio: undefined,
        resolution: undefined,
      },
      registry
    );
    updateNodeData({
      provider: nextSettings.provider,
      model: nextSettings.model,
      ratio: nextSettings.aspectRatio,
      aspectRatio: nextSettings.aspectRatio,
      resolution: nextSettings.resolution,
    });
    setActiveMenu(null);
  };

  const handleModelSelect = (value) => {
    const nextSettings = normalizeImageGenerationSettings(
      {
        ...data,
        provider,
        model: value,
      },
      registry
    );
    updateNodeData({
      model: nextSettings.model,
      ratio: nextSettings.aspectRatio,
      aspectRatio: nextSettings.aspectRatio,
      resolution: nextSettings.resolution,
    });
    setActiveMenu(null);
  };

  // 1. 在组件顶部添加状态
  const [isLoading, setIsLoading] = useState(false);

  const getFlowingEdgeIds = (edges) =>
    edges
      .filter((edge) => edge.target === id)
      .map((edge) => edge.id);

  const getRelatedEdgeIds = (edges) =>
    edges
      .filter((edge) => edge.target === id || edge.source === id)
      .map((edge) => edge.id);

// 2. 修改 handleRun 函数
  const handleRun = async (e = { stopPropagation: () => {} }) => {
    if (isLoading) return; // 🌟 防呆：如果正在加载，直接拦截
    e.stopPropagation(); // 防止点击按钮触发节点的选中状态

    setIsLoading(true); // 🌟 开始加载

    // 🌟 A. 开启流动动画：找到所有连向自己的线，注入 CSS 类名
    setEdges((eds) => {
      const flowingEdgeIds = getFlowingEdgeIds(eds);
      
      const incomingEdgeIds = eds.filter((edge) => edge.target === id).map((edge) => edge.id);
      const outgoingEdgeIds = eds.filter((edge) => edge.source === id).map((edge) => edge.id);

      console.log('[ImageNode flowing:start]', {
        nodeId: id,
        totalEdges: eds.length,
        incomingCount: incomingEdgeIds.length,
        outgoingCount: outgoingEdgeIds.length,
        matchedCount: flowingEdgeIds.length,
        edgeIds: flowingEdgeIds,
      });

      return eds.map((edge) => {
        if (flowingEdgeIds.includes(edge.id)) {
          return { ...edge, className: 'flowing', data: { ...edge.data, flowing: true } }; // 注入刚才写的 CSS 类
        }
        return edge;
      });
    });
    
    // 获取全场最新的快照
    const allNodes = getNodes();
    const allEdges = getEdges();

    // 🌟 优先级：节点私有数据 > 全局保底 > 默认空串
    const activePath = data.projectPath || window.currentProjectPath || "";

    if (!activePath) {
      console.error("❌ 运行失败：未检测到有效的项目路径");
      setIsLoading(false);
      setEdges((eds) => {
        const flowingEdgeIds = getFlowingEdgeIds(eds);
        console.log('[ImageNode flowing:clear]', {
          nodeId: id,
          totalEdges: eds.length,
          matchedCount: flowingEdgeIds.length,
          edgeIds: flowingEdgeIds,
          reason: 'missing-project-path',
        });

        return eds.map((edge) =>
          flowingEdgeIds.includes(edge.id)
            ? { ...edge, className: '', data: { ...edge.data, flowing: false } }
            : edge
        );
      });
      return;
    }

    // 🌟 核心：拓扑动态索引扫描
    // 1. 获取所有连向本节点 image:in 端口的线
  try {
    const imageEdges = allEdges.filter(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === "image:in"
    );

    // 2. 按照连线在数组中的顺序（即连线先后顺序）提取上游节点的图片
    const connectedImages = await Promise.all(imageEdges.map(async (edge, index) => {
      const sourceNode = allNodes.find((n) => n.id === edge.source);
      // 优先取单图 url，如果没有则取多图数组的第一张
      const urls = getNodeImageOutput(sourceNode, edge.sourceHandle, edge, allNodes, allEdges);
      const url = await imageUrlForBackend(urls[0]);
      return { index, url };
    }));

    const runtimeNodes = allNodes.map((n) => {
      if (n.type === 'textConstruction') {
        const resolvedText = getNodeTextOutput(n, allNodes, allEdges);
        return {
          id: n.id,
          type: n.type,
          data: { ...n.data, text: resolvedText, resolvedText },
          position: n.position,
          width: n.width,
          height: n.height,
        };
      }

      if (n.type === 'routeNode') {
        const routedText = getNodeTextOutput(n, allNodes, allEdges);
        return {
          id: n.id,
          type: n.type,
          data: { ...n.data, text: routedText, routedText },
          position: n.position,
          width: n.width,
          height: n.height,
        };
      }

      return {
        id: n.id,
        type: n.type,
        data: n.data,
        position: n.position,
        width: n.width,
        height: n.height,
      };
    });

    const workflowData = {
      triggerId: id, // 记录是哪个图片节点点的运行
      nodes: runtimeNodes,
      edges: allEdges,
      imageInputs: connectedImages.filter((item) => !!item.url),
      projectPath: data.projectPath || window.currentProjectPath // 🌟 必须包含这个字段！
    };

      // 🌟 真正的全栈握手请求
      const response = await fetch('http://127.0.0.1:8000/run-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflowData),
      });

      const result = await response.json();
      if (result.status === 'success') {
        // 🌟 将后端返回的图片 URL 写回当前节点的 data
        updateNodeData({ url: result.data.url, urls: result.data.urls });
        console.log(" 图片已生成并渲染:", result.data.url || result.data.urls);
      }
      // 如果后端收到了，控制台会打印 {"status": "success", ...}
    } catch (error) {
      console.error(" 渲染失败:", error);
    } finally {
        setIsLoading(false); // 🌟 结束加载，恢复按钮点击

      // 🌟 B. 关闭流动动画：无论成功失败，停止光流
      setEdges((eds) => {
        const flowingEdgeIds = getFlowingEdgeIds(eds);
        console.log('[ImageNode flowing:clear]', {
          nodeId: id,
          totalEdges: eds.length,
          matchedCount: flowingEdgeIds.length,
          edgeIds: flowingEdgeIds,
          reason: 'finally',
        });

        return eds.map((edge) => {
          if (flowingEdgeIds.includes(edge.id)) {
            return { ...edge, className: '', data: { ...edge.data, flowing: false } }; // 移除类名，恢复静态
          }
          return edge;
        });
      });
    }
  };

  // 🌟 核心：计算当前应显示的图片 URL
  useEffect(() => {
    if (!data?.runRequestId || lastHandledRunRequestRef.current === data.runRequestId) return;
    lastHandledRunRequestRef.current = data.runRequestId;
    handleRun();
  }, [data?.runRequestId]);

  const rawDisplayUrl = Array.isArray(data.urls) && data.urls.length > 0
    ? data.urls[currentIndex]
    : data.url
  const displayUrl = resolveImageUrl(rawDisplayUrl, data?.projectPath);

  useEffect(() => {
    if (!rawDisplayUrl) return undefined;
    if (data?.previewUrl && data?.previewSourceUrl === rawDisplayUrl) return undefined;

    // Thumbnail generation removed - images are now stored as relative paths
    return undefined;
  }, [data?.previewSourceUrl, data?.previewUrl, id, rawDisplayUrl, setNodes]);

  return (
    <div ref={containerRef} // 🌟 绑定引用
      className="canvas-node-card canvas-image-node-card bg-[#181818] rounded-[24px] w-full h-full min-w-[50px] min-h-[50px] flex flex-col text-white select-none group relative border border-white/5 transition-colors duration-100 hover:border-white/20">
      
    {showAdvanced && currentSpec.n && (
          <div className="absolute -top-28 left-[23%] -translate-x-1/2 bg-[#181818]/90 backdrop-blur-xl border border-white/5 rounded-2xl px-6 py-3 flex items-center shadow-2xl animate-in fade-in slide-in-from-bottom-2 z-[60] nodrag opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-[1000ms] group-hover:delay-0">
            <div className="flex flex-col gap-1 min-w-[100px]">
              <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{currentSpec.n.label}</span>
                <span className="text-white/60">{data.n || currentSpec.n.default}</span>
              </div>
              <input 
                type="range"
                min={currentSpec.n.min}
                max={currentSpec.n.max}
                step={currentSpec.n.step}
                value={data.n || currentSpec.n.default}
                onChange={(e) => updateNodeData({ n: parseInt(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>
          </div>
        )}
      
      {/* 1. 顶部悬浮工具栏 (1秒延时退出，before 伪元素防断联) */}
      <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-[#181818] border border-white/5 rounded-full px-6 py-2.5 flex items-center gap-2 text-sm text-white/60 shadow-xl z-50 font-light whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 delay-[1000ms] group-hover:delay-0 before:content-[''] before:absolute before:top-full before:left-0 before:w-full before:h-14">
        
        {(currentSpec.n || currentSpec.quality || currentSpec.features?.includes('google_search')) && (
          <span
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`text-xs w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all nodrag ${showAdvanced ? 'bg-white text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
          >
            &
          </span>
          )}

        <div className="w-[1px] h-3 bg-white/10" />
        
        {/* 【服务商下拉】 */}
        <div className="relative nodrag">
          <div 
            onClick={() => toggleMenu('provider')}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${activeMenu === 'provider' ? 'text-white' : 'hover:text-white'}`}
          >
            {provider} <span className="text-[9px] opacity-30 transform scale-90">▼</span>
          </div>
          {activeMenu === 'provider' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[100px] text-center animate-in fade-in zoom-in-95 duration-150">
              {providerOptions.map((option) => (
                <div 
                  key={option.id}
                  onClick={() => handleProviderSelect(option.id)}
                  className={`px-4 py-2 text-xs cursor-pointer transition-colors ${provider === option.id ? 'text-white bg-white/5 font-normal' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  {option.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-3 bg-white/10" />

        {/* 【模型下拉（依据服务商动态渲染）】 */}
        <div className="relative nodrag">
          <div 
            onClick={() => toggleMenu('model')}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${activeMenu === 'model' ? 'text-white' : 'hover:text-white'}`}
          >
            {model} <span className="text-[9px] opacity-30 transform scale-90">▼</span>
          </div>
          {activeMenu === 'model' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[140px] text-center animate-in fade-in zoom-in-95 duration-150">
              {availableModels.map((item) => (
                <div 
                  key={item}
                  onClick={() => handleModelSelect(item)}
                  className={`px-4 py-2 text-xs cursor-pointer transition-colors ${model === item ? 'text-white bg-white/5 font-normal' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-3 bg-white/10" />

        {/* 【比例下拉（11 种比例，带自适应滚动限制）】 */}
        <div className="relative nodrag">
          <div 
            onClick={() => toggleMenu('ratio')}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${activeMenu === 'ratio' ? 'text-white' : 'hover:text-white'}`}
          >
            {ratio} <span className="text-[9px] opacity-30 transform scale-90">▼</span>
          </div>
          {activeMenu === 'ratio' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[80px] max-h-[220px] overflow-y-auto text-center nowheel animate-in fade-in zoom-in-95 duration-150">
              {availableRatios.map((item) => (
                <div 
                  key={item}
                  onClick={(e) => { 
                   e.stopPropagation();    // 阻止冒泡，防止触发节点选中
                   handleRatioChange(item); // 🌟 触发联动校准
                   setActiveMenu(null); }}
                  className={`px-4 py-2 text-xs cursor-pointer transition-colors ${ratio === item ? 'text-white bg-white/5 font-normal' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-3 bg-white/10" />

        {/* 【分辨率下拉】 */}
        <div className="relative nodrag">
          <div 
            onClick={() => toggleMenu('resolution')}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${activeMenu === 'resolution' ? 'text-white' : 'hover:text-white'}`}
          >
            {resolution} <span className="text-[9px] opacity-30 transform scale-90">▼</span>
          </div>
          {activeMenu === 'resolution' && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[80px] text-center animate-in fade-in zoom-in-95 duration-150">
              {availableResolutions.map((item) => (
                <div 
                  key={item}
                  onClick={() => { updateNodeData({ resolution: item }); setActiveMenu(null); }}
                  className={`px-4 py-2 text-xs cursor-pointer transition-colors ${resolution === item ? 'text-white bg-white/5 font-normal' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

          {currentSpec.quality && (
          <>
            <div className="w-[1px] h-3 bg-white/10" />
            <div className="relative nodrag">
              <div onClick={() => toggleMenu('quality')} className={`cursor-pointer transition-colors flex items-center gap-1.5 ${activeMenu === 'quality' ? 'text-white' : 'hover:text-white'}`}>
                <span className="opacity-40">Q:</span>{data.quality || 'auto'} <span className="text-[9px] opacity-30 transform scale-90">▼</span>
              </div>
              {activeMenu === 'quality' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[80px] text-center animate-in fade-in zoom-in-95">
                  {currentSpec.quality.map(q => (
                    <div key={q} onClick={() => { updateNodeData({ quality: q }); setActiveMenu(null); }} className={`px-4 py-2 text-xs cursor-pointer transition-colors ${data.quality === q ? 'text-white bg-white/5' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>{q}</div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
          
        <div className="w-[1px] h-3 bg-white/10" />
        
        {/* 向上箭头生成触发按钮 */}
        <button 
          onClick={handleRun}
          disabled={isLoading} // 🌟 物理禁用按钮
          className={`w-5 h-5 rounded-full bg-[#222222] flex items-center justify-center text-white/60 hover:bg-white hover:text-black transition-all nodrag ${
            isLoading ? 'bg-white text-black' : 'bg-[#222222] text-white/60 hover:bg-white hover:text-black'
          }`}
        >
          {isLoading ? (
            // 🌟 旋转加载圆圈
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          // 原有的箭头
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          )}
        </button>
      </div>

{/* 2. 主体全域画布（恢复 flex-1 弹性高宽，内部包含悬浮文字） */}
      <div className="absolute inset-0 nowheel overflow-hidden rounded-[24px] flex items-center justify-center">
        
{/* 🌟 悬浮毛玻璃胶囊：完美对齐 ImageInput 设计语言 */}
      {/* 顶部悬浮文字标签栏 */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-white/50 text-[11px] font-light bg-[#121212]/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 pointer-events-none">
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Image Generation</span>
      </div>

{/* 条件渲染：有图片链接时全网格平铺，无图片时完美居中显示提示词 */}
        {displayUrl ? (
          <img 
            src={displayUrl}
            alt="AI Generated"
            onLoad={handleImageLoad} // 🌟 调用 Hook 返回的逻辑
            draggable={false}
            className="canvas-image-preview absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-150"
          />
        ) : (
          <div className="text-white/10 text-sm font-extralight tracking-wide">
            No image generated
          </div>
        )}
      </div>


{/* 4. 悬浮触控说明端口 */}
      <div className="absolute left-0 top-[35%] flex items-center z-20">
        <Handle 
          type="target" 
          id="text:prompt" // 声明只接收 text 类型的连线
          position={Position.Left} 
          className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-4px] group-hover:!border-white transition-colors"
        />
        <span className="absolute left-4 text-[11px] text-white/40 font-light pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[#181818] px-1 rounded">prompt</span>
      </div>
      <div className="absolute left-0 top-[55%] flex items-center z-20">
        <Handle 
          type="target" 
          id="image:in" // 声明只接收 image 类型的连线
          position={Position.Left} 
          className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-4px] group-hover:!border-white transition-colors"
        />
        <span className="absolute left-4 text-[11px] text-white/40 font-light pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[#181818] px-1 rounded">image</span>
      </div>

      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center z-20">
        <span className="absolute right-4 text-[11px] text-white/40 font-light pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[#181818] px-1 rounded">
          image:out
        </span>
        <Handle 
          type="source" 
          id="image:out" 
          position={Position.Right} 
          className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !right-[-4px] group-hover:!border-white transition-colors shadow-[0_0_8px_rgba(255,255,255,0.2)]"
        />
      </div>

      {/* 5. 隐形智能拉伸触控区 */}
      <NodeResizeCorner minWidth={120} minHeight={90} keepAspectRatio />
    </div>
  );
}
