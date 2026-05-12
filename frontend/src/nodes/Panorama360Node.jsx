import { memo } from 'react';
import { SpatialPreviewNode } from './SpatialPreviewNode';

export const Panorama360Node = memo(function Panorama360Node(props) {
  return <SpatialPreviewNode {...props} mode="panorama360" title="360°" />;
});
