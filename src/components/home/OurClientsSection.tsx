import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clientService, ClientLogo } from '../../services/clientService';
import { toPersianDigits } from '../../utils/formatters';

export const OurClientsSection: React.FC = () => {
  const [clients, setClients] = useState<ClientLogo[]>(() => clientService.getActiveClients());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [itemsPerView, setItemsPerView] = useState(4);
  const [disableTransition, setDisableTransition] = useState(false);

  // Responsive items count - matches product categories (7 on desktop, 4 on tablet, 2 on mobile)
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) setItemsPerView(2);
      else if (width < 1024) setItemsPerView(4);
      else setItemsPerView(7);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Subscribe to changes from Admin Panel
  useEffect(() => {
    const updateClients = () => {
      setClients(clientService.getActiveClients());
    };
    const unsubscribe = clientService.subscribe(updateClients);
    return () => unsubscribe();
  }, []);

  // Continuous 3-second automatic slide to the left without pause
  useEffect(() => {
    if (clients.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => prev + 1);
    }, 3000);

    return () => clearInterval(interval);
  }, [clients.length]);

  const handleNext = () => {
    if (clients.length === 0) return;
    setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (clients.length === 0) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : clients.length - 1));
  };

  // Seamless infinite loop handling:
  // When currentIndex reaches clients.length, silently reset to 0 right after transition completes
  useEffect(() => {
    if (clients.length === 0) return;
    if (currentIndex >= clients.length) {
      const timeout = setTimeout(() => {
        setDisableTransition(true);
        setCurrentIndex(0);
        setTimeout(() => {
          setDisableTransition(false);
        }, 40);
      }, 700);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, clients.length]);

  if (clients.length === 0) return null;

  // Extended array with duplicates to ensure infinite continuous flow to the left
  const extendedClients = [...clients, ...clients, ...clients, ...clients];

  return (
    <section
      id="our-clients-section"
      className="space-y-5 my-8 sm:my-10"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-200/80 pb-4 gap-3">
        <div className="space-y-1 text-right">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F97316] animate-pulse" />
            <h2 className="text-xl sm:text-2xl font-black text-[#0A172F]">مشتریان ما</h2>
            <span className="text-[11px] font-bold bg-orange-100 text-orange-700 px-2.5 py-0.5 rounded-full">
              {toPersianDigits(clients.length)} کارخانه و مجتمع صنعتی
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            افتخار همکاری و تأمین قطعات انتقال قدرت برای پیشگامان صنعت کشور
          </p>
        </div>

        {/* Controls: Clean Prev / Next Buttons without pause icon or badge text */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePrev}
            className="w-9 h-9 rounded-xl bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 text-slate-700 hover:text-[#F97316] flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            aria-label="قبلی"
            title="قبلی"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="w-9 h-9 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            aria-label="بعدی"
            title="بعدی"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ticker / Carousel Viewport continuously moving to the Left */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50/70 to-slate-100/40 p-4 border border-slate-200/80">
        {/* Soft edge blur masks for continuous flow */}
        <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-l from-slate-50 via-slate-50/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-r from-slate-50 via-slate-50/80 to-transparent z-10 pointer-events-none" />

        <div
          dir="ltr"
          className={`flex ${disableTransition ? '' : 'transition-transform duration-700 ease-in-out'}`}
          style={{
            transform: `translateX(-${currentIndex * (100 / itemsPerView)}%)`,
          }}
        >
          {extendedClients.map((client, idx) => (
            <div
              key={`${client.id}-${idx}`}
              className="w-1/2 sm:w-1/4 lg:w-[14.2857%] shrink-0 px-[7px]"
              dir="rtl"
            >
              <div
                className="group h-full bg-transparent p-2 flex flex-col items-center text-center justify-between hover:-translate-y-1 transition-all duration-300 relative"
              >
                {/* Logo Box - No border, full size */}
                <div className="w-full aspect-square rounded-2xl bg-white flex items-center justify-center overflow-hidden group-hover:shadow-md group-hover:shadow-orange-500/10 transition-all mb-3">
                  <img
                    src={client.logo}
                    alt={client.name}
                    className="w-full h-full object-contain filter group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>

                {/* Company Name & Industry Tag */}
                <div className="w-full space-y-1.5 text-center">
                  <h3 className="text-xs sm:text-sm font-bold text-[#0A172F] group-hover:text-[#F97316] transition-colors line-clamp-1">
                    {client.name}
                  </h3>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-md bg-white shadow-xs line-clamp-1">
                      {client.industry}
                    </span>
                  </div>
                </div>

                {/* Optional Year */}
                {client.since && (
                  <div className="mt-2 text-[10px] text-slate-400 font-mono">
                    همکاری از {toPersianDigits(client.since)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Indicators Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-4">
          {clients.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex % clients.length === idx
                  ? 'w-6 bg-[#F97316]'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`اسلاید ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
