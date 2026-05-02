"use client";

import { useEffect, useRef, useState, useMemo } from 'react';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: { name: string; coordinates: { lat: number; lng: number } | null }) => void;
  placeholder?: string;
  isDarkMode?: boolean;
  suggestions?: string[];
}

export default function LocationAutocomplete({ 
  value, 
  onChange, 
  onPlaceSelect,
  placeholder = "Caută locație...",
  isDarkMode = false,
  suggestions = []
}: LocationAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [googlePredictions, setGooglePredictions] = useState<any[]>([]);

  // Update refs when callbacks change
  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onChange, onPlaceSelect]);

  // Load Google Maps API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google && window.google.maps && window.google.maps.places) {
      setIsLoaded(true);
      return;
    }

    const savedModules = localStorage.getItem('admin_modules');
    let apiKey = '';
    
    if (savedModules) {
      try {
        const modules = JSON.parse(savedModules);
        const googleMapsModule = modules.find((m: any) => m.id === 'google-maps');
        if (googleMapsModule?.config?.apiKey && googleMapsModule?.enabled) {
          apiKey = googleMapsModule.config.apiKey;
        }
      } catch (e) {
        console.error('Error loading Google Maps config:', e);
      }
    }

    if (!apiKey) {
      apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    if (!apiKey) return;

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps="true"]');

    if (existingScript) {
      if (window.google && window.google.maps && window.google.maps.places) {
        setIsLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setIsLoaded(true), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-maps', 'true');
    script.onload = () => {
      setIsLoaded(true);
    };
    
    document.head.appendChild(script);
  }, []);

  // Initialize AutocompleteService and PlacesService when loaded
  useEffect(() => {
    if (isLoaded && window.google?.maps?.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }
  }, [isLoaded]);

  // Memoize suggestions to prevent unnecessary re-renders
  const memoizedSuggestions = useMemo(() => suggestions, [suggestions.join(',')]);

  // Handle input change and get predictions from both sources
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    onChange(query);
    
    if (query.length < 2) {
      setFilteredSuggestions([]);
      setGooglePredictions([]);
      setShowSuggestions(false);
      return;
    }
    
    // Filter local suggestions
    if (memoizedSuggestions.length > 0) {
      const filtered = memoizedSuggestions.filter(s => 
        s.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 3);
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions([]);
    }
    
    // Get Google Places predictions
    if (isLoaded && autocompleteServiceRef.current && window.google?.maps?.places) {
      const request = {
        input: query,
        componentRestrictions: { country: 'ro' },
        types: ['(regions)']
      };
      
      autocompleteServiceRef.current.getPlacePredictions(request, (predictions: any[], status: string) => {
        if (status === (window.google.maps.places as any)?.PlacesServiceStatus?.OK && predictions) {
          setGooglePredictions(predictions.slice(0, 5));
          setShowSuggestions(true);
        } else {
          setGooglePredictions([]);
          if (filteredSuggestions.length === 0) {
            setShowSuggestions(false);
          }
        }
      });
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setGooglePredictions([]);
  };
  
  const handleGooglePredictionClick = (prediction: any) => {
    if (!placesServiceRef.current) return;
    
    // Get place details
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['formatted_address', 'geometry', 'name'] },
      (place: any, status: string) => {
        if (status === (window.google.maps.places as any)?.PlacesServiceStatus?.OK && place) {
          const placeName = place.name || place.formatted_address;
          onChange(placeName);
          setShowSuggestions(false);
          setGooglePredictions([]);
          
          if (onPlaceSelectRef.current) {
            const coordinates = place.geometry?.location ? {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            } : null;
            
            onPlaceSelectRef.current({
              name: placeName,
              coordinates
            });
          }
        }
      }
    );
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (filteredSuggestions.length > 0 || googlePredictions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => setShowSuggestions(false), 200);
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          isDarkMode 
            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
        }`}
      />
      {showSuggestions && (filteredSuggestions.length > 0 || googlePredictions.length > 0) && (
        <div className={`absolute z-50 w-full mt-1 rounded-lg border shadow-lg max-h-48 overflow-y-auto ${
          isDarkMode 
            ? 'bg-gray-700 border-gray-600' 
            : 'bg-white border-gray-300'
        }`}>
          {/* Local suggestions */}
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={`local-${index}`}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={`w-full text-left px-3 py-2 hover:bg-blue-600 hover:text-white transition-colors flex items-start gap-2 ${
                isDarkMode 
                  ? 'text-gray-300 hover:bg-blue-600' 
                  : 'text-gray-900'
              }`}
            >
              <span className="text-gray-400 mt-1">📍</span>
              <div className="font-medium">{suggestion}</div>
            </button>
          ))}
          {/* Google Places predictions */}
          {googlePredictions.map((prediction, index) => (
            <button
              key={prediction.place_id || `google-${index}`}
              type="button"
              onClick={() => handleGooglePredictionClick(prediction)}
              className={`w-full text-left px-3 py-2 hover:bg-blue-600 hover:text-white transition-colors flex items-start gap-2 ${
                isDarkMode 
                  ? 'text-gray-300 hover:bg-blue-600' 
                  : 'text-gray-900'
              }`}
            >
              <span className="text-gray-400 mt-1">📍</span>
              <div>
                <div className="font-medium">{prediction.structured_formatting?.main_text || prediction.description}</div>
                {prediction.structured_formatting?.secondary_text && (
                  <div className="text-sm opacity-75">{prediction.structured_formatting.secondary_text}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}




