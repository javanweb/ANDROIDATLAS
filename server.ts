import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();
if (!process.env.GEMINI_API_KEY) {
  dotenv.config({ path: '.env.example' });
}

// Placeholder values that must NOT be treated as a real API key
const PLACEHOLDER_KEYS = new Set([
  'MY_GEMINI_API_KEY',
  'YOUR_GEMINI_API_KEY_HERE',
  'PASTE_NEW_KEY_HERE',
  'MY_APP_URL',
]);

function getGeminiKey(): string | undefined {
  const raw = (process.env.GEMINI_API_KEY || '').trim();
  const clean = raw.replace(/^['"]|['"]$/g, '');
  if (!clean || PLACEHOLDER_KEYS.has(clean)) return undefined;
  return clean;
}

// Reliable model cascade: prioritize fast, highly available models to avoid 503 transient spikes
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

async function callGeminiModelWithTimeout(
  ai: GoogleGenAI,
  model: string,
  contents: any[],
  config?: any,
  timeoutMs = 15000
): Promise<string> {
  const attempt = async () => {
    let timer: NodeJS.Timeout | null = null;
    try {
      const callPromise = ai.models.generateContent({
        model,
        contents,
        config,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Model ${model} request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      const res: any = await Promise.race([callPromise, timeoutPromise]);
      return res?.text || '';
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (err: any) {
    const isTransient =
      err?.status === 503 ||
      err?.message?.includes('503') ||
      err?.status === 429 ||
      err?.message?.includes('429');

    if (isTransient) {
      // Exponential jitter/backoff retry once for temporary capacity spikes
      await new Promise((r) => setTimeout(r, 600));
      return await attempt();
    }
    throw err;
  }
}

async function generateWithModelCascade(
  ai: GoogleGenAI,
  contents: any[],
  config?: any,
  tag = 'AI Search',
  models: string[] = GEMINI_MODELS,
  timeoutMs = 15000
): Promise<{ text: string; model: string }> {
  let lastError = '';
  for (const model of models) {
    try {
      const text = await callGeminiModelWithTimeout(ai, model, contents, config, timeoutMs);
      if (text && text.trim()) {
        return { text, model };
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.log(`[${tag}] Model ${model} unavailable (${err?.status || '503/timeout'}), trying next available model...`);
    }
  }
  throw new Error(`تمامی مدل‌های هوش مصنوعی با خطای موقت مواجه شدند: ${lastError}`);
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

interface CatalogItem {
  code: string;
  forzaCode: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  subcategory: string;
  page: number;
  image: string;
  specs: { key: string; value: string }[];
  price: number;
  stock: number;
}

// Load the complete 864 catalog products
let CATALOG_ITEMS: CatalogItem[] = [];

try {
  const summaryPath = path.join(process.cwd(), 'src', 'data', 'catalogSummary.json');
  if (fs.existsSync(summaryPath)) {
    CATALOG_ITEMS = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    console.log(`[Server] Successfully loaded ${CATALOG_ITEMS.length} catalog products for AI visual search.`);
  } else {
    console.warn(`[Server] catalogSummary.json not found at ${summaryPath}`);
  }
} catch (e: any) {
  console.error('[Server] Failed to load catalog products:', e.message);
}

// ============================================================================
// VISUAL HASH ENGINE: exact/near-duplicate image search over catalog photos.
// Compares the user's photo against all 864 catalog images with a 256-bit
// dHash (difference hash). Resistant to resize/recompress/watermark shifts.
// ============================================================================

const IMAGE_HASH_CACHE_PATH = path.join(process.cwd(), 'src', 'data', 'imageHashes.json');
const CATALOG_IMAGES_DIR = path.join(process.cwd(), 'src', 'assets', 'imagesproducts');

// filename -> 64-hex-char dHash
const IMAGE_HASH_INDEX = new Map<string, string>();
let visualIndexReady = false;

// ----------------------------------------------------------------------------
// Catalog image filename resolver.
// The catalog data references images like "e(001).png" while the file on disk
// may be stored as "e(1).png" (zero-padding differences). Without this
// resolver, ~99 products were invisible to the hash index and to AI
// side-by-side verification.
// ----------------------------------------------------------------------------
const CATALOG_IMAGE_ALIASES = new Map<string, string>();

function buildCatalogImageAliases(): void {
  try {
    const files = fs.readdirSync(CATALOG_IMAGES_DIR);
    for (const f of files) {
      const lower = f.toLowerCase();
      CATALOG_IMAGE_ALIASES.set(lower, f);
      const m = lower.match(/^e\(?(\d+)\)?\.(png|jpe?g|webp)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        const ext = m[2];
        for (const pad of [2, 3]) {
          const variant = `e(${String(num).padStart(pad, '0')}).${ext}`;
          if (!CATALOG_IMAGE_ALIASES.has(variant)) {
            CATALOG_IMAGE_ALIASES.set(variant, f);
          }
        }
      }
    }
    console.log(`[Server] Catalog image alias map: ${CATALOG_IMAGE_ALIASES.size} entries.`);
  } catch {
    // best-effort only
  }
}

function resolveCatalogImagePath(image?: string): string | null {
  const clean = (image || '').trim().toLowerCase();
  if (!clean) return null;
  const direct = path.join(CATALOG_IMAGES_DIR, clean);
  if (fs.existsSync(direct)) return direct;
  const aliased = CATALOG_IMAGE_ALIASES.get(clean);
  if (aliased) {
    const p = path.join(CATALOG_IMAGES_DIR, aliased);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function computeDHash(buffer: Buffer): Promise<string> {
  // 17x16 grayscale -> 16x16 = 256 bits
  const raw = await sharp(buffer).resize(17, 16, { fit: 'fill' }).grayscale().raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      bits += raw[y * 17 + x] > raw[y * 17 + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 256; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

function hammingDistance(h1: string, h2: string): number {
  if (!h1 || !h2 || h1.length !== h2.length) return Number.MAX_SAFE_INTEGER;
  let d = 0;
  for (let i = 0; i < h1.length; i++) {
    let x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

async function buildImageHashIndex(): Promise<void> {
  try {
    buildCatalogImageAliases();

    // 1) Try loading cache
    if (fs.existsSync(IMAGE_HASH_CACHE_PATH)) {
      try {
        const cached = JSON.parse(fs.readFileSync(IMAGE_HASH_CACHE_PATH, 'utf8')) as {
          version: number;
          entries: Record<string, string>;
        };
        if (cached && cached.version === 1 && cached.entries) {
          for (const [file, hash] of Object.entries(cached.entries)) {
            if (typeof hash === 'string' && hash.length === 64) {
              IMAGE_HASH_INDEX.set(file, hash);
            }
          }
        }
      } catch {
        // corrupt cache -> rebuild below
      }
    }

    // 2) Hash any catalog image missing from the index
    let newlyHashed = 0;
    for (const item of CATALOG_ITEMS) {
      const file = (item.image || '').trim();
      if (!file || IMAGE_HASH_INDEX.has(file)) continue;
      const fullPath = resolveCatalogImagePath(file);
      if (!fullPath) continue;
      try {
        const buf = fs.readFileSync(fullPath);
        IMAGE_HASH_INDEX.set(file, await computeDHash(buf));
        newlyHashed++;
      } catch {
        // unreadable image -> skip
      }
    }

    // 3) Persist cache if we hashed anything new
    if (newlyHashed > 0) {
      try {
        fs.writeFileSync(
          IMAGE_HASH_CACHE_PATH,
          JSON.stringify({ version: 1, entries: Object.fromEntries(IMAGE_HASH_INDEX) })
        );
      } catch {
        // cache write failure is non-fatal
      }
    }

    visualIndexReady = IMAGE_HASH_INDEX.size > 0;
    console.log(
      `[Server] Visual hash index ready: ${IMAGE_HASH_INDEX.size} catalog images` +
        (newlyHashed > 0 ? ` (${newlyHashed} newly hashed)` : ' (from cache)')
    );
  } catch (e: any) {
    console.error('[Server] Visual hash index failed (visual search disabled):', e.message);
  }
}

// Build in background so server startup isn't blocked on first run
void buildImageHashIndex();

function brandForCatalogItem(item: CatalogItem): string {
  const itemName = item.name.toLowerCase();
  let brand = 'بازرگانی اطلس (ATLAS)';
  if (item.categorySlug === 'industrial-belts') {
    if (itemName.includes('swr') || itemName.includes('اس دبلیو آر')) brand = 'اس دبلیو آر (SWR آلمان)';
    else if (itemName.includes('forza') || itemName.includes('فورزا')) brand = 'فورزا (FORZA اسپانیا)';
  }
  return brand;
}

interface VisualMatch {
  code: string;
  name: string;
  forzaCode: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  subcategory: string;
  cataloguePage: number;
  image: string;
  similarityScore: number;
  matchReason: string;
  specs: { key: string; value: string }[];
  price: number;
  stock: number;
  isVisualMatch: true;
  visualDistance: number;
}

// Distance thresholds on the 256-bit dHash, calibrated on the real catalog:
// - identical file/screenshot            -> d = 0..8
// - re-saved / recompressed re-upload    -> d = 20..40
// - different product (nearest lookalike)-> d >= 22
// - unrelated photo                      -> d >= 100
const VISUAL_EXACT_MAX = 12; // عین همان تصویر سایت (تشخیص قطعی)
const VISUAL_SIMILAR_MAX = 40; // بسیار شبیه (احتمالاً همان محصول، مثلاً فورواردشده/فشرده)

function visualScoreForDistance(d: number): number {
  if (d <= 3) return 99;
  if (d <= 6) return 98;
  if (d <= VISUAL_EXACT_MAX) return 97;
  if (d <= 20) return 94;
  if (d <= 30) return 91;
  return 88;
}

interface VisualCandidateResult {
  candidates: (VisualMatch & { visualDistance: number; isVisualMatch: true })[];
  exactVisualMatch: boolean;
  bestDistance: number;
}

// Pure visual appearance matching across all 864 catalog product images:
// Computes perceptual hash distance, geometric shape matching, and stamped code matching
async function rankCatalogItemsByVisualAppearance(options: {
  queryBuffer: Buffer;
  visualShape?: string;
  objectColor?: string;
  detectedCode?: string;
  length?: number;
  width?: number;
  pitch?: number;
  topK?: number;
}): Promise<VisualCandidateResult> {
  const {
    queryBuffer,
    visualShape = '',
    objectColor = '',
    detectedCode = '',
    length,
    width,
    pitch,
    topK = 4,
  } = options;

  if (!visualIndexReady || IMAGE_HASH_INDEX.size === 0 || !CATALOG_ITEMS || CATALOG_ITEMS.length === 0) {
    return { candidates: [], exactVisualMatch: false, bestDistance: 999 };
  }

  let queryHash: string;
  try {
    queryHash = await computeDHash(queryBuffer);
  } catch (err) {
    console.error('[Visual Retrieval] Failed to compute dHash for query buffer:', err);
    return { candidates: [], exactVisualMatch: false, bestDistance: 999 };
  }

  const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\-_/.:؛,،()]+/g, '');
  const cleanCode = norm(detectedCode);

  let minDistance = 999;

  const scored = CATALOG_ITEMS.map(item => {
    const file = (item.image || '').trim();
    const h = file ? IMAGE_HASH_INDEX.get(file) : undefined;
    const dist = h ? hammingDistance(queryHash, h) : 999;
    if (dist < minDistance) minDistance = dist;

    // 1. Base visual distance score (scale 0..100)
    let score = Math.max(0, 100 - (dist / 1.5));

    // 2. Exact or very close perceptual visual hash hit
    if (dist <= VISUAL_EXACT_MAX) {
      score += 250; // Guaranteed top priority (exact catalog image match)
    } else if (dist <= 25) {
      score += 120;
    } else if (dist <= 40) {
      score += 50;
    }

    // 3. Stamped/printed code or numbers from the part (e.g. 1000 0 1, HTD, 35154, AT-E...)
    if (cleanCode && cleanCode.length >= 3) {
      const codeNorm = norm(item.code);
      const forzaNorm = norm(item.forzaCode || '');
      const nameNorm = norm(item.name);
      if (forzaNorm.includes(cleanCode) || codeNorm.includes(cleanCode) || nameNorm.includes(cleanCode)) {
        score += 160;
      }
    }

    // 4. Physical shape & visual family alignment
    const subcat = (item.subcategory || '').toLowerCase();
    const cat = (item.categoryName || '').toLowerCase();
    const itemName = item.name.toLowerCase();

    if (visualShape === 'pulley_wheel') {
      if (subcat.includes('فولی') || subcat.includes('هرزگرد') || subcat.includes('چرخ') || itemName.includes('فولی') || itemName.includes('پولی')) {
        score += 35;
      }
    } else if (visualShape === 'bushing_coupling') {
      if (subcat.includes('بوش') || subcat.includes('کوپلینگ') || itemName.includes('بوش') || itemName.includes('کوپلینگ')) {
        score += 35;
      }
    } else if (visualShape === 'tensioner_bracket') {
      if (subcat.includes('کشنده') || subcat.includes('رگلاژ') || itemName.includes('کشنده') || itemName.includes('اهرم') || itemName.includes('رگلاژ')) {
        score += 35;
      }
    } else if (visualShape === 'timing_belt') {
      if (subcat.includes('تایمینگ') || cat.includes('تسمه') || itemName.includes('تایمینگ')) {
        score += 35;
      }
    } else if (visualShape === 'v_belt') {
      if (subcat.includes('v-belt') || subcat.includes('ویبلت') || itemName.includes('شیاردار')) {
        score += 35;
      }
    } else if (visualShape === 'impeller_propeller') {
      if (subcat.includes('پروانه') || subcat.includes('همزن') || itemName.includes('پروانه')) {
        score += 45;
      }
    } else if (visualShape === 'suction_pad') {
      if (subcat.includes('بادکش') || subcat.includes('مکنده') || itemName.includes('وکیوم') || itemName.includes('مکنده')) {
        score += 45;
      }
    } else if (visualShape === 'brush_cleaner') {
      if (subcat.includes('برس') || subcat.includes('فرچه') || itemName.includes('برس')) {
        score += 45;
      }
    } else if (visualShape === 'diaphragm_pump') {
      if (subcat.includes('دیافراگم') || subcat.includes('پمپ') || itemName.includes('دیافراگم')) {
        score += 40;
      }
    } else if (visualShape === 'roller_pin') {
      if (subcat.includes('رولر') || subcat.includes('پین') || itemName.includes('پین') || itemName.includes('شفت')) {
        score += 35;
      }
    } else if (visualShape === 'guide_rail_profile') {
      if (subcat.includes('پروفیل') || subcat.includes('ریل') || itemName.includes('راهنما')) {
        score += 35;
      }
    } else if (visualShape === 'bearing_housing') {
      if (subcat.includes('یاتاقان') || subcat.includes('هوزینگ') || subcat.includes('بلبرینگ') || itemName.includes('یاتاقان')) {
        score += 35;
      }
    }

    // 5. Optional dimensional alignment if provided by user
    if (length || width) {
      const itemSpecs = (item.specs || []).map(s => `${s.key} ${s.value}`).join(' ');
      if (length && itemSpecs.includes(String(length))) score += 20;
      if (width && itemSpecs.includes(String(width))) score += 20;
    }

    return { item, distance: dist, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by image so that candidates represent distinct visual products from the catalog
  const seenImages = new Set<string>();
  const distinctCandidates: typeof scored = [];

  for (const s of scored) {
    const img = (s.item.image || '').trim();
    if (!seenImages.has(img)) {
      seenImages.add(img);
      distinctCandidates.push(s);
      if (distinctCandidates.length >= topK) break;
    }
  }

  const exactVisualMatch = minDistance <= VISUAL_EXACT_MAX;

  const candidates: (VisualMatch & { visualDistance: number; isVisualMatch: true })[] = distinctCandidates.map(({ item, distance }) => ({
    code: item.code,
    name: item.name,
    forzaCode: item.forzaCode,
    brand: brandForCatalogItem(item),
    categorySlug: item.categorySlug,
    categoryName: item.categoryName,
    subcategory: item.subcategory,
    cataloguePage: item.page,
    image: item.image,
    similarityScore: distance <= VISUAL_EXACT_MAX ? 99 : visualScoreForDistance(distance),
    matchReason:
      distance <= VISUAL_EXACT_MAX
        ? '🎯 انطباق تصویری مستقیم: عکس شما عیناً با تصویر رسمی این کالا در کاتالوگ اطلس مطابقت دارد'
        : 'انطباق تصویری: فرم و هندسه ظاهری این قطعه در کاتالوگ بیشترین شباهت را به عکس ارسالی شما دارد',
    specs:
      item.specs && item.specs.length > 0
        ? item.specs.slice(0, 4)
        : [
            { key: 'کد کاتالوگ', value: item.forzaCode || item.code },
            { key: 'صفحه کاتالوگ', value: `صفحه ${item.page}` },
            { key: 'دسته‌بندی', value: item.categoryName },
          ],
    price: item.price,
    stock: item.stock,
    isVisualMatch: true as const,
    visualDistance: distance,
  }));

  return {
    candidates,
    exactVisualMatch,
    bestDistance: minDistance,
  };
}

async function searchByImage(imageBuffer: Buffer, topK = 4): Promise<VisualMatch[]> {
  const res = await rankCatalogItemsByVisualAppearance({ queryBuffer: imageBuffer, topK });
  return res.candidates.filter(r => r.visualDistance <= VISUAL_SIMILAR_MAX);
}

// ----------------------------------------------------------------------------
// Stamped-code identification: if the AI can read a code/number printed on the
// physical part (e.g. "1000 0 1" on a FORZA coupling bush) and that code maps
// to exactly one catalog item, that is the strongest possible identity signal.
// ----------------------------------------------------------------------------
function normalizeStampCode(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/forzacode\s*:?/gi, '')
    .replace(/[\s\-_/.:؛,،()[\]]+/g, '');
}

function findCatalogItemsByStampedCode(detectedCode: string): CatalogItem[] {
  const clean = normalizeStampCode(detectedCode);
  if (!clean || clean.length < 4) return [];
  const hits: CatalogItem[] = [];
  for (const item of CATALOG_ITEMS) {
    const forzaNorm = normalizeStampCode(item.forzaCode || '');
    const codeNorm = normalizeStampCode(item.code || '');
    // exact equality, or the stamped number is exactly the numeric part of the FORZA code
    if (codeNorm === clean || (forzaNorm && forzaNorm === clean)) {
      hits.push(item);
    }
  }
  return hits;
}

// Intelligent matching against the 864 catalog products
function searchCatalogProducts(params: {
  partType?: string;
  profile?: string;
  keywords?: string[];
  suggestedForzaCode?: string;
  length?: number;
  width?: number;
  pitch?: number;
  application?: string;
  features?: string;
  limit?: number;
}) {
  const {
    partType = '',
    profile = '',
    keywords = [],
    suggestedForzaCode = '',
    length,
    width,
    pitch,
    application = '',
    features = '',
    limit = 4,
  } = params;

  if (!CATALOG_ITEMS || CATALOG_ITEMS.length === 0) {
    return [];
  }

  // Generic words that match almost every catalog item -> excluded from scoring
  // so that only discriminative words (تایمینگ، کوپلینگ، پلی‌یورتان، بلبرینگ، ...) count.
  const STOPWORDS = new Set([
    'تسمه', 'های', 'صنعتی', 'صنعت', 'قطعه', 'قطعات', 'خطوط', 'خط', 'تولید',
    'کاشی', 'سرامیک', 'برای', 'دستگاه', 'مقاوم', 'استاندارد', 'فورزا', 'forza',
    'موتور', 'پمپ', 'کارخانه', 'کارخانجات', 'ماشین', 'آلات', 'ماشین‌آلات',
    'شرکت', 'اطلس', 'بازرگانی', 'تجهیز', 'تجهیزات', 'انواع', 'سیستم', 'هایپر',
    'ویژه', 'اصلی', 'اورجینال', 'مدل', 'کد', 'عدد', 'سایز', 'نوع', 'برند',
    'میلی', 'متر', 'میلیمتر', 'درجه', 'بالا', 'گرید', 'جدید', 'تک', 'دنده',
  ]);

  const splitWords = (text: string) =>
    text
      .toLowerCase()
      .split(/[\s,،؛:()\-_./]+/)
      .filter(w => w && w.length >= 2 && !STOPWORDS.has(w));

  // Normalize codes for comparison: ignore spaces/dashes/underscores (1000-0-1 == 1000 0 1)
  const normCode = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

  const cleanForza = suggestedForzaCode.replace(/forzacode\s*:\s*/i, '').trim().toLowerCase();
  const cleanForzaNorm = normCode(cleanForza);
  const kwList = [...new Set([
    ...keywords.flatMap(splitWords),
    ...splitWords(partType),
    ...splitWords(profile),
    ...splitWords(features),
    ...splitWords(application),
  ])];

  const partTypeWords = splitWords(partType);
  const isTensionerOrPulley = kwList.some(k => /هرزگرد|قرقره|تنشنر|پولی|فولی|اهرم|سفت/i.test(k));
  const isCouplingOrBush = kwList.some(k => /کوپلینگ|بوش|لاستیک.*کوپلینگ|الاستومر/i.test(k));
  const isBelt = kwList.some(k => /تایمینگ|تسمه|بلت|ویبلت|شیار/i.test(k));
  const isRoller = kwList.some(k => /رولر|رولیک|کوره|پین/i.test(k));

  const scored = CATALOG_ITEMS.map(item => {
    let score = 5;
    const reasons: string[] = [];

    const itemName = item.name.toLowerCase();
    const itemForza = (item.forzaCode || '').toLowerCase();
    const itemForzaNorm = normCode(itemForza);
    const itemNameNorm = normCode(item.name);
    const itemSubcat = (item.subcategory || '').toLowerCase();
    const itemCat = (item.categoryName || '').toLowerCase();
    const itemSpecs = (item.specs || []).map(s => `${s.key} ${s.value}`.toLowerCase()).join(' ');

    // 1. Exact or partial FORZACODE matching (strongest signal)
    if (cleanForzaNorm && cleanForzaNorm.length >= 3) {
      if (itemForzaNorm.includes(cleanForzaNorm) || itemNameNorm.includes(cleanForzaNorm)) {
        score += 65;
        reasons.push(`انطباق مستقیم با کد رسمی کاتالوگ (${item.forzaCode})`);
      }
    }

    // 2. Domain family boosts
    if (isTensionerOrPulley) {
      if (itemSubcat.includes('فولی') || itemSubcat.includes('هرزگرد') || itemSubcat.includes('رگلاژ') || itemSubcat.includes('کانوایر')) {
        score += 25;
      }
      if (itemName.includes('اهرم') || itemName.includes('تنظیم') || itemName.includes('پولی') || itemName.includes('هرزگرد') || itemName.includes('بلبرینگ')) {
        score += 20;
      }
    } else if (isCouplingOrBush) {
      if (itemSubcat.includes('بوش') || itemSubcat.includes('کوپلینگ') || itemCat.includes('کوپلینگ')) {
        score += 35;
      }
    } else if (isBelt) {
      if (itemCat.includes('تسمه') || itemSubcat.includes('تایمینگ') || itemSubcat.includes('v-belt')) {
        score += 25;
      }
    } else if (isRoller) {
      if (itemSubcat.includes('رولر') || itemSubcat.includes('پین') || itemCat.includes('محرک')) {
        score += 30;
      }
    }

    // 3. Part type semantic matching (capped so generic leftovers can't dominate)
    let partTypeScore = 0;
    let partTypeHits = 0;
    for (const word of partTypeWords) {
      if (partTypeScore >= 40) break;
      if (itemName.includes(word)) {
        partTypeScore += 18;
        partTypeHits++;
      } else if (itemSubcat.includes(word)) {
        partTypeScore += 10;
        partTypeHits++;
      } else if (itemCat.includes(word)) {
        partTypeScore += 4;
        partTypeHits++;
      }
    }
    score += partTypeScore;
    if (partTypeHits > 0 && reasons.length === 0) {
      reasons.push(`انطباق با خانواده قطعات «${partType || item.categoryName}»`);
    }

    // 4. Keywords matching (deduped + capped)
    let keywordScore = 0;
    for (const kw of kwList) {
      if (keywordScore >= 30) break;
      if (normCode(itemForza).includes(normCode(kw)) && kw.length >= 3) {
        keywordScore += 12;
      } else if (itemName.includes(kw)) {
        keywordScore += 8;
      } else if (itemSubcat.includes(kw)) {
        keywordScore += 6;
      } else if (itemSpecs.includes(kw)) {
        keywordScore += 4;
      }
    }
    score += keywordScore;

    // 5. Dimensional matching
    if (length && length > 0) {
      const lenStr = String(length);
      if (itemName.includes(lenStr) || itemSpecs.includes(lenStr)) {
        score += 25;
        reasons.push(`انطباق طول اعلامی (${length}mm)`);
      }
    }

    if (width && width > 0) {
      const wStr = String(width);
      if (itemName.includes(wStr) || itemSpecs.includes(wStr)) {
        score += 18;
        reasons.push(`انطباق عرض مقطع (${width}mm)`);
      }
    }

    if (pitch && pitch > 0) {
      const pStr = String(pitch);
      if (itemName.includes(pStr) || itemSpecs.includes(pStr) || itemSpecs.includes(`گام ${pStr}`)) {
        score += 15;
        reasons.push(`تطابق گام دندانه (${pitch}mm)`);
      }
    }

    const brand = brandForCatalogItem(item);

    return {
      code: item.code,
      name: item.name,
      forzaCode: item.forzaCode,
      brand,
      categorySlug: item.categorySlug,
      categoryName: item.categoryName,
      subcategory: item.subcategory,
      cataloguePage: item.page,
      image: item.image,
      similarityScore: Math.min(Math.round(score), 99),
      matchReason: reasons.length > 0 ? reasons.join(' و ') : 'انطباق بصری و ساختاری با مشخصات فنی کاتالوگ اطلس',
      specs: item.specs && item.specs.length > 0
        ? item.specs.slice(0, 4)
        : [
            { key: 'کد کاتالوگ', value: item.forzaCode || item.code },
            { key: 'صفحه کاتالوگ', value: `صفحه ${item.page}` },
            { key: 'دسته‌بندی', value: item.categoryName },
          ],
      price: item.price,
      stock: item.stock,
    };
  });

  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  return scored.slice(0, limit);
}

// Normalize any image input (data-URL, raw base64, or remote http URL) into
// { data: <pure base64>, mimeType } ready for the Gemini API.
async function normalizeImageInput(
  imageBase64?: string,
  mimeType?: string
): Promise<{ data: string; mimeType: string; buffer: Buffer } | null> {
  if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.trim().length < 20) {
    return null;
  }
  const trimmed = imageBase64.trim();
  let rawBuffer: Buffer;
  let rawMime = mimeType || 'image/jpeg';

  // Remote URL (e.g. preset sample images) -> fetch server-side
  if (/^https?:\/\//i.test(trimmed)) {
    const resp = await fetch(trimmed);
    if (!resp.ok) {
      throw new Error('دانلود تصویر نمونه از اینترنت ناموفق بود. لطفاً تصویر را مستقیماً آپلود کنید.');
    }
    rawBuffer = Buffer.from(await resp.arrayBuffer());
    if (rawBuffer.length > 12 * 1024 * 1024) {
      throw new Error('حجم تصویر بیش از حد مجاز (۱۲ مگابایت) است.');
    }
    const contentType = resp.headers.get('content-type');
    if (contentType) rawMime = contentType.split(';')[0].trim();
  } else {
    // data-URL (data:image/png;base64,....) -> strip prefix, detect mime
    const dataUrlMatch = trimmed.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (dataUrlMatch) {
      rawMime = dataUrlMatch[1] || rawMime;
      rawBuffer = Buffer.from(dataUrlMatch[3], 'base64');
    } else {
      rawBuffer = Buffer.from(trimmed, 'base64');
    }
  }

  // Pre-optimize image to max 480x480 JPEG with sharp: reduces payload by up to 95%
  // while retaining sharp edge details for teeth, markings, and profiles.
  try {
    const optimized = await sharp(rawBuffer)
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return {
      data: optimized.toString('base64'),
      mimeType: 'image/jpeg',
      buffer: optimized,
    };
  } catch {
    return {
      data: rawBuffer.toString('base64'),
      mimeType: rawMime,
      buffer: rawBuffer,
    };
  }
}

// Strip markdown code fences (```json ... ```) that models sometimes wrap around JSON
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

interface VisualVerificationVerdict {
  candidateCode: string;
  verdict: 'exact_match' | 'very_similar' | 'different';
  visualExplanation: string;
  matchScore: number;
}

interface VisualVerificationResponse {
  candidateVerdicts: VisualVerificationVerdict[];
  catalogAvailability: {
    status: 'confirmed_in_catalog' | 'similar_in_catalog' | 'custom_order_available';
    statusFarsiTitle: string;
    statusFarsiMessage: string;
  };
}

// Verification model cascade: accuracy-critical step, prefer the strongest
// vision models before falling back to lighter ones.
const VERIFICATION_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
];

// Verify ONE candidate against the user's photo in its own isolated AI call.
// Isolated single-pair comparison eliminates the image/code mix-ups that
// happen when several candidate images share one prompt.
async function verifySingleCandidate(
  ai: GoogleGenAI,
  userJpg: Buffer,
  candJpg: Buffer,
  cand: any,
  whatYouSee: string
): Promise<VisualVerificationVerdict | null> {
  const parts: any[] = [
    {
      text: `تصویر شماره ۱: عکس واقعی ارسالی کاربر از یک قطعه صنعتی (ممکن است روی دستگاه یا در کارگاه باشد).
توضیح آنچه کاربر فرستاده: ${whatYouSee || 'قطعه صنعتی'}

تصویر شماره ۲: عکس رسمی یک کالای کاتالوگ هایپر صنعت اطلس — کد ${cand.code} (${cand.forzaCode || ''}) — نام کالا: «${cand.name}»

شما سیستم راستی‌آزمایی بصری تخصصی اطلس هستید. سیاست ما «تطابق صددرصدی» است:
- "exact_match": فقط وقتی که در تصویر ۲ «عیناً همان قطعه فیزیکی» تصویر ۱ است؛ فرم هندسی، تعداد و الگوی دندانه/شیار/پره/سوراخ، نسبت‌های ابعادی و جزئیات ساختاری کاملاً منطبق (زاویه دوربین، نور و پس‌زمینه ممکن است فرق کند، ولی خود جسم یکی است). اگر عدد یا کدی روی قطعه در تصویر ۱ خوانده می‌شود و با کد این کالا یکسان است، قوی‌ترین مدرک exact_match است.
- "very_similar": هم‌خانواده و نزدیک است ولی عین همان قطعه نیست (اختلاف در تعداد دندانه/پره، قطر، طول، عرض یا جزئیات ساختاری).
- "different": از نظر ظاهری و ساختاری اصلاً همان قطعه نیست.

قوانین حیاتی:
(۱) فقط بر اساس مقایسه بصری این دو تصویر قضاوت کن؛ نام و توضیحات کاتالوگ ملاک نیست.
(۲) شک داری = exact_match نده! هرگز به صرف هم‌خانواده بودن یا کاربرد مشابه، exact_match نده.
(۳) اختلاف ابعادی یعنی exact_match نیست.

پاسخ صرفاً JSON معتبر:
{
  "verdict": "exact_match" | "very_similar" | "different",
  "visualExplanation": "توضیح چشمی کوتاه به فارسی: چه چیزهایی دقیقاً منطبق‌اند یا چه فرقی دارند",
  "matchScore": عدد بین ۰ تا ۹۹ (exact_match: ۹۰ تا ۹۹، very_similar: ۶۰ تا ۸۷، different: زیر ۵۰)
}`,
    },
    { inlineData: { mimeType: 'image/jpeg', data: userJpg.toString('base64') } },
    { inlineData: { mimeType: 'image/jpeg', data: candJpg.toString('base64') } },
  ];

  try {
    const { text, model } = await generateWithModelCascade(
      ai,
      [{ role: 'user', parts }],
      { responseMimeType: 'application/json' },
      `Visual Verify ${cand.code}`,
      VERIFICATION_MODELS,
      25000
    );
    const parsed = JSON.parse(stripJsonFences(text));
    const verdict = parsed?.verdict;
    if (verdict === 'exact_match' || verdict === 'very_similar' || verdict === 'different') {
      return {
        candidateCode: cand.code,
        verdict,
        visualExplanation: parsed.visualExplanation || '',
        matchScore: Math.min(Math.max(Math.round(parsed.matchScore || 50), 0), 99),
      };
    }
    return null;
  } catch (err: any) {
    console.log(`[Visual Verify ${cand.code}] failed: ${err?.message?.slice(0, 80)}`);
    return null;
  }
}

// Second opinion: an independent fresh look at a claimed exact match.
// If the second opinion disagrees, the candidate is downgraded — we only
// keep exact matches that survive both checks.
async function confirmExactMatch(
  ai: GoogleGenAI,
  userJpg: Buffer,
  candJpg: Buffer,
  stampedCodeHint?: string
): Promise<boolean> {
  const hint = stampedCodeHint
    ? `
نکته مهم: روی خود قطعه در تصویر ۱ این کد/عدد خوانده شده است: «${stampedCodeHint}». اگر این کد با کد کاتالوگ این کالا یکی است، این قوی‌ترین مدرک یکسان بودن مدل قطعه است — اما همچنان فرم ظاهری دو تصویر باید یک خانواده و منطبق باشد.`
    : '';
  const parts: any[] = [
    {
      text: `دو تصویر از قطعات صنعتی دارید: تصویر ۱ عکس واقعی کاربر، تصویر ۲ عکس رسمی یک کالای کاتالوگ.
آیا جسم فیزیکی در تصویر ۲ دقیقاً همان مدل قطعه در تصویر ۱ است؟ (همان فرم هندسی، همان تعداد دندانه/پره/شیار/سوراخ، همان نسبت‌های ابعادی — فقط زاویه/نور/پس‌زمینه متفاوت است)${hint}
سخت‌گیر باش: اگر اندازه، تعداد دندانه/پره، ساختار یا جزئیات فرق دارد، جواب false است. اگر مطمئن نیستی، جواب false است.
پاسخ صرفاً JSON: {"samePhysicalPart": true/false, "reason": "دلیل کوتاه فارسی"}`,
    },
    { inlineData: { mimeType: 'image/jpeg', data: userJpg.toString('base64') } },
    { inlineData: { mimeType: 'image/jpeg', data: candJpg.toString('base64') } },
  ];

  try {
    const { text } = await generateWithModelCascade(
      ai,
      [{ role: 'user', parts }],
      { responseMimeType: 'application/json' },
      'Exact Confirm',
      VERIFICATION_MODELS,
      25000
    );
    const parsed = JSON.parse(stripJsonFences(text));
    return parsed?.samePhysicalPart === true;
  } catch {
    return false;
  }
}

// Side-by-side visual comparison between real-world photo and official catalog photos.
// Verifies up to 8 candidates, each in its own parallel AI call, then double-checks
// every claimed exact match with an independent second opinion.
async function verifyCandidatesVisually(
  ai: GoogleGenAI,
  userImageBuffer: Buffer,
  userImageMime: string,
  candidates: any[],
  whatYouSee: string,
  detectedPartType: string,
  stampedCodeText?: string,
  stampedCodeItemCodes?: Set<string>
): Promise<VisualVerificationResponse | null> {
  if (!candidates || candidates.length === 0) return null;

  try {
    // 1. Prepare user image resized to max 480x480 JPEG
    const userJpg = await sharp(userImageBuffer)
      .resize(480, 480, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 2. Deduplicate candidates by code and cap at 8
    const seenCodes = new Set<string>();
    const uniqueCandidates = candidates.filter(c => {
      const key = (c.code || '').toLowerCase();
      if (!key || seenCodes.has(key)) return false;
      seenCodes.add(key);
      return true;
    }).slice(0, 8);

    // 3. Load + resize candidate images (aliases resolved)
    const prepared: { cand: any; jpg: Buffer }[] = [];
    for (const cand of uniqueCandidates) {
      const imgPath = resolveCatalogImagePath(cand.image);
      if (!imgPath) continue;
      try {
        const candJpg = await sharp(imgPath)
          .resize(440, 440, { fit: 'inside' })
          .jpeg({ quality: 82 })
          .toBuffer();
        prepared.push({ cand, jpg: candJpg });
      } catch (e) {
        console.warn(`[Visual Verification] Sharp resize failed for ${cand.code}:`, e);
      }
    }
    if (prepared.length === 0) return null;

    console.log(`[Visual Verification] Verifying ${prepared.length} candidates one-by-one (concurrency-limited)...`);

    // 4. First pass: isolated verification of every candidate.
    //    Concurrency is limited (3 at a time, staggered) to avoid API rate
    //    limits (429) that would force fallbacks to weaker models.
    const verdicts: VisualVerificationVerdict[] = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < prepared.length; i += CONCURRENCY) {
      const chunk = prepared.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async ({ cand, jpg }, j) => {
          if (j > 0) await new Promise(r => setTimeout(r, j * 350));
          return verifySingleCandidate(ai, userJpg, jpg, cand, whatYouSee || detectedPartType || '');
        })
      );
      for (const v of chunkResults) {
        if (v) verdicts.push(v);
      }
    }
    if (verdicts.length === 0) return null;

    // 5. Second pass: independent confirmation of every claimed exact match
    const exactVerdicts = verdicts.filter(v => v.verdict === 'exact_match');
    const confirmed: { v: VisualVerificationVerdict; ok: boolean }[] = [];
    for (let i = 0; i < exactVerdicts.length; i++) {
      const v = exactVerdicts[i];
      const p = prepared.find(x => x.cand.code === v.candidateCode);
      if (!p) {
        confirmed.push({ v, ok: false });
        continue;
      }
      const hintForCandidate =
        stampedCodeText && stampedCodeItemCodes?.has((v.candidateCode || '').toLowerCase())
          ? stampedCodeText
          : undefined;
      const ok = await confirmExactMatch(ai, userJpg, p.jpg, hintForCandidate);
      confirmed.push({ v, ok });
    }

    for (const { v, ok } of confirmed) {
      if (!ok) {
        console.log(`[Visual Verification] Second opinion REJECTED exact claim for ${v.candidateCode} — downgraded to very_similar`);
        v.verdict = 'very_similar';
        v.matchScore = Math.min(v.matchScore, 87);
        v.visualExplanation = v.visualExplanation
          ? `${v.visualExplanation} (راستی‌آزمایی دوم، قطعیت انطباق را تأیید نکرد — به‌عنوان مشابه دسته‌بندی شد)`
          : 'راستی‌آزمایی دوم، قطعیت انطباق را تأیید نکرد — به‌عنوان مشابه دسته‌بندی شد';
      }
    }

    const hasExact = verdicts.some(v => v.verdict === 'exact_match');
    const availability = {
      status: (hasExact ? 'confirmed_in_catalog' : 'custom_order_available') as
        'confirmed_in_catalog' | 'similar_in_catalog' | 'custom_order_available',
      statusFarsiTitle: hasExact
        ? 'تأیید شد: عین همین قطعه در کاتالوگ اطلس موجود است'
        : 'عین این قطعه در کاتالوگ فعلی موجود نیست — می‌توانیم برایتان بسازیم',
      statusFarsiMessage: hasExact
        ? 'راستی‌آزمایی تصویری مستقیم هوش مصنوعی تأیید کرد که این کالا در کاتالوگ اطلس موجود و آماده سفارش است.'
        : 'هیچ‌کدام از تصاویر کاتالوگ انطباق صددرصدی با عکس شما نداشت؛ کارگاه تخصصی هایپر صنعت اطلس توانایی ساخت یا تأمین سفارشی همین قطعه را دارد.',
    };

    console.log(`[Visual Verification] Done: ${verdicts.filter(v => v.verdict === 'exact_match').length} exact, ${verdicts.filter(v => v.verdict === 'very_similar').length} similar, ${verdicts.filter(v => v.verdict === 'different').length} different`);
    return { candidateVerdicts: verdicts, catalogAvailability: availability };
  } catch (err: any) {
    console.error('[Visual Verification] Process error:', err);
  }
  return null;
}

// POST: /api/ai/analyze-part
// stage: 'quick'   = image-only instant identification (step 1)
//        'refined' = image + dimensions + application (steps 2-3)
app.post('/api/ai/analyze-part', async (req, res) => {
  const reqStage: 'quick' | 'refined' = req.body?.stage === 'quick' ? 'quick' : 'refined';
  try {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      length,
      width,
      pitch,
      application,
      features,
    } = req.body;

    const apiKey = getGeminiKey();

    const numLength = length ? parseFloat(length) : undefined;
    const numWidth = width ? parseFloat(width) : undefined;
    const numPitch = pitch ? parseFloat(pitch) : undefined;

    // Normalize the image once for both AI analysis and direct visual search
    const normalizedImage = await normalizeImageInput(imageBase64, mimeType);

    // Direct visual search: is this EXACT product photo already on the site?
    // (works offline too - no API key needed)
    let visualCandidateResult: VisualCandidateResult = { candidates: [], exactVisualMatch: false, bestDistance: 999 };
    if (normalizedImage) {
      visualCandidateResult = await rankCatalogItemsByVisualAppearance({
        queryBuffer: normalizedImage.buffer,
        length: numLength,
        width: numWidth,
        pitch: numPitch,
        topK: 4,
      });
    }

    const visualMatches = visualCandidateResult.candidates;
    if (visualMatches.length > 0) {
      console.log(
        `[AI Search] visual candidates: ${visualMatches.map(v => `${v.code}@${v.visualDistance}`).join(', ')} (exact=${visualCandidateResult.exactVisualMatch})`
      );
    }

    // If no API key, return algorithmic visual-first matching across the 864 products
    if (!apiKey) {
      // STRICT 100% POLICY (offline mode, no AI key):
      // Without Gemini we can only trust the perceptual-hash EXACT duplicate
      // detector (user re-uploaded a catalog image). Anything looser than an
      // exact hash hit is NOT proven to be the same part -> custom order.
      const exactHashMatches = (visualCandidateResult.candidates || []).filter(
        c => c.visualDistance <= VISUAL_EXACT_MAX
      );
      const noKeyExact = exactHashMatches.length > 0;

      const mappedNoKey = exactHashMatches.map(m => ({
        ...m,
        distinction: 'عیناً همان تصویر کاتالوگ',
        visualVerdict: 'exact_match' as const,
        visualVerdictFarsi: 'همونه (انطباق مستقیم قطعی)',
        visualExplanation: 'تصویر ارسالی شما عیناً با تصویر این کالا در کاتالوگ هایپر صنعت اطلس مطابقت دارد.',
      }));

      return res.json({
        success: true,
        isAiGenerated: false,
        stage: reqStage,
        fallbackNotice: noKeyExact
          ? undefined
          : 'کلید هوش مصنوعی (GEMINI_API_KEY) تنظیم نشده است؛ فقط تطابق تصویری دقیق (عین عکس کاتالوگ) قابل تأیید بود و عین این قطعه در کاتالوگ یافت نشد. برای تحلیل هوشمند عکس دنیای واقعی، کلید را در فایل .env تنظیم کنید.',
        summary: {
          detectedPartType: noKeyExact ? mappedNoKey[0].name : 'قطعه صنعتی خطوط تولید',
          detectedProfile: noKeyExact
            ? `عیناً همین کالا در سایت موجود است (${mappedNoKey[0].code})`
            : numLength
              ? `انطباق با ابعاد ${numLength}×${numWidth || 50}mm`
              : 'قطعه خارج از کاتالوگ فعلی',
          visualAnalysis: noKeyExact
            ? 'عکس ارسالی شما عیناً با تصویر یکی از کالاهای سایت مطابقت دارد و همان محصول در صدر نتایج نمایش داده شد.'
            : 'موتور تطبیق تصویری آفلاین، عکس شما را با تمام تصاویر کاتالوگ مقایسه کرد و هیچ انطباق قطعی یافت نشد؛ بنابراین عین این قطعه در کاتالوگ فعلی موجود نیست.',
          confidence: noKeyExact ? 99 : 55,
          exactVisualMatch: noKeyExact,
          catalogAvailability: noKeyExact
            ? {
                status: 'confirmed_in_catalog',
                statusFarsiTitle: 'تأیید شد: عین همین قطعه در کاتالوگ اطلس موجود است (همونه)',
                statusFarsiMessage: 'تصویر ارسالی شما عیناً با تصویر این کالا در کاتالوگ مطابقت دارد.',
              }
            : {
                status: 'custom_order_available',
                statusFarsiTitle: 'عین این قطعه در کاتالوگ فعلی موجود نیست — می‌توانیم برایتان بسازیم',
                statusFarsiMessage: 'موتور تطبیق تصویری، هیچ انطباق قطعی با کالاهای کاتالوگ پیدا نکرد. کارگاه تخصصی هایپر صنعت اطلس توانایی ساخت یا تأمین سفارشی همین قطعه را دارد.',
              },
        },
        matchedProducts: mappedNoKey,
        rejectedCandidates: [],
        technicalAdvice: 'برای تضمین دقت عملکرد، قبل از ثبت سفارش ابعاد و فاصله مراکز پولی را مجدداً اندازه‌گیری نمایید.',
      });
    }

    // Call Gemini API server-side using @google/genai
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const stageInstruction = reqStage === 'quick'
      ? 'حالت شناسایی فوری از روی تصویر: کاربر فقط تصویر فرستاده و هنوز ابعاد یا مشخصاتی وارد نکرده است. صرفاً با اتکا به درک بصری تصویر، قطعه را شناسایی کن؛ اگر ابعادی لازم داری از روی تناسبات تصویر و استانداردهای رایج تخمین بزن و در تحلیل ذکر کن که تخمینی است.'
      : 'حالت تحلیل دقیق نهایی: کاربر علاوه بر تصویر، ابعاد و مشخصات فنی هم وارد کرده است. این اعداد اعلامی را در اولویت تطبیق قرار بده و نتیجه تصویر را با آن‌ها راستی‌آزمایی کن؛ در صورت مغایرت، مغایرت را صریحاً در visualAnalysis ذکر کن.';

    const promptText = `
شما مهندس ارشد متالورژی و بینایی ماشین هایپر صنعت اطلس هستید.
کاربر تصویری از یک قطعه صنعتی بارگذاری کرده است.
هدف اساسی و اولویت مطلق سیستم:
«تطبیق باید دقیقاً بر اساس ظاهر فیزیکی، فرم، شکل هندسی، دندانه و عکس خود کالا در کاتالوگ انجام شود؛ نه بر اساس عناوین یا متون کلی».

${stageInstruction}

مشخصات تکمیلی احتمالی وارد شده توسط کاربر:
- طول اعلامی: ${numLength ? numLength + ' میلی‌متر' : 'مشخص نشده (از روی تصویر و استانداردها تخمین بزنید)'}
- عرض اعلامی: ${numWidth ? numWidth + ' میلی‌متر' : 'مشخص نشده'}
- گام / ضخامت: ${numPitch ? numPitch + ' میلی‌متر' : 'مشخص نشده'}
- کاربرد اعلامی کاربر: ${application || 'خطوط تولید کاشی و سرامیک / ماشین‌آلات صنعتی'}
- ویژگی‌های خاص مدنظر: ${features || 'استاندارد، دوام بالا در خط کارخانه'}

دستورالعمل‌های حیاتی برای بررسی تصویر:
۱. تحلیل دقیق بصری تصویر (واقعاً به تصویر نگاه کن و توصیف کن چه می‌بینی):
   - visualShape: ساختار و هندسه کلی قطعه را به عنوان یکی از این مقادیر دقیق مشخص کن:
     "pulley_wheel" | "timing_belt" | "v_belt" | "bushing_coupling" | "tensioner_bracket" | "suction_pad" | "impeller_propeller" | "guide_rail_profile" | "roller_pin" | "brush_cleaner" | "diaphragm_pump" | "bearing_housing" | "general_part"
   - objectColor: رنگ قالب بدنه قطعه در عکس (black, white_cream, yellow_orange, red, green, metallic_grey, blue, other)
   - detectedCodeOnPart: هرگونه عدد، شماره فنی یا کدی که روی قطعه یا بسته‌بندی یا کاتالوگ آن در تصویر چاپ یا حک شده (مثلاً 1000 0 1، 1000 9 1، 35154، 6001، 8M، T10 یا AT-E...). در صورت عدم وجود، رشته خالی بگذارید.
   - نوع دقیق قطعه: (تسمه تایمینگ دندانه‌دار، پولی تفلون POM، بوش و کوپلینگ خاری، کشنده رگلاژ، پین سر رولر، پروانه همزن لعاب، لاستیک مکنده، دیافراگم، و ...)
   - متریال و جنس: (پلی‌یورتان PU، لاستیک NBR، تفلون POM، آلومینیوم، فولاد، سیلیکون، ...)
   - مشخصات هندسی: (دندانه گرد HTD، دندانه ذوزنقه‌ای T/AT، سوراخ‌دار، خاردار، مقطع V شکل، پره‌ای و ...)
   - اگر تصویر اصلاً قطعه صنعتی نیست، در visualAnalysis اعلام کنید و confidence را زیر ۵۰ قرار دهید.
۲. موقعیت قطعه روی تصویر:
   محل قرارگیری قطعه اصلی را با یک کادر (bounding box) نرمال‌شده ۰ تا ۱۰۰۰ مشخص کن.
۳. شرط مقایسه اقلام مشابه:
   تفاوت ظریف ظاهری این قطعه با مدل‌های مشابه را در distinction شرح دهید.

لطفاً پاسخ را صرفاً در یک ساختار معتبر JSON به زبان فارسی و با کلیدهای زیر برگردانید (بدون هیچ متن اضافه خارج از JSON):
{
  "whatYouSee": "در یک جمله فارسی بگو دقیقاً در تصویر چه می‌بینی (مثلاً: یک پولی سفید تفلونی با شیار جانبی و سوراخ شفت مرکزی)",
  "visualShape": "pulley_wheel | timing_belt | v_belt | bushing_coupling | tensioner_bracket | suction_pad | impeller_propeller | guide_rail_profile | roller_pin | brush_cleaner | diaphragm_pump | bearing_housing | general_part",
  "objectColor": "black | white_cream | yellow_orange | red | green | metallic_grey | blue | other",
  "detectedCodeOnPart": "کد یا عدد خوانده‌شده از تصویر (در صورت عدم وجود، رشته خالی)",
  "detectedPartType": "نام دقیق فارسی قطعه (مثلاً: پولی تفلون هرزگرد / بوش لاستیکی کوپلینگ خاری / کشنده تسمه)",
  "detectedProfile": "پروفیل یا استاندارد قطعه (مثلاً HTD-8M یا DIN 1000 یا مقطع B)",
  "material": "جنس قطعه (مثلاً تفلون POM / پلی‌یورتان / لاستیک فشرده / آلومینیوم)",
  "visualAnalysis": "تحلیل تخصصی و جامع هندسه، دندانه‌ها، رنگ، مقطع و مشاهدات بصری تصویر",
  "confidence": 95,
  "boundingBox": {"x_min": 0, "y_min": 0, "x_max": 1000, "y_max": 1000},
  "searchKeywords": ["کلمه۱", "کلمه۲"],
  "suggestedForzaCode": "کد تخمینی کاتالوگ در صورت وجود",
  "distinction": "توضیح تفاوت ظاهری با مدل‌های مشابه",
  "technicalAdvice": "توصیه مهندسی برای نصب یا تعویض این قطعه در خط تولید"
}
`;

    const contents: any[] = [];
    const parts: any[] = [];

    if (normalizedImage) {
      parts.push({
        inlineData: {
          mimeType: normalizedImage.mimeType,
          data: normalizedImage.data,
        },
      });
    }

    parts.push({ text: promptText });
    contents.push({ role: 'user', parts });

    // Execute AI vision analysis through reliable multi-model cascade
    const { text: responseText, model: usedModel } = await generateWithModelCascade(
      ai,
      contents,
      { responseMimeType: 'application/json' },
      'AI Search'
    );

    console.log(`[AI Search] stage=${reqStage} model=${usedModel} image=${normalizedImage ? 'yes' : 'no'}`);

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(stripJsonFences(responseText));
    } catch {
      const jsonMatch = stripJsonFences(responseText).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('قالب پاسخ هوش مصنوعی نامعتبر بود');
      }
    }

    // 1. Candidate Retrieval:
    // If the user provided an image, RETRIEVE CANDIDATES DIRECTLY BY VISUAL APPEARANCE OF THEIR CATALOG PHOTOS!
    let mergedCandidates: any[] = [];
    let exactVisualMatch = false;
    let stampedCodeItems: CatalogItem[] = [];

    if (normalizedImage) {
      const detectedStamp = parsedResult.detectedCodeOnPart || parsedResult.suggestedForzaCode || '';
      const visualRes = await rankCatalogItemsByVisualAppearance({
        queryBuffer: normalizedImage.buffer,
        visualShape: parsedResult.visualShape,
        objectColor: parsedResult.objectColor,
        detectedCode: detectedStamp,
        length: numLength,
        width: numWidth,
        pitch: numPitch,
        topK: 8,
      });

      mergedCandidates = visualRes.candidates;
      exactVisualMatch = visualRes.exactVisualMatch;

      // A code read directly off the physical part is the strongest identity
      // signal — every catalog item carrying that code is a must-verify
      // candidate. (Note: catalog data contains some duplicated FORZA codes,
      // so there can be more than one item per code.)
      stampedCodeItems = findCatalogItemsByStampedCode(detectedStamp);
      for (const item of stampedCodeItems.slice(0, 3)) {
        const itemCodeLower = item.code.toLowerCase();
        if (!mergedCandidates.some(c => c.code.toLowerCase() === itemCodeLower)) {
          mergedCandidates.push({
            code: item.code,
            name: item.name,
            forzaCode: item.forzaCode,
            brand: brandForCatalogItem(item),
            categorySlug: item.categorySlug,
            categoryName: item.categoryName,
            subcategory: item.subcategory,
            cataloguePage: item.page,
            image: item.image,
            similarityScore: 99,
            matchReason: `🎯 کد خوانده‌شده از روی خود قطعه (${detectedStamp}) با کد رسمی این کالا در کاتالوگ مطابقت دارد`,
            specs: item.specs && item.specs.length > 0 ? item.specs.slice(0, 4) : [],
            price: item.price,
            stock: item.stock,
            isVisualMatch: true,
            visualDistance: 999,
          });
          console.log(`[AI Search] Injected stamped-code item ${item.code} (code: ${detectedStamp}) into candidates`);
        }
      }
      mergedCandidates = mergedCandidates.slice(0, 8);

      console.log(
        `[AI Search] Visual candidate ranking retrieved ${mergedCandidates.length} items (exactMatch=${exactVisualMatch}, bestDist=${visualRes.bestDistance})`
      );
      console.log(
        `[AI Search] stage=${reqStage} model=${usedModel}`,
        `| codeOnPart="${parsedResult.detectedCodeOnPart || ''}"`,
        `| shape=${parsedResult.visualShape || '?'}`,
        `| stampedCodeHits=${stampedCodeItems.length}`
      );
    } else {
      // Fallback to dimensional matching if no image was uploaded
      mergedCandidates = searchCatalogProducts({
        partType: parsedResult.detectedPartType,
        profile: parsedResult.detectedProfile,
        keywords: parsedResult.searchKeywords || [],
        suggestedForzaCode: parsedResult.suggestedForzaCode || '',
        length: numLength,
        width: numWidth,
        pitch: numPitch,
        application,
        features,
        limit: 4,
      });
    }

    // 2. Perform Side-by-Side Visual Verification with Gemini Vision on Candidates
    let verificationResponse: VisualVerificationResponse | null = null;
    if (normalizedImage && mergedCandidates.length > 0) {
      console.log(`[AI Search] Running side-by-side visual verification on ${mergedCandidates.length} candidate images...`);
      verificationResponse = await verifyCandidatesVisually(
        ai,
        normalizedImage.buffer,
        normalizedImage.mimeType,
        mergedCandidates,
        parsedResult.whatYouSee || '',
        parsedResult.detectedPartType || '',
        (parsedResult.detectedCodeOnPart || parsedResult.suggestedForzaCode || '').trim(),
        new Set(stampedCodeItems.map(i => i.code.toLowerCase()))
      );
    }

    // Map candidate verdicts
    const verdictMap = new Map<string, {
      verdict: 'exact_match' | 'very_similar' | 'different';
      verdictFarsi: string;
      visualExplanation: string;
      matchScore: number;
    }>();

    if (verificationResponse?.candidateVerdicts) {
      for (const cv of verificationResponse.candidateVerdicts) {
        const verdict = cv.verdict || 'different';
        const verdictFarsi =
          verdict === 'exact_match'
            ? 'همونه (انطباق مستقیم قطعی)'
            : verdict === 'very_similar'
            ? 'شبیهه (مدل مشابه و جایگزین)'
            : 'فرق داره (ساختار متفاوت)';

        verdictMap.set(cv.candidateCode.toLowerCase(), {
          verdict,
          verdictFarsi,
          visualExplanation: cv.visualExplanation || '',
          matchScore: Math.min(Math.max(Math.round(cv.matchScore || 50), 10), 99),
        });
      }
    }

    // Process all candidates with comparative verification data
    const allProcessed = mergedCandidates.map((m, idx) => {
      const v = verdictMap.get(m.code.toLowerCase());
      if (v) {
        return {
          ...m,
          similarityScore: v.matchScore,
          visualVerdict: v.verdict,
          visualVerdictFarsi: v.verdictFarsi,
          visualExplanation: v.visualExplanation,
          verificationConfidence: v.matchScore,
          matchReason: v.verdict === 'exact_match'
            ? `🎯 تأیید راستی‌آزمایی بصری: ${v.visualExplanation}`
            : v.verdict === 'very_similar'
            ? `⚡ مدل مشابه و جایگزین: ${v.visualExplanation}`
            : `تفاوت ساختاری: ${v.visualExplanation}`,
          distinction: v.visualExplanation || (idx === 1 ? 'مدل جایگزین استاندارد در کاتالوگ اطلس' : 'منطبق بر مشخصات'),
        };
      }
      return {
        ...m,
        visualVerdict: 'very_similar' as 'exact_match' | 'very_similar' | 'different',
        visualVerdictFarsi: 'شبیهه (مدل مشابه استاندارد)',
        visualExplanation: 'بر اساس تشابه مشخصات فنی در کاتالوگ اطلس',
        verificationConfidence: m.similarityScore || 75,
        distinction: idx === 1 ? 'مدل جایگزین استاندارد در کاتالوگ اطلس' : 'منطبق بر مشخصات',
      };
    });

    // If exact visual duplicate was detected by dHash (the user's photo IS a
    // catalog image, e.g. a screenshot/re-upload), force top verdict to exact_match
    if (exactVisualMatch && allProcessed.length > 0) {
      allProcessed[0].visualVerdict = 'exact_match';
      allProcessed[0].visualVerdictFarsi = 'همونه (انطباق مستقیم قطعی)';
      allProcessed[0].similarityScore = 99;
      allProcessed[0].verificationConfidence = 99;
    }

    // STRICT 100% POLICY:
    // Only candidates verified as "exact_match" (the very same physical part)
    // may be returned as the customer's part. "very_similar" and "different"
    // are both treated as NOT the same part — they go to the rejected list so
    // we never hand the customer a lookalike product "out of thin air".
    const exactMatches = allProcessed.filter(
      p => p.visualVerdict === 'exact_match' && (p.similarityScore || 0) >= 88
    );
    const rejectedCandidates = allProcessed.filter(p => p !== undefined && !exactMatches.includes(p));

    // Sort exact matches by score descending
    exactMatches.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));

    let finalMatches: typeof allProcessed;
    let catalogAvailability: any;

    if (exactMatches.length > 0) {
      // The exact part IS in the catalog: return only the exact matches.
      finalMatches = exactMatches.slice(0, 4);
      catalogAvailability = {
        status: 'confirmed_in_catalog',
        statusFarsiTitle: 'تأیید شد: عین همین قطعه در کاتالوگ هایپر صنعت اطلس موجود است (همونه)',
        statusFarsiMessage: 'راستی‌آزمایی تصویری مستقیم هوش مصنوعی تأیید کرد که عکس شما عیناً همین کالا در کاتالوگ اطلس است و آماده سفارش می‌باشد.',
      };
    } else {
      // The exact part is NOT in the catalog: say so honestly.
      // NO product is returned as "the customer's part" — instead we offer
      // to manufacture/source it as a custom order.
      finalMatches = [];

      // Special case: the image does not appear to contain an industrial part at all
      const aiConfidence = typeof parsedResult.confidence === 'number' ? parsedResult.confidence : 70;
      const looksLikeNotAPart =
        aiConfidence < 50 && /صنعتی نیست|قطعه نیست|نامشخص/.test(
          `${parsedResult.detectedPartType || ''} ${parsedResult.visualAnalysis || ''}`
        );

      if (looksLikeNotAPart) {
        catalogAvailability = {
          status: 'custom_order_available',
          statusFarsiTitle: 'تصویر ارسالی قطعه صنعتی شناسایی نشد',
          statusFarsiMessage: 'به نظر می‌رسد تصویر ارسالی یک قطعه صنعتی نیست. لطفاً عکس واضح‌تری از خود قطعه (از نزدیک و روی سطح مشخص) بارگذاری کنید.',
        };
      } else {
        catalogAvailability = verificationResponse?.catalogAvailability?.status === 'custom_order_available'
          ? verificationResponse.catalogAvailability
          : {
              status: 'custom_order_available',
              statusFarsiTitle: 'عین این قطعه در کاتالوگ فعلی موجود نیست — می‌توانیم برایتان بسازیم',
              statusFarsiMessage: `هوش مصنوعی نوع قطعه را «${parsedResult.detectedPartType || 'قطعه صنعتی'}» تشخیص داد و هیچ‌یک از کالاهای کاتالوگ انطباق صددرصدی با عکس شما نداشت. کارگاه تخصصی هایپر صنعت اطلس توانایی ساخت یا تأمین سفارشی همین قطعه را دارد.`,
            };
      }
    }

    // Validate bounding box (normalized 0..1000) if the model returned one
    let boundingBox: { x_min: number; y_min: number; x_max: number; y_max: number } | undefined;
    const bb = parsedResult.boundingBox;
    if (
      bb &&
      [bb.x_min, bb.y_min, bb.x_max, bb.y_max].every((v: any) => typeof v === 'number' && v >= 0 && v <= 1000) &&
      bb.x_max > bb.x_min &&
      bb.y_max > bb.y_min
    ) {
      boundingBox = { x_min: bb.x_min, y_min: bb.y_min, x_max: bb.x_max, y_max: bb.y_max };
    }

    const topScore = finalMatches.length > 0 ? finalMatches[0].similarityScore : 0;

    return res.json({
      success: true,
      isAiGenerated: true,
      stage: reqStage,
      model: usedModel,
      summary: {
        whatYouSee: parsedResult.whatYouSee || '',
        detectedPartType: parsedResult.detectedPartType || 'قطعه صنعتی کاتالوگ اطلس',
        detectedProfile: parsedResult.detectedProfile || 'استاندارد کارخانجات صنعتی',
        material: parsedResult.material || 'متریال صنعتی استاندارد',
        visualAnalysis: parsedResult.visualAnalysis || 'تصویر قطعه با الگوریتم بینایی ماشین بررسی و با کاتالوگ تطبیق داده شد.',
        confidence: exactVisualMatch
          ? 99
          : finalMatches.length > 0
            ? topScore || 95
            : Math.min(Math.max(Math.round(parsedResult.confidence || 70), 40), 92),
        boundingBox,
        exactVisualMatch: exactVisualMatch || finalMatches.length > 0,
        catalogAvailability,
        verifiedCandidateCount: mergedCandidates.length,
      },
      matchedProducts: finalMatches,
      rejectedCandidates: rejectedCandidates.slice(0, 6),
      technicalAdvice: parsedResult.technicalAdvice || 'قبل از نصب، از هم‌راستایی فولی‌ها و عدم لنگی شفت اطمینان حاصل فرمایید.',
    });
  } catch (error: any) {
    // Graceful fallback: STRICT 100% POLICY applies here too.
    // Without a successful AI run we only trust the perceptual-hash EXACT
    // duplicate detector. No lookalike products are ever returned.
    const numLength = req.body?.length ? parseFloat(req.body.length) : undefined;
    const numWidth = req.body?.width ? parseFloat(req.body.width) : undefined;
    const numPitch = req.body?.pitch ? parseFloat(req.body.pitch) : undefined;

    console.error('[AI Search] Falling back to offline exact-visual matching:', error?.message, error?.aiDetail || '');

    let catchVisualRes: VisualCandidateResult = { candidates: [], exactVisualMatch: false, bestDistance: 999 };
    try {
      const catchImage = await normalizeImageInput(req.body?.imageBase64, req.body?.mimeType);
      if (catchImage) {
        catchVisualRes = await rankCatalogItemsByVisualAppearance({
          queryBuffer: catchImage.buffer,
          length: numLength,
          width: numWidth,
          pitch: numPitch,
          topK: 4,
        });
      }
    } catch {
      // ignore
    }

    const catchExact = catchVisualRes.exactVisualMatch;
    const exactFallback = (catchVisualRes.candidates || []).filter(c => c.visualDistance <= VISUAL_EXACT_MAX);

    const mergedFallback = exactFallback.map(m => ({
      ...m,
      distinction: 'عیناً همان تصویر کاتالوگ',
      visualVerdict: 'exact_match' as const,
      visualVerdictFarsi: 'همونه (انطباق مستقیم قطعی)',
      visualExplanation: 'تصویر ارسالی شما عیناً با تصویر این کالا در کاتالوگ مطابقت دارد.',
    }));

    return res.json({
      success: true,
      isAiGenerated: false,
      stage: reqStage,
      fallbackNotice: catchExact
        ? 'تحلیل کامل هوش مصنوعی موقتاً در دسترس نبود؛ تطابق تصویری دقیق (عین عکس کاتالوگ) انجام شد.'
        : 'تحلیل کامل هوش مصنوعی موقتاً در دسترس نبود و موتور تطبیق تصویری آفلاین هیچ انطباق قطعی با کاتالوگ پیدا نکرد.',
      summary: {
        detectedPartType: catchExact ? mergedFallback[0].name : 'قطعه تخصصی صنعتی خطوط تولید',
        detectedProfile: catchExact
          ? `عیناً همین کالا در سایت موجود است (${mergedFallback[0].code})`
          : numLength
            ? `انطباق با ابعاد ${numLength}×${numWidth || 50}mm`
            : 'قطعه خارج از کاتالوگ فعلی',
        visualAnalysis: catchExact
          ? 'عکس ارسالی شما عیناً با تصویر یکی از کالاهای سایت مطابقت دارد و همان محصول در صدر نتایج نمایش داده شد.'
          : 'تحلیل بصری آفلاین انجام شد و هیچ انطباق قطعی با کالاهای کاتالوگ یافت نشد؛ عین این قطعه در کاتالوگ فعلی موجود نیست.',
        confidence: catchExact ? 99 : 55,
        exactVisualMatch: catchExact,
        catalogAvailability: {
          status: catchExact ? 'confirmed_in_catalog' : 'custom_order_available',
          statusFarsiTitle: catchExact
            ? 'تأیید شد: انطباق مستقیم با عکس کالای کاتالوگ (همونه)'
            : 'عین این قطعه در کاتالوگ فعلی موجود نیست — می‌توانیم برایتان بسازیم',
          statusFarsiMessage: catchExact
            ? 'تصویر ارسالی عیناً با عکس ثبت‌شده این کالا در کاتالوگ اطلس مطابقت دارد.'
            : 'هیچ انطباق قطعی با کالاهای کاتالوگ یافت نشد؛ کارگاه تخصصی هایپر صنعت اطلس توانایی ساخت یا تأمین سفارشی همین قطعه را دارد.',
        },
      },
      matchedProducts: mergedFallback,
      rejectedCandidates: [],
      technicalAdvice: 'برای تضمین دقت عملکرد، قبل از ثبت سفارش ابعاد و فاصله مراکز پولی را مجدداً اندازه‌گیری نمایید.',
    });
  }
});

// POST: /api/ai/consult
app.post('/api/ai/consult', async (req, res) => {
  try {
    const { query } = req.body;
    const apiKey = getGeminiKey();

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!apiKey) {
      return res.json({
        reply: `با توجه به پرسش شما در خصوص «${query}»، کارشناسان فنی و مهندسی بازرگانی اطلس استفاده از تسمه‌های تقویت‌شده با استانداردهای DIN و قطعات اصلی SWR و FORZA را پیشنهاد می‌نمایند. کلیه این اقلام در انبار مرکزی یزد موجود و آماده بارگیری فوری هستند.`,
        suggestedAction: {
          label: 'مشاهده دسته‌بندی محصولات',
          link: '/category/industrial-belts',
        },
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let replyText = '';
    try {
      const { text } = await generateWithModelCascade(
        ai,
        [
          {
            role: 'user',
            parts: [
              {
                text: `شما مهندس ارشد مشاور فنی شرکت «بازرگانی اطلس» (تولید، تأمین و بازرگانی تسمه‌های صنعتی، پولی و قطعات کارخانجات از سال ۱۳۶۶) هستید. نماینده انحصاری برندهای SWR آلمان و FORZA در ایران.
به زبان فارسی، روان، تخصصی، محترمانه و دقیق به این پرسش کاربر پاسخ دهید (حداکثر ۲ الی ۳ پاراگراف فنی و کاربردی):
پرسش کاربر: "${query}"`,
              },
            ],
          },
        ],
        undefined,
        'AI Consult'
      );
      replyText = text;
    } catch {
      // smooth fallback below
    }

    return res.json({
      reply: replyText || 'با توجه به ماهیت کاربری در خطوط صنعتی، استفاده از تسمه‌ها و قطعات اورجینال مقاوم به سایش و حرارت با ضریب کشش استاندارد توصیه می‌گردد. جهت استعلام دقیق ابعاد و سفارش به بخش محصولات یا تماس با ما مراجعه فرمایید.',
      suggestedAction: {
        label: 'مشاهده دسته‌بندی محصولات',
        link: '/category/industrial-belts',
      },
    });
  } catch (err: any) {
    // Suppress noisy 503 errors in console as we have a smooth fallback
    // console.error('Consultation AI error:', err);
    return res.json({
      reply: 'با توجه به ماهیت کاربری در خطوط صنعتی، استفاده از تسمه‌ها و قطعات اورجینال مقاوم به سایش و حرارت با ضریب کشش استاندارد توصیه می‌گردد. جهت استعلام دقیق ابعاد و سفارش به بخش محصولات یا تماس با ما مراجعه فرمایید.',
      suggestedAction: {
        label: 'مشاهده محصولات',
        link: '/category/industrial-belts',
      },
    });
  }
});

// Vite middleware setup
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const keyStatus = getGeminiKey()
      ? `SET (len ${getGeminiKey()!.length}, prefix ${getGeminiKey()!.slice(0, 6)}...)`
      : 'MISSING - AI features will use offline fallback until GEMINI_API_KEY is set in .env';
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[Server] Gemini key: ${keyStatus}`);
  });
}

start();
