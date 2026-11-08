// Shrinking pictures in the browser before upload (the server takes at most a few MB).

function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ img: el, url });
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽을 수 없습니다'));
    };
    el.src = url;
  });
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다'))), 'image/jpeg', quality),
  );
}

/** Center-crop and shrink to a `size`px square JPEG (profile pictures). */
export async function resizeImage(file, size = 256) {
  const { img, url } = await loadImage(file);
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas
      .getContext('2d')
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await toJpeg(canvas, 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fit inside `max`px on the long side as a JPEG (food photos); small images stay as they are. */
export async function shrinkImage(file, max = 1280) {
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await toJpeg(canvas, 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
