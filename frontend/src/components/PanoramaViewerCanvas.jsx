import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { resolveImageUrl } from '../utils/resolveImageUrl';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const degToRad = (value) => (value * Math.PI) / 180;

const PITCH_LIMITS = {
  ar720: [-89, 89],
  panorama360: [-15, 15],
};

const getSafeUrlInfo = (url) => ({
  prefix: url?.startsWith('data:image/') ? `${url.slice(0, 72)}...` : url,
  length: typeof url === 'string' ? url.length : 0,
  isDataUrl: url?.startsWith('data:image/') || false,
  isBlob: url?.startsWith('blob:') || false,
  isHttp: url?.startsWith('http://') || url?.startsWith('https://') || false,
});

const getLookTarget = ({ yaw, pitch }) => {
  const yawRad = degToRad(yaw - 90);
  const pitchRad = degToRad(pitch);
  const x = Math.cos(pitchRad) * Math.cos(yawRad);
  const y = Math.sin(pitchRad);
  const z = Math.cos(pitchRad) * Math.sin(yawRad);
  return new THREE.Vector3(x, y, z);
};

export const PanoramaViewerCanvas = forwardRef(function PanoramaViewerCanvas(
  {
    imageUrl,
    mode = 'ar720',
    state,
    onStateChange,
    onReadyChange,
    lockPitch = false,
  },
  ref
) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const textureRef = useRef(null);
  const rafRef = useRef(null);
  const stateRef = useRef(state);
  const dragRef = useRef(null);
  const textureReadyRef = useRef(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    stateRef.current = state;
    renderFrame();
  }, [state]);

  const applyStateToCamera = useCallback((camera, nextState = stateRef.current) => {
    if (!camera) return;

    camera.fov = clamp(Number(nextState?.fov) || 70, 35, 110);
    camera.lookAt(getLookTarget(nextState));
    camera.updateProjectionMatrix();
  }, []);

  const applyCameraState = useCallback(
    (nextState = stateRef.current) => {
      applyStateToCamera(cameraRef.current, nextState);
    },
    [applyStateToCamera]
  );

  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    applyCameraState();
    renderer.render(scene, camera);
  }, [applyCameraState]);

  const updateViewerState = useCallback(
    (patch) => {
      const [minPitch, maxPitch] = PITCH_LIMITS[mode] || PITCH_LIMITS.ar720;
      const nextState = {
        yaw: Number(stateRef.current?.yaw) || 0,
        pitch: Number(stateRef.current?.pitch) || 0,
        fov: Number(stateRef.current?.fov) || 70,
        ...patch,
      };

      nextState.yaw = ((nextState.yaw % 360) + 360) % 360;
      nextState.pitch = clamp(nextState.pitch, minPitch, maxPitch);
      nextState.fov = clamp(nextState.fov, 35, 110);
      stateRef.current = nextState;
      onStateChange?.(nextState);
      renderFrame();
    },
    [mode, onStateChange, renderFrame]
  );

  const getNormalizedState = useCallback(
    (nextState = stateRef.current) => {
      const [minPitch, maxPitch] = PITCH_LIMITS[mode] || PITCH_LIMITS.ar720;
      return {
        yaw: ((Number(nextState?.yaw) || 0) % 360 + 360) % 360,
        pitch: clamp(Number(nextState?.pitch) || 0, minPitch, maxPitch),
        fov: clamp(Number(nextState?.fov) || 70, 35, 110),
      };
    },
    [mode]
  );

  const captureCurrentView = useCallback(
    async ({ yaw, pitch, fov, width = 1536, height = 864, filename } = {}) => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      if (!scene || !camera || !textureReadyRef.current) {
        throw new Error('Panorama viewer is not ready to capture.');
      }

      const originalState = getNormalizedState(stateRef.current);
      const captureState = getNormalizedState({
        yaw: yaw ?? originalState.yaw,
        pitch: pitch ?? originalState.pitch,
        fov: fov ?? originalState.fov,
      });
      const captureCamera = camera.clone();
      const captureRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });

      try {
        captureRenderer.setPixelRatio(1);
        captureRenderer.setClearColor(0x000000, 0);
        captureRenderer.setSize(width, height, false);
        captureCamera.aspect = width / height;
        applyStateToCamera(captureCamera, captureState);
        captureRenderer.render(scene, captureCamera);

        let dataUrl = '';
        try {
          dataUrl = captureRenderer.domElement.toDataURL('image/png');
        } catch (captureError) {
          throw new Error(
            `Failed to capture current view. Remote image may not allow canvas export. ${
              captureError?.message || ''
            }`
          );
        }

        return {
          dataUrl,
          width,
          height,
          yaw: captureState.yaw,
          pitch: captureState.pitch,
          fov: captureState.fov,
          filename,
        };
      } finally {
        captureRenderer.forceContextLoss?.();
        captureRenderer.dispose();
        applyCameraState(originalState);
        renderFrame();
      }
    },
    [applyCameraState, applyStateToCamera, getNormalizedState, renderFrame]
  );

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        updateViewerState({ yaw: 0, pitch: 0, fov: 70 });
      },
      center() {
        updateViewerState({ yaw: 0, pitch: 0 });
      },
      captureCurrentView,
    }),
    [captureCurrentView, updateViewerState]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !imageUrl) return undefined;

    setError('');
    setIsLoading(true);
    textureReadyRef.current = false;
    onReadyChange?.(false);
    const resolvedUrl = resolveImageUrl(imageUrl);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const texture = textureLoader.load(
      resolvedUrl,
      (loadedTexture) => {
        textureReadyRef.current = true;
        setIsLoading(false);
        onReadyChange?.(true);
        console.log('[PanoramaViewer texture loaded]', {
          mode,
          originalUrl: getSafeUrlInfo(imageUrl),
          resolvedUrl: getSafeUrlInfo(resolvedUrl),
          imageWidth: loadedTexture.image?.width,
          imageHeight: loadedTexture.image?.height,
        });
        renderFrame();
      },
      undefined,
      (loadError) => {
        console.error('[PanoramaViewer texture load failed]', {
          mode,
          originalUrl: getSafeUrlInfo(imageUrl),
          resolvedUrl: getSafeUrlInfo(resolvedUrl),
          error: loadError,
        });
        textureReadyRef.current = false;
        setIsLoading(false);
        onReadyChange?.(false);
        setError('Failed to load panorama image. Please check whether the image URL is still available.');
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    textureRef.current = texture;

    const geometry = new THREE.SphereGeometry(500, 96, 64);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    meshRef.current = mesh;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      applyCameraState();
      renderer.render(scene, camera);
    };

    const animate = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(animate);
    };

    resize();
    animate();

    const handlePointerDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        yaw: Number(stateRef.current?.yaw) || 0,
        pitch: Number(stateRef.current?.pitch) || 0,
      };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event) => {
      if (!dragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      updateViewerState({
        yaw: dragRef.current.yaw - dx * 0.18,
        pitch: mode === 'panorama360' && lockPitch ? dragRef.current.pitch : dragRef.current.pitch + dy * 0.14,
      });
    };

    const handlePointerUp = (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = null;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    };

    const handleWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateViewerState({
        fov: (Number(stateRef.current?.fov) || 70) + event.deltaY * 0.04,
      });
    };

    renderer.domElement.className = 'nodrag nopan h-full w-full cursor-grab active:cursor-grabbing';
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', resize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      textureReadyRef.current = false;
      setIsLoading(false);
      onReadyChange?.(false);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      texture.dispose();
      material.dispose();
      geometry.dispose();
      renderer.forceContextLoss?.();
      renderer.dispose();
      console.log('[PanoramaViewer cleanup]', { mode });
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      textureRef.current = null;
    };
  }, [applyCameraState, imageUrl, lockPitch, mode, onReadyChange, renderFrame, updateViewerState]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={mountRef} className="h-full w-full" />
      {error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm font-light text-white/45">
          {error}
        </div>
      )}
      {isLoading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 px-6 text-center text-sm font-light text-white/35">
          Loading panorama...
        </div>
      )}
    </div>
  );
});
