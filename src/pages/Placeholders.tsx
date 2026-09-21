import React from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Building,
  ShieldCheck,
  Settings,
  ChevronLeft,
  Award,
  FileText,
  Clock,
  CheckCircle,
  Package,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClubPoints } from '../context/ClubPointsContext';
import { MOCK_ORDERS, MOCK_INQUIRIES, MOCK_REPRESENTATIVES, MOCK_DEALER_ORDERS } from '../data/mockData';
import { toPersianDigits, formatPrice } from '../utils/formatters';

interface PlaceholderProps {
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}

const BasePlaceholder: React.FC<PlaceholderProps> = ({ title, subtitle, badge, icon, children }) => {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#64748B]">
        <Link to="/" className="hover:text-[#F97316]">
          صفحه اصلی
        </Link>
        <ChevronLeft className="w-3.5 h-3.5" />
        <span className="text-[#0A172F] font-bold">{title}</span>
      </nav>

      {/* Hero Header */}
      <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0A172F] text-[#F97316] flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-[#0A172F]">{title}</h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-100 text-[#EA580C]">
                {badge}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="text-xs text-[#64748B] bg-slate-50 px-3.5 py-2 rounded-lg border border-slate-200">
          وضعیت بخش: <strong className="text-emerald-600 font-bold">اسکلت اولیه و آماده توسعه فاز ۱</strong>
        </div>
      </div>

      {children}
    </div>
  );
};

