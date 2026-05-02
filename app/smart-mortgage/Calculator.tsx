"use client";

import { useState } from "react";
import { CalculatorIcon, CurrencyDollarIcon, CalendarIcon, ChartBarIcon } from "@heroicons/react/24/outline";

interface CalculationResult {
  monthlyPayment: number;
  extraPayment: number;
  interestSaved: number;
  monthsReduced: number;
}

interface CalculatorProps {
  onCalculate: (data: {
    principal: number;
    annualRate: number;
    monthsRemaining: number;
    monthsToReduce: number;
    result: CalculationResult;
  }) => void;
  isDarkMode: boolean;
}

export default function Calculator({ onCalculate, isDarkMode }: CalculatorProps) {
  const [principal, setPrincipal] = useState<string>("");
  const [annualRate, setAnnualRate] = useState<string>("");
  const [monthsRemaining, setMonthsRemaining] = useState<string>("");
  const [monthsToReduce, setMonthsToReduce] = useState<string>("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string>("");

  // Funcția matematică pentru calcularea sumei extra necesare
  function extraPaymentToReduceMonths(
    principal: number,
    annualRate: number,
    monthsRemaining: number,
    monthsToReduce: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    const basePayment =
      (principal * (monthlyRate * Math.pow(1 + monthlyRate, monthsRemaining))) /
      (Math.pow(1 + monthlyRate, monthsRemaining) - 1);
    const targetMonths = monthsRemaining - monthsToReduce;

    let low = 0;
    let high = principal;
    for (let i = 0; i < 40; i++) {
      let mid = (low + high) / 2;
      let balance = principal;

      for (let m = 0; m < targetMonths; m++) {
        const interest = balance * monthlyRate;
        const principalPaid = basePayment + mid - interest;
        balance -= principalPaid;
        if (balance <= 0) break;
      }

      if (balance > 0) low = mid;
      else high = mid;
    }

    return high;
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
    monthsToReduce: number,
    annualRate: number
  ): number {
    const monthlyRate = annualRate / 100 / 12;
    let balance = principal;
    let totalInterest = 0;
    const targetMonths = monthsRemaining - monthsToReduce;

    for (let m = 0; m < targetMonths; m++) {
      const interest = balance * monthlyRate;
      totalInterest += interest;
      const principalPaid = monthlyPayment + extraPayment - interest;
      balance -= principalPaid;
      if (balance <= 0) break;
    }

    return totalInterest;
  }

  const handleCalculate = () => {
    setError("");
    setResult(null);

    // Validare input
    const principalNum = parseFloat(principal.replace(/\s/g, "").replace(",", "."));
    const annualRateNum = parseFloat(annualRate.replace(",", "."));
    const monthsRemainingNum = parseInt(monthsRemaining);
    const monthsToReduceNum = parseInt(monthsToReduce);

    if (
      isNaN(principalNum) ||
      principalNum <= 0 ||
      isNaN(annualRateNum) ||
      annualRateNum <= 0 ||
      annualRateNum > 100 ||
      isNaN(monthsRemainingNum) ||
      monthsRemainingNum <= 0 ||
      isNaN(monthsToReduceNum) ||
      monthsToReduceNum <= 0 ||
      monthsToReduceNum >= monthsRemainingNum
    ) {
      setError("Te rog completează toate câmpurile cu valori valide.");
      return;
    }

    try {
      // Calculează rata normală lunară
      const monthlyPayment = calculateMonthlyPayment(
        principalNum,
        annualRateNum,
        monthsRemainingNum
      );

      // Calculează suma extra necesară
      const extraPayment = extraPaymentToReduceMonths(
        principalNum,
        annualRateNum,
        monthsRemainingNum,
        monthsToReduceNum
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
        extraPayment,
        monthsRemainingNum,
        monthsToReduceNum,
        annualRateNum
      );

      // Calculează dobânda economisită
      const interestSaved = totalInterestWithoutExtra - totalInterestWithExtra;

      const calculationResult: CalculationResult = {
        monthlyPayment,
        extraPayment,
        interestSaved,
        monthsReduced: monthsToReduceNum,
      };

      setResult(calculationResult);
      onCalculate({
        principal: principalNum,
        annualRate: annualRateNum,
        monthsRemaining: monthsRemainingNum,
        monthsToReduce: monthsToReduceNum,
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
      currency: "RON",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div
      className={`w-full ${
        isDarkMode
          ? "bg-gray-800 text-white"
          : "bg-white text-gray-900"
      } rounded-2xl shadow-xl p-6 md:p-8`}
    >
      <div className="flex items-center gap-3 mb-6">
        <CalculatorIcon className="w-8 h-8 text-blue-500" />
        <h2 className="text-2xl font-bold">Calculator Inteligent Credit Ipotecar</h2>
      </div>

      <div className="space-y-6">
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
          <input
            type="text"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="Ex: 200000"
            className={`w-full px-4 py-3 rounded-lg border ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
          />
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
          </label>
          <input
            type="text"
            value={annualRate}
            onChange={(e) => setAnnualRate(e.target.value)}
            placeholder="Ex: 5.5"
            className={`w-full px-4 py-3 rounded-lg border ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
          />
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
            className={`w-full px-4 py-3 rounded-lg border ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
          />
        </div>

        {/* Luni de redus */}
        <div>
          <label
            className={`block text-sm font-medium mb-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <CalendarIcon className="w-5 h-5 inline mr-2" />
            Câte luni vrei să reduci?
          </label>
          <input
            type="text"
            value={monthsToReduce}
            onChange={(e) => setMonthsToReduce(e.target.value)}
            placeholder="Ex: 12"
            className={`w-full px-4 py-3 rounded-lg border ${
              isDarkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            } focus:outline-none focus:ring-2 focus:ring-blue-500 transition`}
          />
        </div>

        {/* Buton Calculare */}
        <button
          onClick={handleCalculate}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
        >
          Calculează
        </button>

        {/* Eroare */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Rezultate */}
        {result && (
          <div
            className={`mt-6 p-6 rounded-lg border-2 ${
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
        )}
      </div>
    </div>
  );
}
