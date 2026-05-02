"use client";

import { useEffect, useRef, useState } from 'react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: { address: string; coordinates: { lat: number; lng: number } | null }) => void;
  placeholder?: string;
  isDarkMode?: boolean;
  selectedCounty?: string | null;
}

// Mapping județ -> nume în română pentru Google Places
const countyToGooglePlace: Record<string, string> = {
  'Alba': 'Alba Iulia, România',
  'Arad': 'Arad, România',
  'Argeș': 'Pitești, România',
  'Bacău': 'Bacău, România',
  'Bihor': 'Oradea, România',
  'Bistrița-Năsăud': 'Bistrița, România',
  'Botoșani': 'Botoșani, România',
  'Brașov': 'Brașov, România',
  'Brăila': 'Brăila, România',
  'București': 'București, România',
  'Buzău': 'Buzău, România',
  'Caraș-Severin': 'Reșița, România',
  'Călărași': 'Călărași, România',
  'Cluj': 'Cluj-Napoca, România',
  'Cluj-Napoca': 'Cluj-Napoca, România',
  'Constanța': 'Constanța, România',
  'Covasna': 'Sfântu Gheorghe, România',
  'Dâmbovița': 'Târgoviște, România',
  'Dolj': 'Craiova, România',
  'Craiova': 'Craiova, România',
  'Galați': 'Galați, România',
  'Giurgiu': 'Giurgiu, România',
  'Gorj': 'Târgu Jiu, România',
  'Harghita': 'Miercurea Ciuc, România',
  'Hunedoara': 'Deva, România',
  'Ialomița': 'Slobozia, România',
  'Iași': 'Iași, România',
  'Ilfov': 'Buftea, România',
  'Maramureș': 'Baia Mare, România',
  'Mehedinți': 'Drobeta-Turnu Severin, România',
  'Mureș': 'Târgu Mureș, România',
  'Neamț': 'Piatra Neamț, România',
  'Olt': 'Slatina, România',
  'Prahova': 'Ploiești, România',
  'Ploiești': 'Ploiești, România',
  'Sălaj': 'Zalău, România',
  'Satu Mare': 'Satu Mare, România',
  'Sibiu': 'Sibiu, România',
  'Suceava': 'Suceava, România',
  'Teleorman': 'Alexandria, România',
  'Timiș': 'Timișoara, România',
  'Timișoara': 'Timișoara, România',
  'Tulcea': 'Tulcea, România',
  'Vâlcea': 'Râmnicu Vâlcea, România',
  'Vaslui': 'Vaslui, România',
  'Vrancea': 'Focșani, România',
};

// Mapping orașe -> județe pentru validare corectă
const cityToCounty: Record<string, string> = {
  'craiova': 'Dolj',
  'cluj-napoca': 'Cluj',
  'cluj napoca': 'Cluj',
  'cluj': 'Cluj',
  'timișoara': 'Timiș',
  'timisoara': 'Timiș',
  'timiș': 'Timiș',
  'bucurești': 'București',
  'bucuresti': 'București',
  'brașov': 'Brașov',
  'brasov': 'Brașov',
  'iași': 'Iași',
  'iasi': 'Iași',
  'constanța': 'Constanța',
  'constanta': 'Constanța',
  'ploiești': 'Prahova',
  'ploiesti': 'Prahova',
  'oradea': 'Bihor',
  'arad': 'Arad',
  'pitesti': 'Argeș',
  'pitești': 'Argeș',
  'bacău': 'Bacău',
  'bacau': 'Bacău',
  'bistrița': 'Bistrița-Năsăud',
  'bistrita': 'Bistrița-Năsăud',
  'botoșani': 'Botoșani',
  'botosani': 'Botoșani',
  'brăila': 'Brăila',
  'braila': 'Brăila',
  'buzău': 'Buzău',
  'buzau': 'Buzău',
  'reșița': 'Caraș-Severin',
  'resita': 'Caraș-Severin',
  'călărași': 'Călărași',
  'calarasi': 'Călărași',
  'sfântu gheorghe': 'Covasna',
  'sfantu gheorghe': 'Covasna',
  'târgoviște': 'Dâmbovița',
  'targoviste': 'Dâmbovița',
  'galați': 'Galați',
  'galati': 'Galați',
  'giurgiu': 'Giurgiu',
  'târgu jiu': 'Gorj',
  'targu jiu': 'Gorj',
  'miercurea ciuc': 'Harghita',
  'deva': 'Hunedoara',
  'slobozia': 'Ialomița',
  'buftea': 'Ilfov',
  'baia mare': 'Maramureș',
  'drobeta-turnu severin': 'Mehedinți',
  'drobeta turnu severin': 'Mehedinți',
  'târgu mureș': 'Mureș',
  'targu mures': 'Mureș',
  'piatra neamț': 'Neamț',
  'piatra neamt': 'Neamț',
  'slatina': 'Olt',
  'zalău': 'Sălaj',
  'zalau': 'Sălaj',
  'satu mare': 'Satu Mare',
  'sibiu': 'Sibiu',
  'suceava': 'Suceava',
  'alexandria': 'Teleorman',
  'tulcea': 'Tulcea',
  'râmnicu vâlcea': 'Vâlcea',
  'ramnicu valcea': 'Vâlcea',
  'vaslui': 'Vaslui',
  'focșani': 'Vrancea',
  'focsani': 'Vrancea',
};

