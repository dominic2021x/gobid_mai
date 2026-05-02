"use client";

import { useState, useEffect, useRef } from "react";

interface ModernDatePickerProps {
  value: string;
  onChange: (date: string) => void;
  maxDate?: string;
  minDate?: string;
  isDarkMode?: boolean;
  placeholder?: string;
  required?: boolean;
}

export default function ModernDatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  isDarkMode = false,
  placeholder = "Selectează data",
  required = false
}: ModernDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    value ? new Date(value) : null
  );
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const dayNames = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

  useEffect(() => {
    if (value) {
      setSelectedDate(new Date(value));
      setCurrentMonth(new Date(value));
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowYearPicker(false);
        setShowMonthPicker(false);
      }
    };

    if (isOpen || showYearPicker || showMonthPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, showYearPicker, showMonthPicker]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0

    const days: (Date | null)[] = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isDateDisabled = (date: Date): boolean => {
    if (maxDate) {
      const max = new Date(maxDate);
      max.setHours(23, 59, 59, 999);
      if (date > max) return true;
    }
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      if (date < min) return true;
    }
    return false;
  };

  const isToday = (date: Date | null): boolean => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const isSelected = (date: Date | null): boolean => {
    if (!date || !selectedDate) return false;
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear();
  };

  const handleDateSelect = (date: Date) => {
    if (isDateDisabled(date)) return;
    setSelectedDate(date);
    onChange(formatDate(date));
    setIsOpen(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleYearSelect = (year: number) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setFullYear(year);
      return newDate;
    });
    setShowYearPicker(false);
  };

  const handleMonthSelect = (month: number) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(month);
      return newDate;
    });
    setShowMonthPicker(false);
  };

  const getYearRange = () => {
    const currentYear = new Date().getFullYear();
    const minYear = maxDate ? new Date(maxDate).getFullYear() - 100 : currentYear - 100;
    const maxYear = maxDate ? new Date(maxDate).getFullYear() : currentYear;
    const years: number[] = [];
    for (let year = maxYear; year >= minYear; year--) {
      years.push(year);
    }
    return years;
  };

  const days = getDaysInMonth(currentMonth);

  const displayValue = selectedDate 
    ? `${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
    : '';

  return (
    <div className="relative" ref={calendarRef}>
      {/* Input Field */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 text-left ${
          isDarkMode 
            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 hover:border-gray-500 focus:border-blue-500' 
            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-gray-400 focus:border-blue-500'
        } ${isOpen ? 'ring-2 ring-blue-500' : 'focus:ring-2 focus:ring-blue-500'}`}
      >
        <div className="flex items-center justify-between">
          <span className={displayValue ? '' : isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
            {displayValue || placeholder}
          </span>
          <svg 
            className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} ${
              isDarkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className={`absolute z-50 mt-2 rounded-xl shadow-2xl border backdrop-blur-lg transition-all duration-300 ${
          isDarkMode 
            ? 'bg-white/10 border-white/20' 
            : 'bg-white border-gray-200'
        }`}>
          {/* Calendar Header */}
          <div className={`p-4 border-b ${isDarkMode ? 'border-white/20' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => navigateMonth('prev')}
                className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                  isDarkMode
                    ? 'text-white hover:bg-white/20'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div className="flex items-center gap-2">
                {/* Month Selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMonthPicker(!showMonthPicker);
                      setShowYearPicker(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 hover:scale-105 ${
                      isDarkMode
                        ? 'text-white hover:bg-white/20'
                        : 'text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {monthNames[currentMonth.getMonth()]}
                  </button>
                  
                  {showMonthPicker && (
                    <div className={`absolute top-full left-0 mt-2 w-40 rounded-lg shadow-2xl border backdrop-blur-lg z-50 max-h-64 overflow-y-auto ${
                      isDarkMode 
                        ? 'bg-white/10 border-white/20' 
                        : 'bg-white border-gray-200'
                    }`}>
                      <div className="p-2 grid grid-cols-3 gap-1">
                        {monthNames.map((month, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleMonthSelect(index)}
                            className={`px-2 py-1.5 text-xs rounded-lg transition-all duration-200 ${
                              currentMonth.getMonth() === index
                                ? isDarkMode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-600 text-white'
                                : isDarkMode
                                  ? 'text-white hover:bg-white/20'
                                  : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {month.substring(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Year Selector */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowYearPicker(!showYearPicker);
                      setShowMonthPicker(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 hover:scale-105 ${
                      isDarkMode
                        ? 'text-white hover:bg-white/20'
                        : 'text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {currentMonth.getFullYear()}
                  </button>
                  
                  {showYearPicker && (
                    <div className={`absolute top-full left-0 mt-2 w-32 rounded-lg shadow-2xl border backdrop-blur-lg z-50 max-h-64 overflow-y-auto ${
                      isDarkMode 
                        ? 'bg-white/10 border-white/20' 
                        : 'bg-white border-gray-200'
                    }`}>
                      <div className="p-2">
                        {getYearRange().map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={() => handleYearSelect(year)}
                            className={`w-full px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                              currentMonth.getFullYear() === year
                                ? isDarkMode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-600 text-white'
                                : isDarkMode
                                  ? 'text-white hover:bg-white/20'
                                  : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => navigateMonth('next')}
                className={`p-2 rounded-lg transition-all duration-200 hover:scale-110 ${
                  isDarkMode
                    ? 'text-white hover:bg-white/20'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day Names */}
            <div className="grid grid-cols-7 gap-1">
              {dayNames.map((day, index) => (
                <div
                  key={index}
                  className={`text-center text-xs font-semibold py-2 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Calendar Days */}
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                if (!date) {
                  return <div key={index} className="aspect-square" />;
                }

                const disabled = isDateDisabled(date);
                const isTodayDate = isToday(date);
                const isSelectedDate = isSelected(date);

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleDateSelect(date)}
                    disabled={disabled}
                    className={`aspect-square rounded-lg text-sm font-medium transition-all duration-200 ${
                      disabled
                        ? isDarkMode
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-300 cursor-not-allowed'
                        : isSelectedDate
                          ? 'bg-gradient-to-r from-blue-600 to-blue-600 text-white shadow-lg scale-110'
                          : isTodayDate
                            ? isDarkMode
                              ? 'bg-blue-500/30 text-blue-300 border-2 border-blue-500'
                              : 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                            : isDarkMode
                              ? 'text-white hover:bg-white/20 hover:scale-105'
                              : 'text-gray-700 hover:bg-gray-100 hover:scale-105'
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className={`p-3 border-t ${isDarkMode ? 'border-white/20' : 'border-gray-200'}`}>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                if (!isDateDisabled(today)) {
                  handleDateSelect(today);
                }
              }}
              className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                isDarkMode
                  ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Astăzi
            </button>
          </div>
        </div>
      )}

      {/* Hidden input for form submission */}
      <input
        type="hidden"
        value={value}
        required={required}
      />
    </div>
  );
}
