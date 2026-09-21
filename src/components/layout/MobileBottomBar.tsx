import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Grid,
  ShoppingCart,
  PhoneCall,
  User,
  Sparkles,
  X,
  Camera,
  MessageCircle,
  Headphones,
  ChevronLeft,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { AiConsultModal } from '../search/AiConsultModal';
import { AiVisualPartSearchModal } from '../search/AiVisualPartSearchModal';

interface MobileBottomBarProps {
  onOpenMobileMenu?: () => void;
  onOpenSearch?: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  onOpenSearch,
}) => {
  const location = useLocation();
  const { itemCount } = useCart();
  const { currentUser, openAuthModal } = useAuth();
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const toPersianDigits = (num: number) => {
    const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return num.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x, 10)]);
  };

  return (
    <>
      {/* Mobile Floating / Docked Bottom Navigation Bar (Visible only on < lg) */}
      <nav
        aria-label="منوی دسترسی سریع موبایل"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#0A1220]/95 backdrop-blur-md border-t border-slate-800/90 shadow-[0_-8px_25px_rgba(0,0,0,0.35)] lg:hidden transition-all duration-300 pb-[env(safe-area-inset-bottom)]"
        dir="rtl"
      >
        <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">
          {/* 1. خرید (Shop / Catalog / Products) */}
          <Link
            to="/catalog"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all ${
              isActive('/catalog') && !location.pathname.startsWith('/category')
                ? 'text-[#F97316]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Home className="w-5 h-5 transition-transform" />
              {isActive('/catalog') && !location.pathname.startsWith('/category') && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F97316] rounded-full shadow-[0_0_6px_#F97316]" />
              )}
            </div>
            <span className="text-[10px] font-bold mt-1 tracking-tight">خرید</span>
          </Link>

          {/* 2. دسته‌بندی (Categories) */}
          <Link
            to="/category/industrial-belts"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all ${
              isActive('/category')
                ? 'text-[#F97316]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Grid className="w-5 h-5 transition-transform" />
              {isActive('/category') && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F97316] rounded-full shadow-[0_0_6px_#F97316]" />
              )}
            </div>
            <span className="text-[10px] font-bold mt-1 tracking-tight">دسته‌بندی</span>
          </Link>

          {/* 3. سبد خرید (Cart & RFQ) */}
          <Link
            to="/cart"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all relative ${
              isActive('/cart') || isActive('/checkout')
                ? 'text-[#F97316]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5 transition-transform" />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -left-2.5 min-w-[17px] h-4 px-1 rounded-full bg-[#F97316] text-white text-[9px] font-mono font-black flex items-center justify-center border-2 border-[#0A1220] shadow-xs">
                  {toPersianDigits(itemCount)}
                </span>
              )}
              {(isActive('/cart') || isActive('/checkout')) && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F97316] rounded-full shadow-[0_0_6px_#F97316]" />
              )}
            </div>
            <span className="text-[10px] font-bold mt-1 tracking-tight">سبد خرید</span>
          </Link>

          {/* 4. پشتیبانی (Customer Support & Hotline Sheet) */}
          <button
            type="button"
            onClick={() => setIsContactSheetOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            aria-label="پشتیبانی و ارتباط با کارشناسان"
          >
            <div className="relative">
              <PhoneCall className="w-5 h-5 transition-transform" />
            </div>
            <span className="text-[10px] font-bold mt-1 tracking-tight">پشتیبانی</span>
          </button>

          {/* 5. هایپر صنعت من (My Hyper Sanat / User Account & Portal) */}
          {currentUser ? (
            <Link
              to={currentUser.role === 'dealer' ? '/dealer' : currentUser.role === 'admin' ? '/admin' : '/account'}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all ${
                isActive('/account') || isActive('/dealer') || isActive('/admin')
                  ? 'text-[#F97316]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <User className="w-5 h-5 transition-transform" />
                {(isActive('/account') || isActive('/dealer') || isActive('/admin')) && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#F97316] rounded-full shadow-[0_0_6px_#F97316]" />
                )}
              </div>
              <span className="text-[10px] font-bold mt-1 tracking-tight truncate max-w-[70px]">
                هایپر صنعت من
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              aria-label="هایپر صنعت من (ورود / ثبت‌نام)"
            >
              <div className="relative">
                <User className="w-5 h-5 transition-transform" />
              </div>
              <span className="text-[10px] font-bold mt-1 tracking-tight truncate max-w-[70px]">
                هایپر صنعت من
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Quick Contact & Hotline Bottom Sheet */}
      {isContactSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            onClick={() => setIsContactSheetOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
          />

          {/* Sheet Body */}
          <div
            className="relative z-10 w-full bg-[#0D1525] border-t border-slate-700/80 rounded-t-3xl p-5 text-white shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            dir="rtl"
          >
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-600/80 rounded-full mx-auto" />

            {/* Sheet Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="text-right">
                <h3 className="font-black text-base text-white">پشتیبانی و ارتباط با کارشناسان اطلس</h3>
                <p className="text-xs text-slate-400 mt-0.5">پاسخگویی فنی و استعلام فوری قطعات خطوط تولید</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactSheetOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Contact Action Buttons */}
            <div className="space-y-2.5">
              {/* Call Hotline 1 */}
              <a
                href="tel:03538739900"
                className="flex items-center justify-between p-3.5 bg-gradient-to-r from-[#EA580C] to-[#F97316] rounded-2xl text-white font-bold shadow-lg shadow-orange-950/40 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                    <PhoneCall className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black">تماس مستقیم با واحد فروش</div>
                    <div className="text-xs font-mono text-orange-100 mt-0.5" dir="ltr">
                      ۰۳۵-۳۸۷۳۹۹۰۰-۰
                    </div>
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5" />
              </a>

              {/* Call Hotline 2 (Direct line) */}
              <a
                href="tel:03538739988"
                className="flex items-center justify-between p-3.5 bg-[#141E33] border border-slate-700/80 rounded-2xl text-white font-bold hover:border-[#F97316] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-[#F97316]">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">پشتیبانی فنی و مهندسی</div>
                    <div className="text-xs font-mono text-slate-300 mt-0.5" dir="ltr">
                      ۰۳۵-۳۸۷۳۹۹۸۸
                    </div>
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5 text-slate-400" />
              </a>

              {/* WhatsApp Support */}
              <a
                href="https://wa.me/989903427027"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3.5 bg-[#0F2A1D] border border-emerald-500/40 rounded-2xl text-white font-bold hover:border-emerald-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-300">ارتباط در واتس‌اپ</div>
                    <div className="text-xs font-mono text-slate-300 mt-0.5" dir="ltr">
                      +۹۸ ۹۹۰ ۳۴۲ ۷۰۲۷
                    </div>
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5 text-emerald-400" />
              </a>

              {/* AI Image / Camera Search Trigger */}
              <button
                type="button"
                onClick={() => {
                  setIsContactSheetOpen(false);
                  setIsCameraModalOpen(true);
                }}
                className="w-full flex items-center justify-between p-3.5 bg-[#141E33] border border-blue-500/30 rounded-2xl text-white font-bold hover:border-blue-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-200">شناسایی تصویری قطعه (هوش مصنوعی)</div>
                    <div className="text-xs text-slate-400 mt-0.5">ارسال عکس پلاک یا قطعه جهت تطبیق هوشمند</div>
                  </div>
                </div>
                <ChevronLeft className="w-5 h-5 text-blue-400" />
              </button>
            </div>

            {/* Operating Hours Note */}
            <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-slate-800/80">
              ساعات پاسخگویی: شنبه تا پنجشنبه از ساعت ۸:۰۰ الی ۲۰:۰۰
            </div>
          </div>
        </div>
      )}

      {/* Global AI Modals */}
      <AiConsultModal
        isOpen={isConsultModalOpen}
        onClose={() => setIsConsultModalOpen(false)}
      />
      <AiVisualPartSearchModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
      />
    </>
  );
};
