"use client";

import { useEffect, useRef, useState } from 'react';

interface Circle {
  id: string;
  center: { lat: number; lng: number };
  radius: number; // in meters
}

interface AuctionMarker {
  id: string;
  title: string;
  coordinates: { lat: number; lng: number };
  price?: number;
}

interface MapCircleFilterProps {
  onCirclesChange?: (circles: Circle[] | null) => void;
  isDarkMode?: boolean;
  height?: string;
  initialCircles?: Circle[] | null;
  selectedCounty?: string | null;
  auctions?: AuctionMarker[];
  searchCenter?: { lat: number; lng: number } | null;
  searchRadius?: number;
}

// Coordonate pentru capitalele județelor din România
const romaniaCounties: Record<string, { lat: number; lng: number }> = {
  'Alba': { lat: 46.0736, lng: 23.5804 }, // Alba Iulia
  'Arad': { lat: 46.1866, lng: 21.3123 }, // Arad
  'Argeș': { lat: 44.7167, lng: 24.6333 }, // Pitești
  'Bacău': { lat: 46.5679, lng: 26.9139 }, // Bacău
  'Bihor': { lat: 47.0625, lng: 21.9190 }, // Oradea
  'Bistrița-Năsăud': { lat: 47.1333, lng: 24.4833 }, // Bistrița
  'Botoșani': { lat: 47.7500, lng: 26.6667 }, // Botoșani
  'Brașov': { lat: 45.6427, lng: 25.5887 }, // Brașov
  'Brăila': { lat: 45.2667, lng: 27.9833 }, // Brăila
  'București': { lat: 44.4268, lng: 26.1025 }, // București
  'Buzău': { lat: 45.1500, lng: 26.8333 }, // Buzău
  'Caraș-Severin': { lat: 45.3000, lng: 21.8833 }, // Reșița
  'Călărași': { lat: 44.2000, lng: 27.3333 }, // Călărași
  'Cluj': { lat: 46.7712, lng: 23.6236 }, // Cluj-Napoca
  'Constanța': { lat: 44.1598, lng: 28.6348 }, // Constanța
  'Covasna': { lat: 45.8667, lng: 26.1833 }, // Sfântu Gheorghe
  'Dâmbovița': { lat: 44.9167, lng: 25.4500 }, // Târgoviște
  'Dolj': { lat: 44.3302, lng: 23.7949 }, // Craiova
  'Galați': { lat: 45.4353, lng: 28.0080 }, // Galați
  'Giurgiu': { lat: 43.9000, lng: 25.9667 }, // Giurgiu
  'Gorj': { lat: 45.0333, lng: 23.2833 }, // Târgu Jiu
  'Harghita': { lat: 46.3667, lng: 25.8000 }, // Miercurea Ciuc
  'Hunedoara': { lat: 45.7500, lng: 22.9000 }, // Deva
  'Ialomița': { lat: 44.5667, lng: 27.3667 }, // Slobozia
  'Iași': { lat: 47.1585, lng: 27.6014 }, // Iași
  'Ilfov': { lat: 44.4268, lng: 26.1025 }, // București (Buftea)
  'Maramureș': { lat: 47.6667, lng: 23.5833 }, // Baia Mare
  'Mehedinți': { lat: 44.8833, lng: 22.4167 }, // Drobeta-Turnu Severin
  'Mureș': { lat: 46.5500, lng: 24.5667 }, // Târgu Mureș
  'Neamț': { lat: 47.1833, lng: 26.3667 }, // Piatra Neamț
  'Olt': { lat: 44.3333, lng: 24.3500 }, // Slatina
  'Prahova': { lat: 44.9469, lng: 26.0365 }, // Ploiești
  'Sălaj': { lat: 47.2000, lng: 23.0500 }, // Zalău
  'Satu Mare': { lat: 47.8000, lng: 22.8833 }, // Satu Mare
  'Sibiu': { lat: 45.8000, lng: 24.1500 }, // Sibiu
  'Suceava': { lat: 47.6333, lng: 26.2500 }, // Suceava
  'Teleorman': { lat: 44.0167, lng: 25.2833 }, // Alexandria
  'Timiș': { lat: 45.7489, lng: 21.2087 }, // Timișoara
  'Tulcea': { lat: 45.1833, lng: 28.8000 }, // Tulcea
  'Vâlcea': { lat: 45.1000, lng: 24.3667 }, // Râmnicu Vâlcea
  'Vaslui': { lat: 46.6333, lng: 27.7333 }, // Vaslui
  'Vrancea': { lat: 45.8667, lng: 27.1833 }, // Focșani
};

