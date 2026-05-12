/**
 * Upload image to project input directory
 *
 * Handles file objects, data URLs, and base64 strings
 * Returns relative path and metadata for storage in node.data
 */

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Convert File or Blob to data URL
 */
const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Upload image to input directory
 *
 * @param {File|Blob|string} fileOrDataUrl - File object, Blob, or data URL string
 * @param {Object} options
 * @param {string} options.projectPath - Project directory path (required)
 * @param {string} options.sourceKind - Source type: upload, paste, drop, split, capture, output
 * @param {string} options.filename - Original filename (optional)
 * @param {string} options.mimeType - MIME type (optional, auto-detected if not provided)
 * @returns {Promise<Object>} { url, width, height, mimeType, bytes, filename }
 */
export async function uploadImageToInput(fileOrDataUrl, options = {}) {
  const { projectPath, sourceKind = 'upload', filename, mimeType } = options;

  if (!projectPath) {
    throw new Error('projectPath is required for uploadImageToInput');
  }

  let imageData = '';
  let detectedMimeType = mimeType;
  let detectedFilename = filename;

  // Handle File or Blob
  if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
    imageData = await fileToDataUrl(fileOrDataUrl);
    if (!detectedMimeType && fileOrDataUrl.type) {
      detectedMimeType = fileOrDataUrl.type;
    }
    if (!detectedFilename && fileOrDataUrl.name) {
      detectedFilename = fileOrDataUrl.name;
    }
  } else if (typeof fileOrDataUrl === 'string') {
    // Handle data URL or base64 string
    imageData = fileOrDataUrl;

    // Extract MIME type from data URL if present
    if (imageData.startsWith('data:image/') && !detectedMimeType) {
      const match = imageData.match(/^data:(image\/[^;]+);/);
      if (match) {
        detectedMimeType = match[1];
      }
    }
  } else {
    throw new Error('Invalid input: expected File, Blob, or data URL string');
  }

  if (!imageData) {
    throw new Error('Failed to read image data');
  }

  // Send to backend
  const response = await fetch(`${API_BASE_URL}/api/input/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectPath,
      imageData,
      sourceKind,
      filename: detectedFilename,
      mimeType: detectedMimeType,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText || response.statusText}`);
  }

  const result = await response.json();

  if (result.status !== 'success' || !result.data) {
    throw new Error('Upload failed: invalid response from server');
  }

  // Return normalized result
  return {
    url: result.data.relativePath, // e.g., "input/upload_a3f2b1c4.png"
    width: result.data.width,
    height: result.data.height,
    mimeType: result.data.mimeType,
    bytes: result.data.bytes,
    filename: result.data.filename,
  };
}

/**
 * Upload multiple images in parallel
 *
 * @param {Array} filesOrDataUrls - Array of File/Blob/dataURL
 * @param {Object} options - Same as uploadImageToInput
 * @returns {Promise<Array>} Array of upload results
 */
export async function uploadImagesToInput(filesOrDataUrls, options = {}) {
  if (!Array.isArray(filesOrDataUrls) || filesOrDataUrls.length === 0) {
    return [];
  }

  return Promise.all(
    filesOrDataUrls.map((item) => uploadImageToInput(item, options))
  );
}
