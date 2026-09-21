import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Bot,
  Send,
  User,
  RotateCcw,
  CheckCircle2,
  ChevronLeft,
  X,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { STORE_ASSETS } from '../../assets/images';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  sender: 'ai' | 'user';
  text: string;
  time: string;
  suggestedAction?: {
    label: string;
    link?: string;
  };
}

export const AiConsultModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'ai',
      text: 'درود! من دستیار هوشمند مهندسی و بازرگانی اطلس هستم. در زمینه انتخاب انواع تسمه‌های انتقال قدرت (V-Belt، تایمینگ، شیاردار)، پولی، فلکه، بلبرینگ و قطعات خطوط تولید کارخانجات، چه کمکی می‌توانم به شما بکنم؟',
      time: 'اکنون',
    },
  ]);

  const QUICK_QUESTIONS = [
    'تسمه مناسب برای کوره رولری پخت کاشی با حرارت بالا چیست؟',
    'محاسبه طول تسمه V-Belt بین دو پولی با فاصله محوری مشخص',
    'تفاوت تسمه تایمینگ پلی‌یورتان با کورد استیل و کلروپرن چیست؟',
    'استعلام قیمت و موجودی محصولات انحصاری FORZA و SWR',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      sender: 'user',
      text: textToSend,
      time: 'هم‌اکنون',
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      // Send to server Gemini API if available, or generate smart industrial response
      const res = await fetch('/api/ai/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: textToSend }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: data.reply,
            time: 'هم‌اکنون',
            suggestedAction: data.suggestedAction,
          },
        ]);
      } else {
        throw new Error('API fallback');
      }
    } catch {
      // Smart Industrial Fallback response
      setTimeout(() => {
        let answer = '';
        if (textToSend.includes('کوره') || textToSend.includes('کاشی') || textToSend.includes('حرارت')) {
          answer =
            'برای کوره‌های رولری و خطوط کاشی و سرامیک، توصیه مهندسی ما استفاده از تسمه‌های تایمینگ حرارتی با روکش ضدسایش و تسمه‌های جوشی پلی‌یورتان مقاوم تا دمای ۲۰۰ درجه سانتی‌گراد برندهای FORZA و SWR است. همچنین رولیک‌های سرامیکی مقاوم به شوک حرارتی در انبار مرکزی اطلس یزد موجود می‌باشد.';
        } else if (textToSend.includes('محاسبه') || textToSend.includes('طول') || textToSend.includes('پولی')) {
          answer =
            'فرمول استاندارد محاسبه طول تسمه باز: L ≈ 2C + 1.57(D + d) + (D - d)² / (4C). که در آن C فاصله محوری شفت‌ها، D قطر پولی بزرگ و d قطر پولی کوچک است. برای انتخاب گام دندانه و مقطع (SPZ, SPA, SPB, SPC) می‌توانید مقادیر دقیق را برای ما بفرستید تا جدول انطباق را ارائه دهیم.';
        } else if (textToSend.includes('FORZA') || textToSend.includes('SWR') || textToSend.includes('قیمت')) {
          answer =
            'شرکت بازرگانی اطلس نماینده رسمی و انحصاری برندهای SWR آلمان و FORZA ایتالیا در ایران است. تمامی اقلام با گواهی اصالت و صدور فاکتور رسمی از انبار یزد ارسال می‌شوند. شما می‌توانید از بخش کاتالوگ یا دکمه استعلام قیمت، پیش‌فاکتور آنی دریافت کنید.';
        } else {
          answer =
            'بر اساس نیاز صنعتی شما، ما انواع مقاطع تسمه‌های انتقال قدرت با استانداردهای DIN 2215، DIN 7753 و ISO 4184 و بلبرینگ‌های دور بالا را تأمین می‌کنیم. برای ارائه پیشنهاد دقیق، لطفاً توان موتور (کیلووات)، دور ورودی و نوع دستگاه را اعلام فرمایید.';
        }

        setMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: answer,
            time: 'هم‌اکنون',
            suggestedAction: {
              label: 'مشاهده دسته‌بندی محصولات',
              link: '/category/industrial-belts',
            },
          },
        ]);
      }, 700);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="مشاوره تخصصی انتقال قدرت با هوش مصنوعی"
      maxWidth="lg"
    >
      <div className="space-y-4 text-right">
        {/* Banner with AI image and header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#070D18] via-[#0F1E36] to-[#0A172F] p-4 text-white border border-slate-700/80 flex items-center justify-between gap-4">
          <div className="space-y-1 z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/20 text-[#F97316] text-[11px] font-bold border border-orange-500/30">
              <Sparkles className="w-3 h-3" />
              <span>پاسخگویی مهندسی آنی</span>
            </div>
            <h4 className="text-sm sm:text-base font-black">مشاور صنعتی هوشمند اطلس</h4>
            <p className="text-xs text-slate-300 max-w-md">
              پاسخ به سوالات فنی، محاسبه طول و گام دندانه، انتخاب برند و راهکار قطعات خط تولید
            </p>
          </div>

          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shrink-0 border border-orange-500/30 shadow-lg bg-black">
            <img
              src={STORE_ASSETS.aiConsultRobot}
              alt="هوش مصنوعی اطلس"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Chat message flow */}
        <div className="h-72 overflow-y-auto p-3 space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  m.sender === 'user'
                    ? 'bg-[#0A172F] text-white'
                    : 'bg-[#F97316] text-white shadow-xs'
                }`}
              >
                {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[82%] p-3 rounded-2xl text-xs leading-relaxed space-y-2 ${
                  m.sender === 'user'
                    ? 'bg-[#0A172F] text-white rounded-tr-none'
                    : 'bg-white text-[#0A172F] border border-slate-200 shadow-2xs rounded-tl-none'
                }`}
              >
                <p>{m.text}</p>
                {m.suggestedAction && (
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#F97316]">
                      {m.suggestedAction.label}
                    </span>
                    <ChevronLeft className="w-3.5 h-3.5 text-[#F97316]" />
                  </div>
                )}
                <span className="text-[10px] text-slate-400 block text-left">
                  {m.time}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-7 h-7 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center animate-spin">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span>هوش مصنوعی در حال تحلیل و فرمول‌بندی پاسخ مهندسی...</span>
            </div>
          )}
        </div>

        {/* Quick questions chips */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-slate-500 font-bold block">
            پرسش‌های متداول مهندسان:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(q)}
                className="text-[11px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-orange-50 hover:text-[#F97316] border border-slate-200 text-slate-700 transition-all cursor-pointer text-right"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input box */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 pt-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={e => setInputQuery(e.target.value)}
            placeholder="سوال فنی خود درباره تسمه، پولی، بلبرینگ یا کارخانه را بنویسید..."
            className="flex-1 h-11 px-4 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#F97316] shadow-2xs"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || loading}
            className="h-11 px-5 bg-[#F97316] hover:bg-[#EA580C] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm"
          >
            <span>ارسال</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </Modal>
  );
};
