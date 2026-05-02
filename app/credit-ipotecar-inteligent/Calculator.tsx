"use client";

import { useState, useEffect } from "react";
import { CalculatorIcon, CurrencyDollarIcon, CalendarIcon, ChartBarIcon, SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface MonthlyPaymentDetail {
  month: number;
  balance: number;
  interest: number;
  principalPaid: number;
  extraPayment: number;
  totalPayment: number;
}

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
  monthlyDetails: MonthlyPaymentDetail[];
}

interface CalculatorProps {
  onCalculate: (data: {
    currency: "RON" | "EUR";
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    extraPaymentMonthly: number;
    result: CalculationResult;
  }) => void;
  isDarkMode: boolean;
}

export default function Calculator({ onCalculate, isDarkMode }: CalculatorProps) {
  const [currency, setCurrency] = useState<"RON" | "EUR">("RON");
  const [principal, setPrincipal] = useState<string>("");
  const [annualRate, setAnnualRate] = useState<string>("");
  const [monthsRemaining, setMonthsRemaining] = useState<string>("");
  const [extraPaymentMonthly, setExtraPaymentMonthly] = useState<string>("");
  const [useOptimalPayment, setUseOptimalPayment] = useState<boolean>(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string>("");

  // State pentru ROBOR și IRCC
  const [robor3m, setRobor3m] = useState<number | null>(null);
  const [ircc, setIrcc] = useState<number | null>(null);
  const [ratesLoading, setRatesLoading] = useState<boolean>(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string | null>(null);

  // State pentru tip dobândă și sursă
  const [interestType, setInterestType] = useState<"variabila" | "fixa">("variabila");
  const [interestSource, setInterestSource] = useState<"robor" | "ircc" | "custom">("custom");
  const [bankMargin, setBankMargin] = useState<string>(""); // Marja băncii pentru dobândă variabilă

  // Calculează suma optimă de plată extra lunară (GoBid AI)
  // Strategie: 25% din rata lunară pentru un echilibru bun între reducerea perioadei și accesibilitate
  function calculateOptimalExtraPayment(
    principal: number,
    annualRate: number,
    monthsRemaining: number
  ): number {
    const monthlyPayment = calculateMonthlyPayment(principal, annualRate, monthsRemaining);
    // Folosim 25% din rata lunară ca sumă optimă - un echilibru bun între eficiență și accesibilitate
    const optimalPercentage = 0.25;
    return Math.round(monthlyPayment * optimalPercentage);
  }

  // Calculează câte luni se reduc pe baza plății extra lunare
  function calculateMonthsReduced(
    principal: number,
    annualRate: number,
    monthsRemaining: number,
    extraPaymentMonthly: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    const basePayment =
      (principal * (monthlyRate * Math.pow(1 + monthlyRate, monthsRemaining))) /
      (Math.pow(1 + monthlyRate, monthsRemaining) - 1);
    
    let balance = principal;
    let monthsPaid = 0;

    // Simulează rambursarea cu plata extra
    for (let m = 0; m < monthsRemaining; m++) {
      const interest = balance * monthlyRate;
      const principalPaid = basePayment + extraPaymentMonthly - interest;
      balance -= principalPaid;
      monthsPaid++;
      
      if (balance <= 0) break;
    }

    return monthsRemaining - monthsPaid;
  }

  // Calculează rata normală lunară
  function calculateMonthlyPayment(
    principal: number,
    annualRate: number,
    monthsRemaining: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    return (
      (principal * (monthlyRate * Math.pow(1 + monthlyRate, monthsRemaining))) /
      (Math.pow(1 + monthlyRate, monthsRemaining) - 1)
    );
  }

  // Calculează dobânda totală fără plată extra
  function calculateTotalInterest(
    principal: number,
    monthlyPayment: number,
    monthsRemaining: number,
    annualRate: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    let balance = principal;
    let totalInterest = 0;

    for (let m = 0; m < monthsRemaining; m++) {
      const interest = balance * monthlyRate;
      totalInterest += interest;
      const principalPaid = monthlyPayment - interest;
      balance -= principalPaid;
      if (balance <= 0) break;
    }

    return totalInterest;
  }

  // Calculează dobânda totală cu plată extra
  function calculateTotalInterestWithExtra(
    principal: number,
    monthlyPayment: number,
    extraPayment: number,
    monthsRemaining: number,
    annualRate: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    let balance = principal;
    let totalInterest = 0;

    for (let m = 0; m < monthsRemaining; m++) {
      const interest = balance * monthlyRate;
      totalInterest += interest;
      const principalPaid = monthlyPayment + extraPayment - interest;
      balance -= principalPaid;
      if (balance <= 0) break;
    }

    return totalInterest;
  }

  // Calculează plățile lună de lună cu plată extra
  function calculateMonthlyPayments(
    principal: number,
    monthlyPayment: number,
    extraPayment: number,
    monthsRemaining: number,
    annualRate: number
  ): MonthlyPaymentDetail[] {
    const monthlyRate = annualRate / 100 / 12;
    let balance = principal;
    const monthlyDetails: MonthlyPaymentDetail[] = [];

    for (let m = 0; m < monthsRemaining; m++) {
      const interest = balance * monthlyRate;
      const principalPaid = monthlyPayment + extraPayment - interest;
      const totalPayment = monthlyPayment + extraPayment;
      
      monthlyDetails.push({
        month: m + 1,
        balance: Math.max(0, balance),
        interest: interest,
        principalPaid: principalPaid,
        extraPayment: extraPayment,
        totalPayment: totalPayment,
      });

      balance -= principalPaid;
      if (balance <= 0) break;
    }

    return monthlyDetails;
  }

  const handleCalculate = () => {
    setError("");
    setResult(null);

    // Validare input - extrage numărul din textul formatat
    const principalNum = parseFloat(extractNumber(principal));
    const monthsRemainingNum = parseInt(monthsRemaining);
    const extraPaymentMonthlyNum = parseFloat(extractNumber(extraPaymentMonthly));

    // Calculează dobânda anuală în funcție de selecții
    let annualRateNum = 0;
    if (interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc")) {
      const baseRate = interestSource === "robor" ? robor3m : ircc;
      const marginNum = parseFloat(bankMargin.replace(",", ".").replace(/\s/g, ""));
      if (baseRate === null || isNaN(marginNum)) {
        setError("Te rog completează marja băncii pentru a calcula dobânda.");
        return;
      }
      annualRateNum = baseRate + marginNum;
    } else {
      annualRateNum = parseFloat(annualRate.replace(",", "."));
    }

    if (
      isNaN(principalNum) ||
      principalNum <= 0 ||
      isNaN(annualRateNum) ||
      annualRateNum <= 0 ||
      annualRateNum > 100 ||
      isNaN(monthsRemainingNum) ||
      monthsRemainingNum <= 0
    ) {
      setError("Te rog completează toate câmpurile obligatorii cu valori valide.");
      return;
    }

    // Dacă nu este introdusă plată extra, folosește valoarea calculată sau 0
    let finalExtraPayment = extraPaymentMonthlyNum;
    if (isNaN(extraPaymentMonthlyNum) || extraPaymentMonthlyNum <= 0) {
      if (useOptimalPayment) {
        finalExtraPayment = calculateOptimalExtraPayment(
          principalNum,
          annualRateNum,
          monthsRemainingNum
        );
      } else {
        setError("Te rog introdu o sumă pentru plată extra lunară sau activează GoBid AI.");
        return;
      }
    }

    try {
      // Calculează rata normală lunară
      const monthlyPayment = calculateMonthlyPayment(
        principalNum,
        annualRateNum,
        monthsRemainingNum
      );

      // Calculează câte luni se reduc pe baza plății extra lunare
      const monthsReduced = calculateMonthsReduced(
        principalNum,
        annualRateNum,
        monthsRemainingNum,
        finalExtraPayment
      );

      // Calculează dobânda totală fără plată extra
      const totalInterestWithoutExtra = calculateTotalInterest(
        principalNum,
        monthlyPayment,
        monthsRemainingNum,
        annualRateNum
      );

      // Calculează dobânda totală cu plată extra
      const totalInterestWithExtra = calculateTotalInterestWithExtra(
        principalNum,
        monthlyPayment,
        finalExtraPayment,
        monthsRemainingNum,
        annualRateNum
      );

      // Calculează dobânda economisită
      const interestSaved = totalInterestWithoutExtra - totalInterestWithExtra;

      // Calculează plățile lună de lună
      const monthlyDetails = calculateMonthlyPayments(
        principalNum,
        monthlyPayment,
        finalExtraPayment,
        monthsRemainingNum,
        annualRateNum
      );

      const calculationResult: CalculationResult = {
        monthlyPayment,
        extraPayment: finalExtraPayment,
        interestSaved,
        monthsReduced,
        monthlyDetails,
      };

      setResult(calculationResult);
      onCalculate({
        currency: currency,
        principal: principalNum,
        annualRate: annualRateNum,
        monthsRemaining: monthsRemainingNum,
        extraPaymentMonthly: finalExtraPayment,
        result: calculationResult,
      });
    } catch (err) {
      setError("A apărut o eroare la calcul. Te rog verifică datele introduse.");
      console.error("Calculation error:", err);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Formatează numărul cu puncte după fiecare 3 cifre (fără Lei)
  const formatNumberWithDots = (value: string): string => {
    // Elimină toate caracterele care nu sunt cifre sau puncte
    const numbersOnly = value.replace(/[^\d.]/g, "");
    
    if (!numbersOnly) return "";
    
    // Elimină punctele existente pentru a re-formata corect
    const cleanNumber = numbersOnly.replace(/\./g, "");
    
    // Adaugă puncte după fiecare 3 cifre de la dreapta la stânga
    const formatted = cleanNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
    return formatted;
  };

  // Extrage numărul din textul formatat
  const extractNumber = (value: string): string => {
    return value.replace(/\D/g, "");
  };

  // Funcție pentru încărcarea rate-urilor (reutilizabilă)
  const fetchRates = async (forceRefresh = false) => {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const url = forceRefresh ? '/api/rates?refresh=true' : '/api/rates';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid response format: ${text.substring(0, 100)}`);
      }

      const data = await response.json();
      
      console.log('BNR Rates API Response:', data);
      
      if (data.error) {
        setRatesError(data.error);
      } else {
        setRobor3m(data.robor3m);
        setIrcc(data.ircc);
        setRatesLastUpdated(data.lastUpdated);
        console.log('BNR Rates loaded:', { robor3m: data.robor3m, ircc: data.ircc });
      }
    } catch (error) {
      console.error('Error fetching BNR rates:', error);
      setRatesError('Nu s-au putut încărca rate-urile BNR');
    } finally {
      setRatesLoading(false);
    }
  };

  // Încarcă rate-urile BNR la mount
  useEffect(() => {
    fetchRates(false);
  }, []);

  // Calculează dobânda totală în funcție de selecții
  useEffect(() => {
    if (interestType === 'variabila' && interestSource !== 'custom') {
      let baseRate = 0;
      if (interestSource === 'robor' && robor3m !== null) {
        baseRate = robor3m;
      } else if (interestSource === 'ircc' && ircc !== null) {
        baseRate = ircc;
      }

      const marginNum = parseFloat(bankMargin.replace(",", ".").replace(/\s/g, ""));
      if (!isNaN(marginNum) && baseRate > 0) {
        const totalRate = baseRate + marginNum;
        setAnnualRate(totalRate.toFixed(2));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestType, interestSource, robor3m, ircc, bankMargin]);

  // Calculează automat suma optimă când checkbox-ul este activat
  useEffect(() => {
    if (useOptimalPayment) {
      const principalNum = parseFloat(extractNumber(principal));
      const annualRateNum = parseFloat(annualRate.replace(",", "."));
      const monthsRemainingNum = parseInt(monthsRemaining);

      if (
        !isNaN(principalNum) &&
        principalNum > 0 &&
        !isNaN(annualRateNum) &&
        annualRateNum > 0 &&
        annualRateNum <= 100 &&
        !isNaN(monthsRemainingNum) &&
        monthsRemainingNum > 0
      ) {
        const optimalAmount = calculateOptimalExtraPayment(
          principalNum,
          annualRateNum,
          monthsRemainingNum
        );
        setExtraPaymentMonthly(formatNumberWithDots(optimalAmount.toString()));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useOptimalPayment, principal, annualRate, monthsRemaining]);

  return (
    <div
      className={`w-full backdrop-blur-xl ${
        isDarkMode
          ? "bg-white/5 text-white border border-white/10"
          : "bg-white/80 text-gray-900 border border-white/20"
      } rounded-3xl shadow-2xl p-6 md:p-8 transition-all duration-300 hover:shadow-3xl`}
      style={{
        boxShadow: isDarkMode 
          ? '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)' 
          : '0 20px 60px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5)'
      }}
    >
      <div className="mb-8">
        <div className={`flex items-center gap-4 p-4 rounded-xl ${
          isDarkMode 
            ? 'bg-gradient-to-r from-blue-900/30 via-blue-900/30 to-blue-900/30 border border-blue-700/30' 
            : 'bg-gradient-to-r from-blue-50 via-blue-50 to-blue-50 border border-blue-200'
        }`}>
          <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
            isDarkMode 
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30' 
              : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20'
          }`}>
            <CalculatorIcon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className={`text-2xl md:text-3xl font-bold bg-gradient-to-r ${
              isDarkMode
                ? 'from-blue-400 via-blue-300 to-blue-400 bg-clip-text text-transparent'
                : 'from-blue-600 via-blue-600 to-blue-600 bg-clip-text text-transparent'
            }`}>
              Calculator Inteligent
            </h2>
            <p className={`text-sm md:text-base font-medium mt-0.5 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Credit Ipotecar
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Selector Monedă */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <CurrencyDollarIcon className="w-5 h-5 inline mr-2" />
            Monedă
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setCurrency("RON");
                setPrincipal("");
                setExtraPaymentMonthly("");
                setResult(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${
                currency === "RON"
                  ? "bg-gradient-to-r from-blue-600 to-blue-600 text-white border-2 border-blue-600 shadow-lg transform scale-105"
                  : isDarkMode
                  ? "bg-white/10 backdrop-blur-sm text-gray-300 border-2 border-white/20 hover:border-white/30 hover:bg-white/15"
                  : "bg-white/80 backdrop-blur-sm text-gray-700 border-2 border-gray-300/50 hover:border-blue-300 hover:bg-white"
              }`}
            >
              Lei
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrency("EUR");
                setPrincipal("");
                setExtraPaymentMonthly("");
                setResult(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${
                currency === "EUR"
                  ? "bg-gradient-to-r from-blue-600 to-blue-600 text-white border-2 border-blue-600 shadow-lg transform scale-105"
                  : isDarkMode
                  ? "bg-white/10 backdrop-blur-sm text-gray-300 border-2 border-white/20 hover:border-white/30 hover:bg-white/15"
                  : "bg-white/80 backdrop-blur-sm text-gray-700 border-2 border-gray-300/50 hover:border-blue-300 hover:bg-white"
              }`}
            >
              EUR
            </button>
          </div>
        </div>

        {/* Indicatori BNR Live */}
        <div
          className={`p-5 rounded-xl backdrop-blur-sm border-2 shadow-lg ${
            isDarkMode
              ? "bg-gradient-to-r from-blue-500/20 to-blue-500/20 border-blue-500/30"
              : "bg-gradient-to-r from-blue-50 to-blue-50 border-blue-300/50"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}>
              Indicatori BNR Live
            </h3>
            <div className="flex items-center gap-2">
              {ratesLoading && (
                <span className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Se încarcă...
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchRates(true)}
                disabled={ratesLoading}
                className={`p-1.5 rounded-lg transition ${
                  ratesLoading
                    ? "opacity-50 cursor-not-allowed"
                    : isDarkMode
                    ? "hover:bg-gray-600 text-gray-300"
                    : "hover:bg-blue-100 text-blue-600"
                }`}
                title="Actualizează rate-urile BNR"
              >
                <ArrowPathIcon className={`w-4 h-4 ${ratesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"} mb-1`}>
                ROBOR 3M
              </div>
              <div className={`text-lg font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
                {robor3m !== null ? `${robor3m.toFixed(2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"} mb-1`}>
                IRCC
              </div>
              <div className={`text-lg font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
                {ircc !== null ? `${ircc.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
          {ratesError && (
            <div className="mt-2 text-xs text-red-500">{ratesError}</div>
          )}
          {ratesLastUpdated && (
            <div className={`mt-2 flex items-center justify-between text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
              <span>Actualizat: {new Date(ratesLastUpdated).toLocaleString("ro-RO")}</span>
              <span className={`${isDarkMode ? "text-gray-600" : "text-gray-300"}`}>
                • Auto-refresh la 24h
              </span>
            </div>
          )}
        </div>

        {/* Tip Dobândă */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <ChartBarIcon className="w-5 h-5 inline mr-2" />
            Tip Dobândă
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setInterestType("variabila");
                setInterestSource("custom");
                setAnnualRate("");
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${
                interestType === "variabila"
                  ? "bg-gradient-to-r from-blue-600 to-blue-600 text-white border-2 border-blue-600 shadow-lg transform scale-105"
                  : isDarkMode
                  ? "bg-white/10 backdrop-blur-sm text-gray-300 border-2 border-white/20 hover:border-white/30 hover:bg-white/15"
                  : "bg-white/80 backdrop-blur-sm text-gray-700 border-2 border-gray-300/50 hover:border-blue-300 hover:bg-white"
              }`}
            >
              Variabilă
            </button>
            <button
              type="button"
              onClick={() => {
                setInterestType("fixa");
                setInterestSource("custom");
                setBankMargin("");
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${
                interestType === "fixa"
                  ? "bg-gradient-to-r from-blue-600 to-blue-600 text-white border-2 border-blue-600 shadow-lg transform scale-105"
                  : isDarkMode
                  ? "bg-white/10 backdrop-blur-sm text-gray-300 border-2 border-white/20 hover:border-white/30 hover:bg-white/15"
                  : "bg-white/80 backdrop-blur-sm text-gray-700 border-2 border-gray-300/50 hover:border-blue-300 hover:bg-white"
              }`}
            >
              Fixă
            </button>
          </div>
        </div>

        {/* Sursă Dobândă (doar pentru variabilă) */}
        {interestType === "variabila" && (
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              <ChartBarIcon className="w-5 h-5 inline mr-2" />
              Baza Dobânzii
            </label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInterestSource("robor")}
                  disabled={robor3m === null}
                  className={`flex-1 px-3 py-2.5 rounded-xl border-2 font-medium transition-all duration-200 shadow-sm text-sm ${
                    interestSource === "robor"
                      ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-600 shadow-lg transform scale-105"
                      : isDarkMode
                      ? "bg-white/10 backdrop-blur-sm text-gray-300 border-white/20 hover:border-white/30 hover:bg-white/15 disabled:opacity-50"
                      : "bg-white/80 backdrop-blur-sm text-gray-700 border-gray-300/50 hover:border-green-300 hover:bg-white disabled:opacity-50"
                  }`}
                >
                  ROBOR 3M {robor3m !== null && `(${robor3m.toFixed(2)}%)`}
                </button>
                <button
                  type="button"
                  onClick={() => setInterestSource("ircc")}
                  disabled={ircc === null}
                  className={`flex-1 px-3 py-2.5 rounded-xl border-2 font-medium transition-all duration-200 shadow-sm text-sm ${
                    interestSource === "ircc"
                      ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-600 shadow-lg transform scale-105"
                      : isDarkMode
                      ? "bg-white/10 backdrop-blur-sm text-gray-300 border-white/20 hover:border-white/30 hover:bg-white/15 disabled:opacity-50"
                      : "bg-white/80 backdrop-blur-sm text-gray-700 border-gray-300/50 hover:border-green-300 hover:bg-white disabled:opacity-50"
                  }`}
                >
                  IRCC {ircc !== null && `(${ircc.toFixed(2)}%)`}
                </button>
                <button
                  type="button"
                  onClick={() => setInterestSource("custom")}
                  className={`flex-1 px-3 py-2.5 rounded-xl border-2 font-medium transition-all duration-200 shadow-sm text-sm ${
                    interestSource === "custom"
                      ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-600 shadow-lg transform scale-105"
                      : isDarkMode
                      ? "bg-white/10 backdrop-blur-sm text-gray-300 border-white/20 hover:border-white/30 hover:bg-white/15"
                      : "bg-white/80 backdrop-blur-sm text-gray-700 border-gray-300/50 hover:border-green-300 hover:bg-white"
                  }`}
                >
                  Custom
                </button>
              </div>
              
              {/* Marja băncii (doar pentru ROBOR sau IRCC) */}
              {(interestSource === "robor" || interestSource === "ircc") && (
                <div>
                  <label
                    className={`block text-xs font-medium mb-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Marja băncii (%)
                  </label>
                  <input
                    type="text"
                    value={bankMargin}
                    onChange={(e) => {
                      const formatted = formatNumberWithDots(e.target.value);
                      setBankMargin(formatted);
                    }}
                    placeholder="Ex: 2.5"
                    className={`w-full px-4 py-2.5 rounded-xl border backdrop-blur-sm transition-all ${
                      isDarkMode
                        ? "bg-white/10 border-white/20 text-white placeholder-gray-400 focus:border-green-500/50 focus:ring-2 focus:ring-green-500/30"
                        : "bg-white/80 border-gray-300/50 text-gray-900 placeholder-gray-500 focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                    } focus:outline-none shadow-sm`}
                  />
                  <p className={`mt-1 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                    Dobânda totală: {(() => {
                      const baseRate = interestSource === "robor" ? robor3m : ircc;
                      const marginNum = parseFloat(bankMargin.replace(",", ".").replace(/\s/g, ""));
                      if (baseRate !== null && !isNaN(marginNum)) {
                        return `${(baseRate + marginNum).toFixed(2)}%`;
                      }
                      return "—";
                    })()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Principal */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <CurrencyDollarIcon className="w-5 h-5 inline mr-2" />
            Suma rămasă de plată (Principal)
          </label>
          <div className="relative">
            <input
              type="text"
              value={principal}
              onChange={(e) => {
                const formatted = formatNumberWithDots(e.target.value);
                setPrincipal(formatted);
              }}
              onBlur={(e) => {
                // Asigură-te că formatarea este aplicată și când utilizatorul iese din câmp
                const formatted = formatNumberWithDots(e.target.value);
                setPrincipal(formatted);
              }}
              placeholder="Ex: 200.000"
              className={`w-full px-4 py-3 pr-16 rounded-xl border backdrop-blur-sm transition-all ${
                isDarkMode
                  ? "bg-white/10 border-white/20 text-white placeholder-gray-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/30"
                  : "bg-white/80 border-gray-300/50 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              } focus:outline-none shadow-sm`}
            />
            <span
              className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              } font-medium`}
            >
              {currency}
            </span>
          </div>
        </div>

        {/* Dobândă anuală */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <ChartBarIcon className="w-5 h-5 inline mr-2" />
            Dobândă anuală (%)
            {interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc") && (
              <span className={`ml-2 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                (calculată automat)
              </span>
            )}
          </label>
          <input
            type="text"
            value={annualRate}
            onChange={(e) => {
              if (interestType === "fixa" || interestSource === "custom") {
                setAnnualRate(e.target.value);
              }
            }}
            readOnly={interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc")}
            placeholder={
              interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc")
                ? "Se calculează automat"
                : "Ex: 5.5"
            }
            className={`w-full px-4 py-3 rounded-xl border backdrop-blur-sm transition-all ${
              interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc")
                ? isDarkMode
                  ? "bg-white/5 border-white/10 text-gray-400 cursor-not-allowed"
                  : "bg-gray-100/80 border-gray-300/50 text-gray-500 cursor-not-allowed"
                : isDarkMode
                ? "bg-white/10 border-white/20 text-white placeholder-gray-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/30"
                : "bg-white/80 border-gray-300/50 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            } focus:outline-none shadow-sm`}
          />
          {interestType === "variabila" && (interestSource === "robor" || interestSource === "ircc") && (
            <p className={`mt-1 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
              {(() => {
                const baseRate = interestSource === "robor" ? robor3m : ircc;
                const marginNum = parseFloat(bankMargin.replace(",", ".").replace(/\s/g, ""));
                if (baseRate !== null && !isNaN(marginNum)) {
                  return `Dobândă = ${baseRate.toFixed(2)}% (${interestSource.toUpperCase()}) + ${marginNum.toFixed(2)}% (marja) = ${(baseRate + marginNum).toFixed(2)}%`;
                }
                return "Completează marja băncii pentru a calcula dobânda";
              })()}
            </p>
          )}
        </div>

        {/* Luni rămase */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <CalendarIcon className="w-5 h-5 inline mr-2" />
            Număr luni rămase
          </label>
          <input
            type="text"
            value={monthsRemaining}
            onChange={(e) => setMonthsRemaining(e.target.value)}
            placeholder="Ex: 240"
            className={`w-full px-4 py-3 rounded-xl border backdrop-blur-sm transition-all ${
              isDarkMode
                ? "bg-white/10 border-white/20 text-white placeholder-gray-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/30"
                : "bg-white/80 border-gray-300/50 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            } focus:outline-none shadow-sm`}
          />
        </div>

        {/* Plată extra lunară */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <CurrencyDollarIcon className="w-5 h-5 inline mr-2" />
            Cât vrei să dai adițional lunar?
          </label>
          <div className="relative">
            <input
              type="text"
              value={extraPaymentMonthly}
              onChange={(e) => {
                const formatted = formatNumberWithDots(e.target.value);
                setExtraPaymentMonthly(formatted);
              }}
              onBlur={(e) => {
                // Asigură-te că formatarea este aplicată și când utilizatorul iese din câmp
                const formatted = formatNumberWithDots(e.target.value);
                setExtraPaymentMonthly(formatted);
              }}
              placeholder="Ex: 500"
              className={`w-full px-4 py-3 pr-16 rounded-lg border ${
                isDarkMode
                  ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
              } focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
            />
            <span
              className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              } font-medium`}
            >
              {currency}
            </span>
          </div>
          
          {/* Checkbox GoBid AI */}
          <div className="mt-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={useOptimalPayment}
                onChange={(e) => {
                  setUseOptimalPayment(e.target.checked);
                  if (e.target.checked) {
                    // Când se activează, calculează automat suma optimă
                    const principalNum = parseFloat(extractNumber(principal));
                    const annualRateNum = parseFloat(annualRate.replace(",", "."));
                    const monthsRemainingNum = parseInt(monthsRemaining);
                    
                    if (
                      !isNaN(principalNum) &&
                      principalNum > 0 &&
                      !isNaN(annualRateNum) &&
                      annualRateNum > 0 &&
                      annualRateNum <= 100 &&
                      !isNaN(monthsRemainingNum) &&
                      monthsRemainingNum > 0
                    ) {
                      const optimalAmount = calculateOptimalExtraPayment(
                        principalNum,
                        annualRateNum,
                        monthsRemainingNum
                      );
                      setExtraPaymentMonthly(formatNumberWithDots(optimalAmount.toString()));
                    }
                  }
                }}
                className="w-5 h-5 rounded border-2 border-blue-500 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer transition"
              />
              <div className="flex items-center gap-2">
                <SparklesIcon className={`w-5 h-5 ${useOptimalPayment ? 'text-blue-500' : isDarkMode ? 'text-gray-500' : 'text-gray-400'} transition-colors`} />
                <span className={`font-medium ${useOptimalPayment ? 'text-blue-600' : isDarkMode ? 'text-gray-300' : 'text-gray-700'} transition-colors`}>
                  GoBid AI - Cea mai favorabilă variantă
                </span>
              </div>
            </label>
            <p className={`mt-1 ml-8 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
              {useOptimalPayment 
                ? "AI-ul calculează automat suma optimă pentru a maximiza economiile (25% din rata lunară)"
                : "Calculatorul va calcula automat câte luni se reduc și cât economisești"}
            </p>
          </div>
        </div>

        {/* Buton Calculare */}
        <button
          onClick={handleCalculate}
          className="w-full bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            <CalculatorIcon className="w-5 h-5" />
            Calculează
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
        </button>

        {/* Eroare */}
        {error && (
          <div className="bg-gradient-to-r from-red-500/20 to-pink-500/20 backdrop-blur-sm border-2 border-red-500/30 text-red-400 px-4 py-3 rounded-xl shadow-lg">
            {error}
          </div>
        )}

        {/* Rezultate */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Rezumat */}
            <div
              className={`p-6 rounded-lg border-2 ${
                isDarkMode
                  ? "bg-gray-700/50 border-blue-500"
                  : "bg-blue-50 border-blue-500"
              }`}
            >
              <h3 className="text-xl font-bold mb-4">Rezultate Calcul</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                    Rata normală lunară:
                  </span>
                  <span className="text-lg font-semibold text-blue-600">
                    {formatCurrency(result.monthlyPayment)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                    Suma extra necesară:
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    {formatCurrency(result.extraPayment)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                    Dobânda economisită:
                  </span>
                  <span className="text-lg font-semibold text-green-600">
                    {formatCurrency(result.interestSaved)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
                    Luni reduse:
                  </span>
                  <span className="text-lg font-semibold text-blue-600">
                    {result.monthsReduced} luni
                  </span>
                </div>
              </div>
            </div>

            {/* Tabel plăți lună de lună */}
            {result.monthlyDetails && result.monthlyDetails.length > 0 && (
              <div
                className={`p-6 rounded-lg border-2 ${
                  isDarkMode
                    ? "bg-gray-700/50 border-green-500"
                    : "bg-green-50 border-green-500"
                }`}
              >
                <h3 className="text-xl font-bold mb-4">Plăți Lună de Lună</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className={`border-b ${
                          isDarkMode ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        <th
                          className={`text-left py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Luna
                        </th>
                        <th
                          className={`text-right py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Sold Rămas
                        </th>
                        <th
                          className={`text-right py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Dobândă
                        </th>
                        <th
                          className={`text-right py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Principal
                        </th>
                        <th
                          className={`text-right py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Plată Extra
                        </th>
                        <th
                          className={`text-right py-3 px-2 font-semibold ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Total de Plată
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.monthlyDetails.map((detail, index) => (
                        <tr
                          key={index}
                          className={`border-b ${
                            isDarkMode
                              ? "border-gray-600 hover:bg-gray-700"
                              : "border-gray-200 hover:bg-green-100"
                          } transition-colors`}
                        >
                          <td
                            className={`py-3 px-2 ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {detail.month}
                          </td>
                          <td
                            className={`text-right py-3 px-2 ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {formatCurrency(detail.balance)}
                          </td>
                          <td
                            className={`text-right py-3 px-2 ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {formatCurrency(detail.interest)}
                          </td>
                          <td
                            className={`text-right py-3 px-2 ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }`}
                          >
                            {formatCurrency(detail.principalPaid)}
                          </td>
                          <td
                            className={`text-right py-3 px-2 font-semibold text-green-600`}
                          >
                            {formatCurrency(detail.extraPayment)}
                          </td>
                          <td
                            className={`text-right py-3 px-2 font-bold ${
                              isDarkMode ? "text-green-400" : "text-green-700"
                            }`}
                          >
                            {formatCurrency(detail.totalPayment)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 text-xs text-gray-500 italic">
                  * Soldul rămas este calculat după fiecare plată
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
