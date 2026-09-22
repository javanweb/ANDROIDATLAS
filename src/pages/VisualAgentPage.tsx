import React, { useEffect } from 'react';
import { VisualPartAgent } from '../components/agent/VisualPartAgent';
import { Link } from 'react-router-dom';
import { ChevronLeft, Home, Shield, Award, Cpu, Wrench } from 'lucide-react';

export function VisualAgentPage() {
  useEffect(() => {
    document.title = 'ایژنت هوشمند بینایی ماشین و جستجوی تصویری قطعات | هایپر صنعت اطلس';
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      {/* Breadcrumb */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-slate-500">
          <nav className="flex items-center gap-1.5">
            <Link to="/" className="hover:text-indigo-600 flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>خانه</span>
            </Link>
            <ChevronLeft className="w-3 h-3 text-slate-400" />
            <span className="text-slate-900 dark:text-white font-medium">
              ایژنت هوشمند شناسایی تصویری قطعات
            </span>
          </nav>

          <div className="hidden sm:flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
            <Cpu className="w-3.5 h-3.5" />
            <span>مجهز به هوش مصنوعی Gemini و بینایی ماشین</span>
          </div>
        </div>
      </div>

      {/* Main Agent Component */}
      <VisualPartAgent />

      {/* Technical & Trust Information Section */}
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400 mb-3">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              انطباق مستقیم با کاتالوگ ۸۶۴ قلمی
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              تصویر قطعه شما به صورت پیکسل‌به‌پیکسل با دیتابیس تصاویر صنعتی کاتالوگ رسمی هایپر صنعت اطلس تطبیق داده می‌شود تا دقیقاً همان کالا شناسایی گردد.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              اصالت و گارانتی برندهای معتبر
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              کلیه تسمه‌ها و قطعات شناسایی‌شده ساخت کارخانجات SWR آلمان و FORZA با استانداردهای DIN و تضمین عدم لنگی و سایش زودهنگام ارائه می‌گردند.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
              <Wrench className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              کارگاه تخصصی ساخت قطعات سفارشی
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              در صورتی که قطعه شما ابعاد خاص داشته باشد، واحد تراشکاری و ریخته‌گری اطلس در یزد امکان ساخت سفارشی آن را در کوتاه‌ترین زمان ممکن دارد.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