export default function MapCircleFilter({ onCirclesChange, isDarkMode = false, height = 'h-64', initialCircles = null, selectedCounty = null, auctions = [], searchCenter = null, searchRadius = 0 }: MapCircleFilterProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const circlesRef = useRef<Map<string, { circle: any; marker: any }>>(new Map());
  const auctionMarkersRef = useRef<Map<string, any>>(new Map());
  const searchCircleRef = useRef<any>(null);
  const [circles, setCircles] = useState<Circle[]>(initialCircles || []);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentCircle, setCurrentCircle] = useState<{ center: { lat: number; lng: number } | null; circle: any; marker: any } | null>(null);

  // Load Google Maps API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google && window.google.maps) {
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

    if (!apiKey) {
      setError('Harta nu este disponibilă. Google Maps nu este configurat.');
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps="true"]');

    if (existingScript) {
      if (window.google && window.google.maps) {
        setIsLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setIsLoaded(true), { once: true });
        existingScript.addEventListener('error', () => {
          setError('Eroare la încărcarea Google Maps.');
          setIsLoaded(false);
        }, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,drawing,geometry`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-maps', 'true');
    script.onload = () => {
      setIsLoaded(true);
    };
    script.onerror = () => {
      setError('Eroare la încărcarea Google Maps.');
      setIsLoaded(false);
    };
    
    document.head.appendChild(script);
  }, []);

  // Initialize map and drawing
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;

    const defaultCenter = { lat: 44.4268, lng: 26.1025 }; // București
    
    const googleMap = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 7,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      styles: isDarkMode ? [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
      ] : [],
    });

    mapInstanceRef.current = googleMap;

    // Function to draw a circle
    const drawCircle = (circleData: Circle) => {
      // Remove existing circle if it exists
      const existing = circlesRef.current.get(circleData.id);
      if (existing) {
        existing.circle.setMap(null);
        existing.marker.setMap(null);
      }

      // Create center marker
      const marker = new window.google.maps.Marker({
        position: circleData.center,
        map: googleMap,
        icon: {
          path: (window.google.maps.SymbolPath as any)?.CIRCLE || 0,
          scale: 8,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 1000,
      });

      // Create circle
      const circle = new window.google.maps.Circle({
        center: circleData.center,
        radius: circleData.radius,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#3B82F6',
        fillOpacity: 0.15,
        map: googleMap,
        editable: false,
        draggable: false,
      });

      circlesRef.current.set(circleData.id, { circle, marker });
    };

    // Restore circles if initial values exist
    if (initialCircles && initialCircles.length > 0) {
      initialCircles.forEach(circleData => {
        drawCircle(circleData);
      });
    }

    // Draw search circle if address and radius are provided
    const drawSearchCircle = () => {
      if (searchCircleRef.current) {
        if (searchCircleRef.current.circle) {
          searchCircleRef.current.circle.setMap(null);
        }
        if (searchCircleRef.current.marker) {
          searchCircleRef.current.marker.setMap(null);
        }
        searchCircleRef.current = null;
      }
      
      if (searchCenter && searchRadius > 0) {
        const circle = new window.google.maps.Circle({
          center: searchCenter,
          radius: searchRadius * 1000, // Convert km to meters
          strokeColor: '#10B981',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#10B981',
          fillOpacity: 0.15,
          map: googleMap,
          editable: false,
          draggable: false,
        });
        
        // Add center marker
        const marker = new window.google.maps.Marker({
          position: searchCenter,
          map: googleMap,
          icon: {
            path: (window.google.maps.SymbolPath as any)?.CIRCLE || 0,
            scale: 8,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 1000,
        });
        
        searchCircleRef.current = { circle, marker };
        
        // Center map on search location
        googleMap.setCenter(searchCenter);
        const zoomLevel = searchRadius > 50 ? 8 : searchRadius > 20 ? 9 : searchRadius > 10 ? 10 : 11;
        googleMap.setZoom(zoomLevel);
      }
    };

    // Draw auction markers
    const drawAuctionMarkers = () => {
      // Clear existing markers
      auctionMarkersRef.current.forEach(marker => marker.setMap(null));
      auctionMarkersRef.current.clear();
      
      auctions.forEach(auction => {
        const marker = new window.google.maps.Marker({
          position: auction.coordinates,
          map: googleMap,
          title: auction.title,
          icon: {
            path: (window.google.maps.SymbolPath as any)?.CIRCLE || 0,
            scale: 7,
            fillColor: '#EF4444',
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          zIndex: 500,
        });
        
        // Add info window
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="color: #1a1a2e; padding: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 150px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">${auction.title}</div>
              ${auction.price ? `<div style="font-size: 12px; color: #3B82F6; font-weight: 500;">${auction.price.toLocaleString('ro-RO')} Lei</div>` : ''}
            </div>
          `,
        });
        
        marker.addListener('click', () => {
          infoWindow.open(googleMap, marker);
        });
        
        auctionMarkersRef.current.set(auction.id, marker);
      });
    };

    drawSearchCircle();
    drawAuctionMarkers();

    // Center map on selected county capital if no search center
    if (!searchCenter && selectedCounty && selectedCounty !== 'all' && romaniaCounties[selectedCounty]) {
      const countyCoords = romaniaCounties[selectedCounty];
      googleMap.setCenter(countyCoords);
      googleMap.setZoom(11); // Zoom closer to see the capital city better
    }

    // Circle drawing mode - click to set center, drag to set radius
    let clickListener: any;
    let mousemoveListener: any;
    let mouseupListener: any;
    let isDrawing = false;
    let startCenter: { lat: number; lng: number } | null = null;

    const startDrawing = (e: any) => {
      if (!e.latLng || !isDrawingMode) return;
      
      isDrawing = true;
      const clickLat = e.latLng.lat();
      const clickLng = e.latLng.lng();
      startCenter = { lat: clickLat, lng: clickLng };

      // Remove current circle if exists
      if (currentCircle) {
        if (currentCircle.circle) currentCircle.circle.setMap(null);
        if (currentCircle.marker) currentCircle.marker.setMap(null);
      }

      // Add center marker
      const marker = new window.google.maps.Marker({
        position: startCenter,
        map: googleMap,
        icon: {
          path: (window.google.maps.SymbolPath as any)?.CIRCLE || 0,
          scale: 8,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 1000,
      });

      // Create circle
      const circle = new window.google.maps.Circle({
        center: startCenter,
        radius: 0,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#3B82F6',
        fillOpacity: 0.15,
        map: googleMap,
        editable: false,
        draggable: false,
      });

      setCurrentCircle({ center: startCenter, circle, marker });

      // Update circle radius on mouse move
      mousemoveListener = (window.google.maps.event as any)?.addListener(googleMap, 'mousemove', (moveEvent: any) => {
        if (!isDrawing || !moveEvent.latLng || !startCenter || !currentCircle) return;

        const moveLat = moveEvent.latLng.lat();
        const moveLng = moveEvent.latLng.lng();
        
        // Calculate distance in meters
        let distance = 0;
        if (window.google.maps.geometry && window.google.maps.geometry.spherical) {
          distance = window.google.maps.geometry.spherical.computeDistanceBetween(
            new window.google.maps.LatLng(startCenter.lat, startCenter.lng),
            new window.google.maps.LatLng(moveLat, moveLng)
          );
        } else {
          // Fallback Haversine formula
          const R = 6371000; // Earth's radius in meters
          const dLat = (moveLat - startCenter.lat) * Math.PI / 180;
          const dLng = (moveLng - startCenter.lng) * Math.PI / 180;
          const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(startCenter.lat * Math.PI / 180) * Math.cos(moveLat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distance = R * c;
        }

        if (currentCircle.circle) {
          currentCircle.circle.setRadius(distance);
        }
      });

      // Finish drawing on mouse up
      mouseupListener = (window.google.maps.event as any)?.addListener(googleMap, 'mouseup', () => {
        if (isDrawing && startCenter && currentCircle && currentCircle.circle) {
          isDrawing = false;
          const finalRadius = currentCircle.circle.getRadius();
          
          if (finalRadius > 100) { // Minimum 100 meters
            const newCircle: Circle = {
              id: `circle-${Date.now()}-${Math.random()}`,
              center: startCenter,
              radius: finalRadius,
            };
            
            const updatedCircles = [...circles, newCircle];
            setCircles(updatedCircles);
            drawCircle(newCircle);
            
            if (onCirclesChange) {
              onCirclesChange(updatedCircles);
            }
          }
          
          // Clear current circle
          if (currentCircle.circle) currentCircle.circle.setMap(null);
          if (currentCircle.marker) currentCircle.marker.setMap(null);
          setCurrentCircle(null);
          startCenter = null;
          
          if (mousemoveListener) {
            (window.google.maps.event as any)?.removeListener(mousemoveListener);
          }
          if (mouseupListener) {
            (window.google.maps.event as any)?.removeListener(mouseupListener);
          }
        }
      });
    };

    // Setup click listener
    const setupDrawingListener = () => {
      if (clickListener) {
        (window.google.maps.event as any)?.removeListener(clickListener);
      }
      if (isDrawingMode) {
        clickListener = (window.google.maps.event as any)?.addListener(googleMap, 'click', startDrawing);
      }
    };

    setupDrawingListener();

    // Cleanup
    return () => {
      if (clickListener) {
        (window.google.maps.event as any)?.removeListener(clickListener);
      }
      if (mousemoveListener) {
        (window.google.maps.event as any)?.removeListener(mousemoveListener);
      }
      if (mouseupListener) {
        (window.google.maps.event as any)?.removeListener(mouseupListener);
      }
    };
  }, [isLoaded, isDarkMode, onCirclesChange, initialCircles, selectedCounty, isDrawingMode, circles, auctions, searchCenter, searchRadius]);

  // Update cursor when drawing mode changes
  useEffect(() => {
    if (!mapRef.current) return;
    
    if (isDrawingMode) {
      mapRef.current.style.cursor = 'crosshair';
    } else {
      mapRef.current.style.cursor = '';
    }
  }, [isDrawingMode]);

  // Center map on selected county when it changes
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedCounty || selectedCounty === 'all') return;
    
    if (romaniaCounties[selectedCounty]) {
      const countyCoords = romaniaCounties[selectedCounty];
      mapInstanceRef.current.setCenter(countyCoords);
      mapInstanceRef.current.setZoom(10);
    }
  }, [selectedCounty]);

  const clearAllCircles = () => {
    circlesRef.current.forEach(({ circle, marker }) => {
      circle.setMap(null);
      marker.setMap(null);
    });
    circlesRef.current.clear();
    setCircles([]);
    if (onCirclesChange) {
      onCirclesChange(null);
    }
  };

  const removeCircle = (circleId: string) => {
    const existing = circlesRef.current.get(circleId);
    if (existing) {
      existing.circle.setMap(null);
      existing.marker.setMap(null);
      circlesRef.current.delete(circleId);
    }
    const updatedCircles = circles.filter(c => c.id !== circleId);
    setCircles(updatedCircles);
    if (onCirclesChange) {
      onCirclesChange(updatedCircles.length > 0 ? updatedCircles : null);
    }
  };

  if (error) {
    return (
      <div className={`w-full ${height} flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} text-gray-600 dark:text-gray-400 rounded-lg border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
        <div className="text-center p-4">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`w-full ${height} flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Se încarcă harta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5 ${
              isDrawingMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : isDarkMode
                ? 'bg-gray-600 hover:bg-gray-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
            title={isDrawingMode ? 'Dezactivează modul de desenare' : 'Activează modul de desenare'}
          >
            <svg 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span>{isDrawingMode ? 'Desenare activă' : 'Desenează cerc'}</span>
          </button>
          {isDrawingMode && (
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Click pentru centru, apoi trageți pentru rază
            </p>
          )}
        </div>
        {circles.length > 0 && (
          <button
            onClick={clearAllCircles}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              isDarkMode
                ? 'bg-gray-600 hover:bg-gray-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Șterge toate ({circles.length})
          </button>
        )}
      </div>
      {circles.length > 0 && (
        <div className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <div>Cercuri desenate: {circles.length}</div>
          <div className="flex flex-wrap gap-1">
            {circles.map((circle, index) => (
              <button
                key={circle.id}
                onClick={() => removeCircle(circle.id)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title={`Șterge cercul ${index + 1}`}
              >
                Cerc {index + 1} ({(circle.radius / 1000).toFixed(1)} km) ×
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="relative">
        <div ref={mapRef} className={`w-full ${height} rounded-lg border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`} />
        {isDrawingMode && (
          <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium shadow-lg">
            Mod desenare activ - Click pentru centru, trageți pentru rază
          </div>
        )}
      </div>
    </div>
  );
}



