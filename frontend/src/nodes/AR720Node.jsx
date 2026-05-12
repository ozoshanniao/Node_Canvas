import { memo } from 'react';
import { SpatialPreviewNode } from './SpatialPreviewNode';

export const AR720Node = memo(function AR720Node(props) {
  return <SpatialPreviewNode {...props} mode="ar720" title="AR720°" />;
});
