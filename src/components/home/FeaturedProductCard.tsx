import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { FileText, Heart, Check, ArrowLeft } from 'lucide-react';

interface FeaturedProductCardProps {
  product: Product;
}

export const FeaturedProductCard: React.FC<FeaturedProductCardProps> = ({ product }) => {
  const { currentUser, openAuthModal } = useAuth();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [inquired, setInquired] = useState(false);

  const isFavorited = isInWishlist(product.code);

  const handleInquiry = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentUser) {
      openAuthModal();
      return;
    }

    addToCart(product, 1);
    setInquired(true);
    setTimeout(() => setInquired(false), 2000);
  };

  return (
    <div className="group relative flex flex-col bg-white rounded-xl border border-slate-200/90 hover:border-[#F97316]/60 hover:shadow-lg transition-all duration-300 overflow-hidden text-right h-full">
      {/* Wishlist button */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWishlist(product.code);
        }}
        className="absolute top-2.5 left-2.5 z-10 w-7 h-7 rounded-full bg-white/90 shadow-xs flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors"
        title="افزودن به علاقه‌مندی‌ها"
      >
        <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
      </button>

      {/* Product Image */}
      <Link
        to={`/product/${encodeURIComponent(product.code)}`}
        className="block relative w-full pt-[75%] bg-slate-50/70 overflow-hidden border-b border-slate-100"
      >
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-300"
        />
      </Link>

      {/* Card Content */}
      <div className="flex flex-col flex-1 p-3.5 justify-between space-y-3">
        <div>
          {/* Product Name */}
          <Link
            to={`/product/${encodeURIComponent(product.code)}`}
            className="block font-bold text-sm text-[#0A172F] hover:text-[#F97316] transition-colors leading-snug line-clamp-1 mb-2"
            title={product.name}
          >
            {product.name}
          </Link>

          {/* Technical Specs & Code Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-slate-700">
              کد: {product.code}
            </span>
            {product.technicalSpecs && product.technicalSpecs[0] && (
              <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium border border-orange-100">
                {product.technicalSpecs[0].key}: {product.technicalSpecs[0].value}
              </span>
            )}
          </div>
        </div>

        {/* Stock Status & Inquiry Action */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              موجود در انبار
            </span>
            {product.brand && (
              <span className="text-slate-400 text-[10px] font-mono">
                {product.brand}
              </span>
            )}
          </div>

          {/* Inquiry Button (Solid Orange) */}
          <button
            type="button"
            onClick={handleInquiry}
            className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
              inquired
                ? 'bg-emerald-600 text-white'
                : 'bg-[#F97316] hover:bg-[#EA580C] text-white active:scale-[0.98]'
            }`}
          >
            {inquired ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>به استعلام افزوده شد</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>استعلام قیمت</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