// 1. Account Portal Placeholder
export const AccountPlaceholder: React.FC = () => {
  const { currentUser, roleTitle } = useAuth();
  const { points, tier, transactions } = useClubPoints();

  return (
    <BasePlaceholder
      title="پرتال حساب کاربری و باشگاه مشتریان اطلس"
      subtitle="مدیریت مشخصات، تاریخچه سفارشات کارخانه و امتیازات باشگاه مشتریان (Club Points)"
      badge="حساب کاربری"
      icon={<User className="w-6 h-6" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-5 shadow-sm space-y-3 text-xs">
          <h3 className="font-bold text-sm text-[#0A172F] border-b border-[#E2E8F0] pb-2">
            مشخصات کاربری
          </h3>
          <div className="space-y-2 text-[#64748B]">
            <div>نام: <strong className="text-[#0A172F]">{currentUser?.fullName || 'کاربر مهمان'}</strong></div>
            <div>شرکت / واحد صنعتی: <strong className="text-[#0A172F]">{currentUser?.companyName || 'ثبت نشده'}</strong></div>
            <div>نقش در هایپر صنعت: <strong className="text-[#F97316]">{roleTitle}</strong></div>
            <div>شهر و استان: <strong className="text-[#0A172F]">{currentUser?.city || 'یزد'}</strong></div>
          </div>
        </div>

        {/* Club Points Card */}
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-5 shadow-sm space-y-3 text-xs">
          <h3 className="font-bold text-sm text-[#0A172F] border-b border-[#E2E8F0] pb-2 flex items-center justify-between">
            <span>باشگاه مشتریان اطلس</span>
            <Award className="w-4 h-4 text-[#F97316]" />
          </h3>
          <div className="space-y-2">
            <div className="text-2xl font-black text-[#F97316]">
              {toPersianDigits(points)} <span className="text-xs font-normal text-[#64748B]">امتیاز فعال</span>
            </div>
            <div className="text-[11px] text-[#64748B]">
              سطح باشگاه: <strong className="text-[#0A172F]">{tier === 'gold' ? 'طلایی (VIP)' : tier === 'silver' ? 'نقره‌ای' : 'برنزی'}</strong>
            </div>
            <p className="text-[10px] text-[#64748B]">
              هر ۵۰۰ امتیاز معادل ۵۰۰،۰۰۰ تومان بن خرید از اقلام ویژه SWR و FORZA است.
            </p>
          </div>
        </div>

        {/* Recent Inquiries Card */}
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-5 shadow-sm space-y-3 text-xs">
          <h3 className="font-bold text-sm text-[#0A172F] border-b border-[#E2E8F0] pb-2">
            آخرین استعلام‌های قیمت ثبت‌شده
          </h3>
          <div className="space-y-2">
            {MOCK_INQUIRIES.map(inq => (
              <div key={inq.id} className="p-2 rounded bg-slate-50 border border-slate-200">
                <div className="flex justify-between font-bold text-[#0A172F]">
                  <span>{inq.productCode}</span>
                  <span className="text-orange-600 text-[11px]">{inq.status === 'answered' ? 'پاسخ داده شده' : 'در حال بررسی'}</span>
                </div>
                <div className="text-[10px] text-[#64748B] truncate mt-1">{inq.productName}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BasePlaceholder>
  );
};

// 2. Dealer Portal Placeholder
export const DealerPlaceholder: React.FC = () => {
  return (
    <BasePlaceholder
      title="پرتال همکاران پخش و عمده‌فروشی کارخانجات (B2B Wholesale)"
      subtitle="مشاهده سبد خرید تجمیعی، دانلود لیست قیمت اکسل و مدیریت حواله‌های خرید عمده"
      badge="پرتال پخش"
      icon={<Building className="w-6 h-6" />}
    >
      <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-[#0A172F]">سفارش‌های عمده کارخانجات در جریان:</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B]">
              <tr>
                <th className="p-3">شماره سفارش</th>
                <th className="p-3">نام مرکز صنعتی / همکار</th>
                <th className="p-3">تعداد اقلام</th>
                <th className="p-3">مبلغ عمده (تومان)</th>
                <th className="p-3">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_DEALER_ORDERS.map(ord => (
                <tr key={ord.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold">{ord.orderNumber}</td>
                  <td className="p-3">{ord.dealerName}</td>
                  <td className="p-3 font-mono">{toPersianDigits(ord.itemsCount)} قلم</td>
                  <td className="p-3 font-bold text-[#0A172F]">{formatPrice(ord.totalWholesaleAmount)}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
                      {ord.status === 'warehouse_packing' ? 'در حال بسته‌بندی انبار' : 'ارسال شده به باربری'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BasePlaceholder>
  );
};

// 3. Agency Portal Placeholder
export const AgencyPlaceholder: React.FC = () => {
  return (
    <BasePlaceholder
      title="پرتال شبکه نمایندگی‌های انحصاری FORZA و SWR"
      subtitle="امور عاملیت‌های مجاز استانی، سهمیه‌بندی فصلی و ثبت درخواست نمایندگی جدید"
      badge="نمایندگی انحصاری"
      icon={<ShieldCheck className="w-6 h-6" />}
    >
      <div className="space-y-4">
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-[#0A172F]">فهرست شعب و نمایندگی‌های فعال بازرگانی تسمه اطلس:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MOCK_REPRESENTATIVES.map(rep => (
              <div key={rep.id} className="p-4 rounded-xl border border-[#E2E8F0] bg-slate-50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#0A172F]">{rep.name}</span>
                  <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">{rep.agencyCode}</span>
                </div>
                <div className="text-[#64748B]">مسئول: <strong className="text-[#0A172F]">{rep.managerName}</strong></div>
                <div className="text-[#64748B]">شهر: <strong className="text-[#0A172F]">{rep.city} ({rep.province})</strong></div>
                <div className="text-[#64748B]">تلفن: <span className="font-mono">{rep.phone}</span></div>
                <div className="pt-1 text-[11px] text-orange-600 font-semibold">
                  برندها: {rep.brands.join('، ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BasePlaceholder>
  );
};

// 4. Admin Portal Placeholder
export const AdminPlaceholder: React.FC = () => {
  return (
    <BasePlaceholder
      title="پنل مدیریت هایپر صنعت و بازرگانی تسمه اطلس"
      subtitle="مدیریت کاتالوگ ۵٬۰۰۰ قلمی کالا، تنظیم ۴ لایه قیمت، تایید استعلام‌ها و لاگ پیامک‌ها"
      badge="مدیریت سیستم"
      icon={<Settings className="w-6 h-6" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-4 shadow-sm space-y-1">
          <div className="text-[#64748B]">کل اقلام کاتالوگ:</div>
          <div className="text-xl font-black text-[#0A172F]">۵٬۲۰۰ کالا</div>
          <div className="text-[10px] text-emerald-600">همراه با کدهای فنی اختصاصی</div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-4 shadow-sm space-y-1">
          <div className="text-[#64748B]">استعلام‌های منتظر پاسخ:</div>
          <div className="text-xl font-black text-[#F59E0B]">۲ استعلام</div>
          <div className="text-[10px] text-[#64748B]">شانه نساجی و تسمه ۱۴M</div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-4 shadow-sm space-y-1">
          <div className="text-[#64748B]">سفارش‌های در حال پردازش:</div>
          <div className="text-xl font-black text-[#16A34A]">۴ فاکتور</div>
          <div className="text-[10px] text-[#64748B]">انبار مرکزی یزد</div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#E2E8F0] p-4 shadow-sm space-y-1">
          <div className="text-[#64748B]">اعتبار نمایندگی‌ها:</div>
          <div className="text-xl font-black text-[#0A172F]">۳ مرکز فعال</div>
          <div className="text-[10px] text-blue-600">یزد، اصفهان، میبد</div>
        </div>
      </div>
    </BasePlaceholder>
  );
};
