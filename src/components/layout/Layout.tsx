import React from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomBar } from './MobileBottomBar';
import { AuthModal } from '../auth/AuthModal';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  // Isolated dedicated portals: Admin, Dealer/Agency panel, and Customer Portal
  const isDedicatedPortal =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/dealer') ||
    location.pathname.startsWith('/account');

  if (isDedicatedPortal) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0A172F]">
        {children}
        <AuthModal />
      </div>
    );
  }

  const isHomePage = location.pathname === '/';

  const handleOpenMobileMenu = () => {
    window.dispatchEvent(new CustomEvent('open-mobile-menu'));
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent('open-mobile-search'));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0A172F] overflow-x-hidden">
      <Header />
      <main className={`flex-1 w-full pb-16 lg:pb-0 ${isHomePage ? '' : 'max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6'}`}>
        {children}
      </main>
      <Footer />
      {/* Mobile Floating Bottom Navigation Bar */}
      <MobileBottomBar
        onOpenMobileMenu={handleOpenMobileMenu}
        onOpenSearch={handleOpenSearch}
      />
      {/* Global OTP Auth Modal */}
      <AuthModal />
    </div>
  );
};
