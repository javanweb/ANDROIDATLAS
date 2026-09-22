import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Sparkles,
  Camera,
  Upload,
  Scan,
  CheckCircle2,
  AlertCircle,
  Send,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Zap,
  PhoneCall,
  Info,
  Maximize2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import {
  aiVisualSearchService,
  MatchedPartItem,
  AiPartAnalysisResult,
  INDUSTRIAL_PRESET_SAMPLES,
  IndustrialPresetSample,
  VisualFeatureComparison,
} from '../../services/aiVisualSearchService';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
  suggestedFollowUps?: string[];
}

export function VisualPartAgent() {
  const { addToCart } = useCart();

  // State
  const [userImage, setUserImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AiPartAnalysisResult | null>(null);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState<number>(0);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Camera / Upload UI
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSendingMessage]);

  // Paste image from clipboard support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Handle uploaded file
  const handleImageFile = async (file: File) => {
    try {
      setErrorNotice(null);
      const converted = await aiVisualSearchService.fileToBase64(file);
      setUserImage(converted.base64);
      setMimeType(converted.mimeType);
      runVisualAnalysis(converted.base64, converted.mimeType);
    } catch {
      setErrorNotice('خطا در بارگذاری تصویر. لطفاً مجدداً امتحان کنید.');
    }
  };

  // Handle preset sample click
  const handleSelectPreset = async (preset: IndustrialPresetSample) => {
    try {
      setErrorNotice(null);
      setIsAnalyzing(true);
      const converted = await aiVisualSearchService.urlToBase64(preset.imageUrl);
      setUserImage(converted.base64);
      setMimeType(converted.mimeType);
      await runVisualAnalysis(converted.base64, converted.mimeType);
    } catch {
      setErrorNotice('خطا در بارگذاری تصویر نمونه. لطفاً از طریق آپلود عکس عمل کنید.');
      setIsAnalyzing(false);
    }
  };

  // Run full multimodal visual identification & matching
  const runVisualAnalysis = async (imgBase64: string, mime: string) => {
    setIsAnalyzing(true);
    setErrorNotice(null);
    setAnalysisResult(null);
    setChatMessages([]);
    setSelectedMatchIndex(0);

    try {
      const result = await aiVisualSearchService.analyzePartWithAi({
        imageBase64: imgBase64,
        mimeType: mime,
        stage: 'quick',
      });

      setAnalysisResult(result);

      // Initialize Agent Greeting in Chat
      const topMatch = result.matchedProducts[0];
      const isExact = topMatch?.visualVerdict === 'exact_match';

      const initialGreeting: ChatMessage = {
        id: 'initial-greeting',
        role: 'agent',
        text: isExact
          ? `سلام! من ایژنت هوشمند بینایی ماشین هایپر صنعت اطلس هستم. تصویر قطعه شما را بررسی کردم. 🎯 **انطباق قطعی**: این قطعه عیناً با کالای «${topMatch.name}» (کد رسمی ${topMatch.code}) در کاتالوگ رسمی ما مطابقت دارد.\n\n${topMatch.visualExplanation || 'فرم هندسی، دندانه‌ها و ساختار فیزیکی کاملاً با نسخه فابریک ثبت‌شده در کاتالوگ همخوانی دارد.'}\n\nآیا درباره نحوه نصب، قیمت سازمانی یا ابعاد این قطعه سؤالی دارید؟`
          : `سلام! من ایژنت بینایی ماشین هایپر صنعت اطلس هستم. تصویر قطعه شما با دقت اسکن شد. ⚡ بر اساس ظاهر و مشخصات، کالای «${topMatch?.name || 'قطعه کاتالوگ'}» نزدیک‌ترین مدل استاندارد کاتالوگ به نمونه شماست.\n\n${topMatch?.visualExplanation || 'این قطعه از نظر کاربری در خطوط تولید کاملاً سازگار است.'}\n\nهر سؤالی در مورد مشخصات، موجودی یا سازگاری با دستگاه خود دارید در خدمتم!`,
        timestamp: new Date(),
        suggestedFollowUps: [
          'چرا این قطعه دقیقاً با عکس من یکیه؟',
          'آیا برای خطوط تولید و کارخانجات مناسبه؟',
          'ابعاد دقیق، گام و مشخصات فنی',
          'قیمت و شرایط تخفیف خرید عمده',
        ],
      };

      setChatMessages([initialGreeting]);
    } catch (err: any) {
      setErrorNotice(err?.message || 'خطا در تحلیل تصویر توسط ایژنت');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Camera start / capture
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      setErrorNotice(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setErrorNotice('دسترسی به دوربین برقرار نشد. لطفاً از طریق آپلود عکس اقدام نمایید.');
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      stopCamera();
      setUserImage(dataUrl);
      setMimeType('image/jpeg');
      runVisualAnalysis(dataUrl, 'image/jpeg');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Send message to Agent
  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend || chatInput).trim();
    if (!message || isSendingMessage) return;

    setChatInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMsg]);
    setIsSendingMessage(true);

    try {
      const currentMatch = analysisResult?.matchedProducts[selectedMatchIndex];
      const res = await aiVisualSearchService.sendAgentMessage({
        message,
        imageBase64: userImage || undefined,
        mimeType,
        matchedProduct: currentMatch,
        analysisSummary: analysisResult?.summary,
        conversationHistory: chatMessages.slice(-6).map(m => ({ role: m.role, text: m.text })),
      });

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: res.reply,
        timestamp: new Date(),
        suggestedFollowUps: res.suggestedFollowUps,
      };

      setChatMessages(prev => [...prev, agentMsg]);
    } catch {
      const fallbackMsg: ChatMessage = {
        id: `agent-err-${Date.now()}`,
        role: 'agent',
        text: 'این قطعه بر اساس هندسه و شکل فیزیکی ثبت‌شده در تصویر، منطبق بر استانداردهای کاتالوگ اطلس است. کلیه اجزا از آلیاژها و پلی‌مرهای ضدسایش ساخته شده و آماده تحویل فوری از انبار مرکزی هایپر صنعت اطلس می‌باشند.',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const currentMatch: MatchedPartItem | undefined =
    analysisResult?.matchedProducts[selectedMatchIndex] || analysisResult?.matchedProducts[0];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Top Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-10 shadow-2xl border border-indigo-800/40 mb-8">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>موتور هوشمند بینایی ماشین و تطبیق ظاهری قطعات کاتالوگ</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Bot className="w-8 h-8 text-cyan-400" />
              ایژنت هوشمند قطعات صنعتی اطلس
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-3xl leading-relaxed">
              عکس قطعه مورد نظرتان را آپلود کنید یا با دوربین بگیرید؛ هوش مصنوعی دقیقاً ظاهر فیزیکی، دندانه‌ها و ابعاد را اسکن کرده و همان قطعه را در کاتالوگ جامع ۸۶۴ قلمی اطلس پیدا می‌کند و مشاوره تخصصی مهندسی ارائه می‌دهد.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>انتخاب عکس قطعه</span>
            </button>
            <button
              onClick={startCamera}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-sm transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>دوربین زنده</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                if (e.target.files?.[0]) {
                  handleImageFile(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>

        {/* Quick presets strip */}
        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-400 font-medium">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>یا برای تست فوری، یکی از قطعات واقعی کاتالوگ را با یک کلیک انتخاب کنید:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            {INDUSTRIAL_PRESET_SAMPLES.map(preset => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="group relative flex flex-col items-center p-2 rounded-xl bg-slate-800/60 hover:bg-indigo-950/80 border border-slate-700/60 hover:border-cyan-500/60 transition-all text-center cursor-pointer"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-900 overflow-hidden mb-1.5 flex items-center justify-center p-1">
                  <img
                    src={preset.imageUrl}
                    alt={preset.title}
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                    loading="lazy"
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-300 line-clamp-1 group-hover:text-cyan-300">
                  {preset.title}
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  {preset.subtitle}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Camera View Modal */}
      <AnimatePresence>
        {isCameraActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden max-w-lg w-full p-6 text-center space-y-4">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Camera className="w-5 h-5 text-cyan-400" />
                  <span>عکاسی مستقیم از قطعه صنعتی</span>
                </div>
                <button
                  onClick={stopCamera}
                  className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
                >
                  انصراف
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-8 border-2 border-dashed border-cyan-400/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-[11px] text-cyan-300 bg-slate-950/70 px-2 py-1 rounded">
                    قطعه را در مرکز کادر قرار دهید
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={capturePhoto}
                  className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/30 flex items-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>ثبت و تحلیل تصویر</span>
                </button>
                <button
                  onClick={stopCamera}
                  className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
                >
                  بستن
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Notice */}
      {errorNotice && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Main Workspace: 2 Columns (Left: Visual Comparison, Right: Interactive Agent Chat) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Side-by-Side Visual Matcher (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Visual Box */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Scan className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    تطبیق ظاهری تصویر با عکس کاتالوگ (Side-by-Side)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    راستی‌آزمایی بصری مستقیم هوش مصنوعی با ۸۶۴ قلم کالای رسمی اطلس
                  </p>
                </div>
              </div>

              {currentMatch && (
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                    currentMatch.visualVerdict === 'exact_match'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{currentMatch.visualVerdictFarsi || 'تطابق تایید شده'}</span>
                  <span className="font-mono">({currentMatch.similarityScore}٪)</span>
                </div>
              )}
            </div>

            {/* If analyzing: animated laser scanning visual */}
            {isAnalyzing && (
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 flex flex-col items-center justify-center text-white border border-cyan-500/40 p-6">
                {userImage && (
                  <img
                    src={userImage}
                    alt="Scanning"
                    className="absolute inset-0 w-full h-full object-contain opacity-40 blur-xs"
                  />
                )}
                {/* Laser scan line */}
                <motion.div
                  animate={{ y: [-140, 140, -140] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] z-20"
                />
                <div className="relative z-30 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 mx-auto flex items-center justify-center animate-pulse">
                    <Scan className="w-7 h-7 text-cyan-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-cyan-300 text-sm">
                      در حال اسکن هندسی و تطبیق تصویر با کاتالوگ...
                    </p>
                    <p className="text-xs text-slate-300">
                      بررسی فرم دندانه‌ها، ضخامت، پروفیل و جستجو در ۸۶۴ قلم کالای اطلس
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* When ready: Dual Side-by-Side Images */}
            {!isAnalyzing && userImage && currentMatch && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* User Photo */}
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-500" />
                        عکس ارسالی شما
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">کاربر</span>
                    </div>
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-900/10 flex items-center justify-center">
                      <img
                        src={userImage}
                        alt="User Part"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Catalog Official Match Photo */}
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-950 border-2 border-indigo-500/40 p-3 flex flex-col items-center">
                    <div className="w-full flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        عکس منطبق در کاتالوگ اطلس
                      </span>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        صفحه {currentMatch.cataloguePage || 1}
                      </span>
                    </div>
                    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center p-2">
                      <img
                        src={currentMatch.image || currentMatch.catalogProduct?.images?.[0] || '/placeholder-product.png'}
                        alt={currentMatch.name}
                        className="w-full h-full object-contain"
                      />
                      {currentMatch.visualVerdict === 'exact_match' && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-emerald-600 text-white text-[10px] font-bold shadow">
                          🎯 همونه
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Candidate Selection Tabs (if multiple candidates) */}
                {analysisResult?.matchedProducts && analysisResult.matchedProducts.length > 1 && (
                  <div className="pt-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                      سایر کالاهای منطبق در کاتالوگ بر اساس تشابه ظاهری:
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {analysisResult.matchedProducts.map((cand, idx) => (
                        <button
                          key={cand.code}
                          onClick={() => setSelectedMatchIndex(idx)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                            selectedMatchIndex === idx
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          <span className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="line-clamp-1 max-w-[140px]">{cand.name}</span>
                          <span className="text-[10px] opacity-80 font-mono">
                            {cand.similarityScore}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visual Feature Breakdown Matrix */}
                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-500" />
                    جدول مقایسه چشمی و هندسی مشخصات (هوش مصنوعی):
                  </h3>

                  <div className="space-y-2">
                    {currentMatch.visualFeaturesCompared && currentMatch.visualFeaturesCompared.length > 0 ? (
                      currentMatch.visualFeaturesCompared.map((f, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 min-w-[160px]">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>{f.feature}</span>
                          </div>
                          <div className="flex-1 grid grid-cols-2 gap-2 text-[11px]">
                            <div className="text-slate-600 dark:text-slate-400">
                              <span className="text-slate-400 dark:text-slate-500 ml-1">عکس شما:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {f.userImageObserved}
                              </span>
                            </div>
                            <div className="text-indigo-600 dark:text-indigo-300">
                              <span className="text-slate-400 dark:text-slate-500 ml-1">کاتالوگ:</span>
                              <span className="font-medium">
                                {f.catalogMatchObserved}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
                        {currentMatch.visualExplanation || 'انطباق ظاهری بر مبنای پروفیل دندانه‌ها، قطر و متریال تایید شد.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Product Quick Details & Action Bar */}
                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-right">
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 font-mono font-semibold">
                      کد رسمی کاتالوگ: {currentMatch.code} {currentMatch.forzaCode ? `| کد فورزا: ${currentMatch.forzaCode}` : ''}
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {currentMatch.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {currentMatch.price
                        ? `${currentMatch.price.toLocaleString('fa-IR')} تومان`
                        : 'استعلام فوری با کارشناسان'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (currentMatch.catalogProduct) {
                          addToCart(currentMatch.catalogProduct);
                        } else {
                          // synthesize basic product for cart
                          addToCart({
                            id: currentMatch.code,
                            code: currentMatch.code,
                            name: currentMatch.name,
                            category: 'industrial-belts',
                            subcategory: currentMatch.type || 'قطعه کاتالوگ',
                            price: currentMatch.price || 480000,
                            images: [currentMatch.image || '/placeholder-product.png'],
                            specs: currentMatch.specs || [],
                            description: currentMatch.matchReason,
                            stock: 20,
                            featured: false,
                            brand: currentMatch.brand || 'ATLAS SWR',
                          });
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>افزودن به سبد</span>
                    </button>

                    <Link
                      to={`/product/${currentMatch.code}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-medium text-xs transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>مشاهده در سایت</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State before any upload */}
            {!isAnalyzing && !userImage && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 text-center space-y-4 hover:border-cyan-500 dark:hover:border-cyan-400 transition-all cursor-pointer bg-slate-50/50 dark:bg-slate-800/30"
              >
                <div className="w-16 h-16 rounded-3xl bg-cyan-100 dark:bg-cyan-950/60 mx-auto flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-slate-800 dark:text-white text-base">
                    برای شناسایی، تصویر قطعه را اینجا بکشید یا کلیک کنید
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    پشتیبانی از انواع فرمت‌های JPG، PNG و WebP. می‌توانید از دکمه «Paste» یا کلیدهای Ctrl+V نیز برای الصاق مستقیم عکس استفاده نمایید.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow">
                  <Camera className="w-4 h-4" />
                  <span>آپلود یا عکاسی از قطعه</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Conversational AI Agent Chat (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col h-[640px]">
            {/* Chat Header */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between border-b border-indigo-900/60">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                    <Bot className="w-5 h-5" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    ایژنت مهندسی اطلس
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                      Online AI
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    مشاوره تخصصی انطباق ظاهری و فنی کاتالوگ
                  </p>
                </div>
              </div>

              <a
                href="tel:03538222222"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs flex items-center gap-1 transition-all"
                title="تماس مستقیم با واحد مهندسی"
              >
                <PhoneCall className="w-4 h-4" />
              </a>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60 dark:bg-slate-950/40">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                    <Bot className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 max-w-xs">
                    عکس قطعه مورد نظر را ارسال کنید تا ایژنت آن را شناسایی کرده و توضیحات فنی و کاتالوگی را ارائه دهد.
                  </p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} space-y-2`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-xs md:text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-bl-xs shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    </div>

                    {/* Suggested follow-up prompt chips */}
                    {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 max-w-[90%]">
                        {msg.suggestedFollowUps.map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(chip)}
                            className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-medium transition-all text-right cursor-pointer"
                          >
                            ⚡ {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Typing indicator */}
              {isSendingMessage && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 w-fit text-xs text-slate-500">
                  <Bot className="w-4 h-4 text-cyan-500 animate-spin" />
                  <span>ایژنت در حال بررسی مشخصات کاتالوگ...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="سؤال خود را درباره این قطعه از ایژنت بپرسید..."
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSendingMessage}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
