"use client";

import Badge from "@/components/Badge";
import { PriceDisplay } from "@/components/PriceDisplay";

export interface HomePlansSectionProps {
  isDarkMode: boolean;
}

const PLAN_ORDER: Array<"basic" | "standard" | "pro" | "enterprise"> = ["basic", "standard", "pro", "enterprise"];

function PlanFeatureList({
  features,
  isDarkMode,
}: {
  features: string[];
  isDarkMode: boolean;
}) {
  return (
    <ul className="space-y-0.5 sm:space-y-1.5 md:space-y-3 mb-2 sm:mb-4 md:mb-6 lg:mb-8">
      {features.map((feature) => (
        <li key={feature} className="flex items-center">
          <svg className="w-3 h-3 sm:w-4 sm:h-4 text-green-500 mr-1 sm:mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className={`text-[10px] sm:text-xs transition-all duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
            {feature}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HomePlansSection({ isDarkMode }: HomePlansSectionProps) {
  return (
    <section className={`pt-2 sm:pt-4 md:pt-8 pb-6 sm:pb-10 md:pb-20 transition-all duration-300 ${isDarkMode ? "" : "bg-white/50"}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="text-center mb-4 sm:mb-8 md:mb-16">
          <h2 className={`text-xl sm:text-2xl md:text-4xl font-bold transition-colors duration-300 ${
            isDarkMode ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent" : "bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent"
          }`}>
            Alege Planul Perfect
          </h2>
          <p className={`mt-1 sm:mt-2 md:mt-3 text-xs sm:text-sm md:text-lg lg:text-xl transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
            Sistemul nostru de tokens îți oferă flexibilitate maximă pentru licitații
          </p>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <PlanCard type="basic" isDarkMode={isDarkMode} />
            <PlanCard type="standard" isDarkMode={isDarkMode} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PlanCard type="pro" isDarkMode={isDarkMode} />
            <PlanCard type="enterprise" isDarkMode={isDarkMode} />
          </div>
        </div>
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {PLAN_ORDER.map((plan) => (
            <PlanCard key={plan} type={plan} isDarkMode={isDarkMode} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ type, isDarkMode }: { type: "basic" | "standard" | "pro" | "enterprise"; isDarkMode: boolean }) {
  const baseClass = `backdrop-blur-lg rounded-xl md:rounded-2xl p-3 sm:p-4 md:p-6 lg:p-8 transition-all duration-300 hover:shadow-2xl md:hover:scale-105 ${isDarkMode ? "border border-white/20" : "bg-white/90 border border-gray-200 shadow-lg"}`;
  if (type === "basic") {
    return (
      <div key="basic-plan" className={baseClass}>
        <div className="text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8">
          <h3 className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Basic</h3>
          <div className="mb-1 sm:mb-2 md:mb-4">
            <span className={`text-lg sm:text-2xl md:text-4xl font-bold ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>0 Lei</span>
            <span className={`ml-0.5 sm:ml-1 text-xs sm:text-base md:text-lg ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>/lună</span>
          </div>
          <div className={`mb-1 sm:mb-2 md:mb-4 rounded md:rounded-lg px-2 py-1 sm:px-3 sm:py-2 ${isDarkMode ? "bg-green-900/30 border border-green-500/30" : "bg-green-50 border border-green-200"}`}>
            <div className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold ${isDarkMode ? "text-green-400" : "text-green-600"}`}>10 Tokens</div>
            <div className={`text-[10px] sm:text-xs md:text-sm ${isDarkMode ? "text-green-300" : "text-green-700"}`}>Bonus de bine ai venit</div>
          </div>
          <p className={`hidden sm:block text-xs md:text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Ideal pentru a explora platforma</p>
        </div>
        <PlanFeatureList features={["Chat/email suport", "Notificări push", "Dashboard Pro"]} isDarkMode={isDarkMode} />
        <a href="/auth?mode=register" className="block w-full bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-white py-1.5 sm:py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs sm:text-sm md:font-semibold font-medium transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group text-center">
          <span className="relative z-10">Începe Gratuit</span>
        </a>
      </div>
    );
  }
  if (type === "standard") {
    return (
      <div key="standard-plan" className={`${baseClass} relative ${isDarkMode ? "!border-2 border-white/20" : "!border-2 border-gray-200"}`}>
        <Badge text="15% OFF" subtext="LIMITED" color="red" />
        <div className="text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8">
          <h3 className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Standard</h3>
          <PriceDisplay originalPrice={50} discountPercent={15} isDarkMode={isDarkMode} />
          <div className={`mb-1 sm:mb-2 md:mb-4 rounded md:rounded-lg px-2 py-1 sm:px-3 sm:py-2 ${isDarkMode ? "bg-blue-900/30 border border-blue-500/30" : "bg-blue-50 border border-blue-200"}`}>
            <div className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>50 Tokens</div>
            <div className={`text-[10px] sm:text-xs md:text-sm ${isDarkMode ? "text-blue-300" : "text-blue-700"}`}>Lunar</div>
          </div>
          <p className={`hidden sm:block text-xs md:text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Soluție echilibrată pentru licitații regulate</p>
        </div>
        <PlanFeatureList features={["Chat/email suport", "Notificări push", "Suport priorititar", "Dashboard Pro"]} isDarkMode={isDarkMode} />
        <a href="/dashboard/tokens" className="block w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white py-1.5 sm:py-2 md:py-2.5 rounded-lg text-xs sm:text-sm font-medium md:font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-center">Alege Standard</a>
      </div>
    );
  }
  if (type === "pro") {
    return (
      <div key="pro-plan" className={`${baseClass} relative ${isDarkMode ? "border-2 border-blue-500/80 ring-2 ring-blue-500/30" : "bg-white/90 border-2 border-blue-500 ring-2 ring-blue-200 shadow-xl"}`}>
        <div className="absolute -top-2 md:-top-4 left-1/2 transform -translate-x-1/2 z-10">
          <span className="bg-gradient-to-r from-blue-600 to-blue-600 text-white px-2 py-0.5 sm:px-5 sm:py-1.5 rounded-full text-[10px] sm:text-sm font-bold shadow-lg">⭐ Popular</span>
        </div>
        <Badge text="30% OFF" subtext="LIMITED" color="orange" />
        <div className="text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8">
          <h3 className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Pro</h3>
          <PriceDisplay originalPrice={100} discountPercent={30} isDarkMode={isDarkMode} />
          <div className={`mb-1 sm:mb-2 md:mb-4 rounded md:rounded-lg px-2 py-1 sm:px-3 sm:py-2 ${isDarkMode ? "bg-blue-900/30 border border-blue-500/30" : "bg-blue-50 border border-blue-200"}`}>
            <div className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>100 Tokens</div>
            <div className={`text-[10px] sm:text-xs md:text-sm ${isDarkMode ? "text-blue-300" : "text-blue-700"}`}>Lunar</div>
          </div>
          <p className={`hidden sm:block text-xs md:text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Pentru utilizatori dedicați și licitații frecvente</p>
        </div>
        <PlanFeatureList features={["Chat/email suport", "Notificări push", "Suport priorititar", "Dashboard Pro"]} isDarkMode={isDarkMode} />
        <a href="/dashboard/tokens" className="block w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white py-1.5 sm:py-2 md:py-2.5 rounded-lg text-xs sm:text-sm font-medium md:font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-center">Alege Pro</a>
      </div>
    );
  }
  // enterprise
  return (
    <div key="enterprise-plan" className={`${baseClass} relative ${isDarkMode ? "border-2 border-teal-500/60 ring-2 ring-teal-500/30" : "bg-white/90 border-2 border-teal-500 ring-2 ring-teal-200 shadow-xl"}`}>
      <Badge text="OFERTĂ" subtext="250 → 150 Lei" color="blue" />
      <div className="text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8">
        <h3 className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold mb-0.5 sm:mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Enterprise</h3>
        <PriceDisplay originalPrice={250} discountPercent={40} isDarkMode={isDarkMode} />
        <div className={`mb-1 sm:mb-2 md:mb-4 rounded md:rounded-lg px-2 py-1 sm:px-3 sm:py-2 ${isDarkMode ? "bg-teal-900/30 border border-teal-500/30" : "bg-teal-50 border border-teal-200"}`}>
          <div className={`text-sm sm:text-base md:text-xl lg:text-2xl font-bold ${isDarkMode ? "text-teal-400" : "text-teal-600"}`}>250 Tokens</div>
          <div className={`text-[10px] sm:text-xs md:text-sm ${isDarkMode ? "text-teal-300" : "text-teal-700"}`}>Lunar</div>
        </div>
        <p className={`hidden sm:block text-xs md:text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Maximă putere și acces pentru licitații premium</p>
      </div>
      <PlanFeatureList features={["Chat/email suport", "Notificări push", "Suport priorititar", "Consultant dedicat"]} isDarkMode={isDarkMode} />
      <div className={`mb-2 sm:mb-4 rounded md:rounded-lg px-2 py-1 sm:px-3 sm:py-2 text-center text-[10px] sm:text-xs md:text-sm font-semibold uppercase tracking-wide ${isDarkMode ? "bg-teal-900/25 border border-teal-500/30 text-teal-200" : "bg-teal-50 border border-teal-200 text-teal-700"}`}>
        Acces la licitații private inclus gratuit
      </div>
      <a href="/dashboard/tokens" className="block w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white py-1.5 sm:py-2 md:py-2.5 rounded-lg text-xs sm:text-sm font-medium md:font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-center">Alege Enterprise</a>
    </div>
  );
}
