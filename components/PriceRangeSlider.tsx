"use client";

import { useState, useEffect, useRef } from 'react';

interface PriceRangeSliderProps {
  min: number;
  max: number;
  value: { min: number; max: number };
  onChange: (value: { min: number; max: number }) => void;
  isDarkMode?: boolean;
  currency?: 'RON' | 'EUR';
}

// Function to get step based on value
const getStep = (value: number): number => {
  if (value < 20) return 1;
  if (value < 50) return 5;
  if (value < 200) return 10;
  if (value < 500) return 20;
  if (value < 2000) return 50;
  if (value < 5000) return 100;
  if (value < 10000) return 500;
  if (value < 100000) return 1000;
  return 5000;
};

// Function to snap value to nearest step
const snapToStep = (value: number): number => {
  const step = getStep(value);
  return Math.round(value / step) * step;
};

export default function PriceRangeSlider({ min, max, value, onChange, isDarkMode = false, currency = 'RON' }: PriceRangeSliderProps) {
  const [minVal, setMinVal] = useState(value.min);
  const [maxVal, setMaxVal] = useState(value.max);
  const minValRef = useRef<HTMLInputElement>(null);
  const maxValRef = useRef<HTMLInputElement>(null);
  const range = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync with external value changes (only when not from internal change)
  useEffect(() => {
    if (!isInternalChange.current) {
      setMinVal(value.min);
      setMaxVal(value.max);
    }
    isInternalChange.current = false;
  }, [value.min, value.max]);

  // Convert to percentage
  const getPercent = (val: number) => Math.round(((val - min) / (max - min)) * 100);

  // Set width of the range to decrease from the left side
  useEffect(() => {
    if (maxValRef.current) {
      const minPercent = getPercent(minVal);
      const maxPercent = getPercent(+maxValRef.current.value);

      if (range.current) {
        range.current.style.left = `${minPercent}%`;
        range.current.style.width = `${maxPercent - minPercent}%`;
      }
    }
  }, [minVal, max, min]);

  // Set width of the range to decrease from the right side
  useEffect(() => {
    if (minValRef.current) {
      const minPercent = getPercent(+minValRef.current.value);
      const maxPercent = getPercent(maxVal);

      if (range.current) {
        range.current.style.width = `${maxPercent - minPercent}%`;
      }
    }
  }, [maxVal, max, min]);

  return (
    <div className="price-range-slider relative w-full" style={{ padding: '8px 0' }}>
      <div className="relative" style={{ height: '8px' }}>
        {/* Track background */}
        <div className={`absolute w-full rounded-full ${
          isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
        }`} style={{ height: '8px', top: '50%', transform: 'translateY(-50%)' }}></div>
        {/* Active range */}
        <div
          ref={range}
          className={`absolute rounded-full bg-blue-600`}
          style={{ height: '8px', top: '50%', transform: 'translateY(-50%)' }}
        ></div>
      </div>
      
      {/* Dual range inputs */}
      <input
        type="range"
        min={min}
        max={max}
        value={minVal}
        ref={minValRef}
        onChange={(event) => {
          let val = parseFloat(event.target.value);
          val = snapToStep(val);
          val = Math.min(val, maxVal - 0.01);
          val = Math.max(val, min);
          const newVal = currency === 'EUR' ? Math.round(val * 100) / 100 : Math.round(val);
          isInternalChange.current = true;
          setMinVal(newVal);
          onChange({ min: newVal, max: maxVal });
        }}
        className="absolute w-full bg-transparent appearance-none cursor-pointer z-10"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          height: '8px',
          margin: 0,
          padding: 0,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={maxVal}
        ref={maxValRef}
        onChange={(event) => {
          let val = parseFloat(event.target.value);
          val = snapToStep(val);
          val = Math.max(val, minVal + 0.01);
          val = Math.min(val, max);
          const newVal = currency === 'EUR' ? Math.round(val * 100) / 100 : Math.round(val);
          isInternalChange.current = true;
          setMaxVal(newVal);
          onChange({ min: minVal, max: newVal });
        }}
        className="absolute w-full bg-transparent appearance-none cursor-pointer z-10"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          height: '8px',
          margin: 0,
          padding: 0,
        }}
      />
      
      {/* Custom styles for range inputs */}
      <style dangerouslySetInnerHTML={{__html: `
        .price-range-slider input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
        }
        .price-range-slider input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #6366F1;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          cursor: pointer;
          position: relative;
          z-index: 20;
        }
        .price-range-slider input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #6366F1;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          cursor: pointer;
          position: relative;
          z-index: 20;
        }
        .price-range-slider input[type="range"]::-webkit-slider-runnable-track {
          background: transparent;
          height: 8px;
        }
        .price-range-slider input[type="range"]::-moz-range-track {
          background: transparent;
          height: 8px;
        }
      `}} />
    </div>
  );
}