// Get county name variations for matching
const getCountyVariations = (county: string): string[] => {
  const variations: string[] = [county.toLowerCase()];
  if (countyToGooglePlace[county]) {
    const capital = countyToGooglePlace[county].split(',')[0].toLowerCase();
    variations.push(capital);
    // Add common variations
    variations.push(capital.replace('ș', 's').replace('ț', 't').replace('ă', 'a').replace('â', 'a').replace('î', 'i'));
  }
  
  // Add city variations if county has known cities
  for (const [city, cityCounty] of Object.entries(cityToCounty)) {
    if (cityCounty === county) {
      variations.push(city);
    }
  }
  
  return variations;
};

// Get county from city name
const getCountyFromCity = (cityName: string): string | null => {
  const cityLower = cityName.toLowerCase().trim();
  return cityToCounty[cityLower] || null;
};

export default function AddressAutocomplete({ 
  value, 
  onChange, 
  onPlaceSelect,
  placeholder = "Introduceți adresa exactă...",
  isDarkMode = false,
  selectedCounty = null
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

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

  // Get AI suggestions for address completion
  const getAISuggestions = async (query: string, county: string): Promise<string[]> => {
    try {
      const response = await fetch('/api/ai/address-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          county,
          context: `Utilizatorul caută o adresă în ${countyToGooglePlace[county]?.split(',')[0] || county}. Sugerează adrese reale și comune din această zonă.`
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.suggestions || [];
      }
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
    }
    return [];
  };

  // Handle manual input and get filtered predictions
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    onChange(query);
    setMessage(''); // Clear previous messages
    
    if (!isLoaded || !window.google?.maps?.places || !selectedCounty || selectedCounty === 'all') {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }
    
    if (query.length < 2) {
      setPredictions([]);
      setAiSuggestions([]);
      setShowPredictions(false);
      return;
    }
    
    // Get AI suggestions for longer queries
    if (query.length >= 3) {
      const aiSugs = await getAISuggestions(query, selectedCounty);
      setAiSuggestions(aiSugs);
    } else {
      setAiSuggestions([]);
    }
    
    // Get county capital for query
    const countyCapital = countyToGooglePlace[selectedCounty];
    if (!countyCapital) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }
    
    // Use AutocompleteService to get predictions
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    
    // Get AI suggestions first (outside callback)
    let aiSugs: string[] = [];
    if (query.length >= 3) {
      aiSugs = await getAISuggestions(query, selectedCounty);
    }
    
    // Get bounds for county
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: countyCapital }, (results, status) => {
      if (status === 'OK' && results && results[0] && results[0].geometry) {
        let bounds: any = null;
        if (results[0].geometry.viewport) {
          bounds = results[0].geometry.viewport;
        } else if (results[0].geometry.bounds) {
          bounds = results[0].geometry.bounds;
        } else if (results[0].geometry.location) {
          const location = results[0].geometry.location;
          const sw = new window.google.maps.LatLng(location.lat() - 0.45, location.lng() - 0.45);
          const ne = new window.google.maps.LatLng(location.lat() + 0.45, location.lng() + 0.45);
          bounds = new window.google.maps.LatLngBounds(sw, ne);
        }
        
        const request: any = {
          input: query,
          componentRestrictions: { country: 'ro' },
          types: ['address']
        };
        
        if (bounds) {
          request.bounds = bounds;
        }
        
        autocompleteServiceRef.current.getPlacePredictions(request, (predictions: any[], status: string) => {
          if (status === (window.google.maps.places as any)?.PlacesServiceStatus?.OK && predictions) {
            // Filter predictions to only include those in the selected county
            const countyVariations = getCountyVariations(selectedCounty);
            const countyCapitalName = countyCapital.split(',')[0].toLowerCase();
            
            const filtered = predictions.filter(prediction => {
              const description = prediction.description.toLowerCase();
              const terms = prediction.terms || [];
              
              // Check description
              for (const variation of countyVariations) {
                if (description.includes(variation) || description.includes(countyCapitalName)) {
                  return true;
                }
              }
              
              // Check terms (address components)
              for (const term of terms) {
                const termValue = term.value.toLowerCase();
                for (const variation of countyVariations) {
                  if (termValue.includes(variation) || termValue.includes(countyCapitalName)) {
                    return true;
                  }
                }
              }
              
              return false;
            });
            
            // Combine Google predictions with AI suggestions
            const allPredictions = [
              ...filtered.slice(0, 5),
              ...aiSugs.map(s => ({
                description: s,
                place_id: `ai-${Date.now()}-${Math.random()}`,
                structured_formatting: {
                  main_text: s.split(',')[0].trim(),
                  secondary_text: s.split(',').slice(1).join(',').trim()
                }
              }))
            ];
            
            setPredictions(allPredictions.slice(0, 8)); // Limit to 8 results (5 Google + 3 AI)
            setShowPredictions(allPredictions.length > 0);
          } else {
            // Even if Google fails, show AI suggestions
            if (aiSugs.length > 0) {
              const aiPredictions = aiSugs.map(s => ({
                description: s,
                place_id: `ai-${Date.now()}-${Math.random()}`,
                structured_formatting: {
                  main_text: s.split(',')[0].trim(),
                  secondary_text: s.split(',').slice(1).join(',').trim()
                }
              }));
              setPredictions(aiPredictions);
              setShowPredictions(true);
            } else {
              setPredictions([]);
              setShowPredictions(false);
            }
          }
        });
      } else {
        // If geocoding fails, still show AI suggestions
        if (aiSugs.length > 0) {
          const aiPredictions = aiSugs.map(s => ({
            description: s,
            place_id: `ai-${Date.now()}-${Math.random()}`,
            structured_formatting: {
              main_text: s.split(',')[0].trim(),
              secondary_text: s.split(',').slice(1).join(',').trim()
            }
          }));
          setPredictions(aiPredictions);
          setShowPredictions(true);
        } else {
          setPredictions([]);
          setShowPredictions(false);
        }
      }
    });
  };
  
  const handlePredictionSelect = (prediction: any) => {
    // Check if it's an AI suggestion
    if (prediction.place_id?.startsWith('ai-')) {
      // For AI suggestions, use geocoding to get coordinates
      const address = prediction.description;
      onChange(address);
      setShowPredictions(false);
      setPredictions([]);
      
      // Geocode the address
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: `${address}, ${countyToGooglePlace[selectedCounty || ''] || 'România'}` }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const location = results[0].geometry.location;
            if (onPlaceSelect) {
              onPlaceSelect({
                address: address,
                coordinates: {
                  lat: location.lat(),
                  lng: location.lng()
                }
              });
            }
          }
        });
      }
      return;
    }
    
    // Regular Google Places prediction
    if (!placesServiceRef.current) return;
    
    // Get place details
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['formatted_address', 'geometry', 'address_components'] },
      (place: any, status: string) => {
        if (status === (window.google.maps.places as any)?.PlacesServiceStatus?.OK && place) {
          // Validate address is in selected county
          const countyVariations = getCountyVariations(selectedCounty || '');
          const countyCapitalName = countyToGooglePlace[selectedCounty || '']?.split(',')[0].toLowerCase() || '';
          const addressLower = place.formatted_address.toLowerCase();
          
          let isInCounty = false;
          for (const variation of countyVariations) {
            if (addressLower.includes(variation) || addressLower.includes(countyCapitalName)) {
              isInCounty = true;
              break;
            }
          }
          
          // Check address components
          if (!isInCounty && place.address_components) {
            for (const component of place.address_components) {
              if (component.types.includes('administrative_area_level_1') || 
                  component.types.includes('locality')) {
                const componentName = component.long_name.toLowerCase();
                const cityCounty = getCountyFromCity(componentName);
                if (cityCounty === selectedCounty) {
                  isInCounty = true;
                  break;
                }
                for (const variation of countyVariations) {
                  if (componentName.includes(variation) || variation.includes(componentName)) {
                    isInCounty = true;
                    break;
                  }
                }
                if (isInCounty) break;
              }
            }
          }
          
          if (isInCounty) {
            onChange(place.formatted_address);
            setShowPredictions(false);
            setPredictions([]);
            setMessage('');
            
            if (onPlaceSelect) {
              const coordinates = place.geometry?.location ? {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
              } : null;
              
              onPlaceSelect({
                address: place.formatted_address,
                coordinates
              });
            }
          } else {
            const countyCapital = countyToGooglePlace[selectedCounty || '']?.split(',')[0] || selectedCounty;
            const detectedCity = place.address_components?.find((c: any) => 
              c.types.includes('locality')
            )?.long_name;
            
            if (detectedCity) {
              const cityCounty = getCountyFromCity(detectedCity.toLowerCase());
              if (cityCounty && cityCounty !== selectedCounty) {
                setMessage(`💡 Adresa din ${detectedCity} este în județul ${cityCounty}, nu în ${countyCapital}. Te rugăm să selectezi o adresă din ${countyCapital} sau să schimbi locația.`);
              } else {
                setMessage(`💡 Adresa din ${detectedCity} nu este în zona ${countyCapital}. Te rugăm să selectezi o adresă din ${countyCapital}.`);
              }
            } else {
              setMessage(`💡 Adresa trebuie să fie în zona ${countyCapital}. Te rugăm să selectezi o adresă din această zonă.`);
            }
            setTimeout(() => setMessage(''), 5000);
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
          if (predictions.length > 0) {
            setShowPredictions(true);
          }
        }}
        onBlur={() => {
          // Delay to allow click on prediction
          setTimeout(() => setShowPredictions(false), 200);
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          isDarkMode 
            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
        }`}
      />
      {showPredictions && predictions.length > 0 && (
        <div className={`absolute z-50 w-full mt-1 rounded-lg border shadow-lg max-h-48 overflow-y-auto ${
          isDarkMode 
            ? 'bg-gray-700 border-gray-600' 
            : 'bg-white border-gray-300'
        }`}>
          {predictions.map((prediction, index) => (
            <button
              key={prediction.place_id || index}
              type="button"
              onClick={() => handlePredictionSelect(prediction)}
              className={`w-full text-left px-3 py-2 hover:bg-blue-600 hover:text-white transition-colors flex items-start gap-2 ${
                isDarkMode 
                  ? 'text-gray-300 hover:bg-blue-600' 
                  : 'text-gray-900'
              }`}
            >
              <span className="text-gray-400 mt-1">📍</span>
              <div>
                <div className="font-medium">{prediction.structured_formatting.main_text}</div>
                <div className="text-sm opacity-75">{prediction.structured_formatting.secondary_text}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {message && (
        <div className={`mt-2 p-2 rounded-lg text-sm flex items-start gap-2 ${
          isDarkMode 
            ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-200' 
            : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
        }`}>
          <span>💡</span>
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
