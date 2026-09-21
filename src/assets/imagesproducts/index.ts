// Dynamically load all available product images in this folder
const productImagesMap = import.meta.glob<{ default: string }>(
  './*.{png,jpg,jpeg,webp,svg}',
  { eager: true }
);

// Map of normalized filenames to their resolved Vite asset URLs
const imageCache = new Map<string, string>();
const verifiedFileNames = new Set<string>();
const allAvailableImages: string[] = [];

// Initialize image map
Object.entries(productImagesMap).forEach(([path, module]) => {
  const url = module.default;
  if (url && !allAvailableImages.includes(url)) {
    allAvailableImages.push(url);
  }
  // path is like "./e(196).png" or "./e(1).png"
  const fileName = path.replace(/^\.\//, '').toLowerCase();
  imageCache.set(fileName, url);
  verifiedFileNames.add(fileName);

  // Normalize number format: e(1).png <-> e(001).png <-> e(01).png
  const match = fileName.match(/^e\(?(\d+)\)?\.(png|jpg|jpeg|webp|svg)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const ext = match[2];
    const variants = [
      `e(${num}).${ext}`,
      `e(${String(num).padStart(3, '0')}).${ext}`,
      `e(${String(num).padStart(2, '0')}).${ext}`,
      `e${num}.${ext}`,
      `e${String(num).padStart(3, '0')}.${ext}`,
      `e${String(num).padStart(2, '0')}.${ext}`,
    ];
    variants.forEach(v => {
      imageCache.set(v, url);
      verifiedFileNames.add(v);
    });
  }
});

export const TOTAL_OFFICIAL_IMAGES_COUNT = allAvailableImages.length;

/**
 * Checks whether a given image name has a real matching image file in imagesproducts.
 */
export function isVerifiedCatalogueImage(imageName?: string | null): boolean {
  if (!imageName) return false;
  const clean = imageName.trim().toLowerCase();
  if (verifiedFileNames.has(clean)) return true;
  const match = clean.match(/^e\(?(\d+)\)?\.(png|jpg|jpeg|webp|svg)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return (
      verifiedFileNames.has(`e(${num}).png`) ||
      verifiedFileNames.has(`e(${String(num).padStart(3, '0')}).png`) ||
      verifiedFileNames.has(`e${num}.png`)
    );
  }
  return false;
}

/**
 * Resolves a product image name (e.g. "e(001).png", "e(196).png", etc.)
 * or code exclusively to an image from the imagesproducts folder.
 */
export function getProductImageUrl(imageName?: string | null): string {
  if (!imageName && allAvailableImages.length > 0) {
    return allAvailableImages[0];
  }

  const clean = (imageName || '').trim().toLowerCase();

  // If already a full URL or data URI
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('blob:')
  ) {
    return imageName!;
  }

  // 1. Direct match in local imagesproducts cache
  if (imageCache.has(clean)) {
    return imageCache.get(clean)!;
  }

  // 2. Try normalized numeric match (e.g., e(001).png -> e(1).png or e(45) -> e(045).png)
  const numMatch = clean.match(/(?:e\(?|at-e)?(\d+)\)?(?:\.(png|jpg|jpeg|webp|svg))?/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const ext = numMatch[2] || 'png';
    const variants = [
      `e(${num}).${ext}`,
      `e(${String(num).padStart(3, '0')}).${ext}`,
      `e(${String(num).padStart(2, '0')}).${ext}`,
      `e${num}.${ext}`,
      `e${String(num).padStart(3, '0')}.${ext}`,
      `e(${num}).png`,
      `e(${String(num).padStart(3, '0')}).png`,
    ];

    for (const v of variants) {
      if (imageCache.has(v)) {
        return imageCache.get(v)!;
      }
    }

    // If exact number file is somehow missing, pick deterministically from available real imagesproducts
    if (allAvailableImages.length > 0) {
      const idx = Math.abs(num - 1) % allAvailableImages.length;
      return allAvailableImages[idx];
    }
  }

  // Default to first available image from imagesproducts folder
  return allAvailableImages[0] || '';
}

export default getProductImageUrl;
