"use client";

import { useEffect, useRef, useState } from 'react';

interface GoogleMapPreviewProps {
  address: string;
  coordinates?: { lat: number; lng: number };
  onCoordinatesChange?: (coords: { lat: number; lng: number }) => void;
}

export default function GoogleMapPreview({ address, coordinates, onCoordinatesChange }: GoogleMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Google Maps API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
      setIsLoaded(true);
      return;
    }

    // Get API key from localStorage (from modules)
    const savedModules = localStorage.getItem('admin_modules');
    let apiKey = '';
    
    if (savedModules) {
      try {
        const modules = JSON.parse(savedModules);
        const googleMapsModule = modules.find((m: any) => m.id === 'google-maps');
        if (googleMapsModule?.config?.apiKey) {
          apiKey = googleMapsModule.config.apiKey;
        }
      } catch (e) {
        console.error('Error loading Google Maps config:', e);
      }
    }

    // If no API key, try to use a default or show error
    if (!apiKey) {
      // Fallback: try environment variable or show placeholder
      apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    if (!apiKey) {
      setError('Google Maps API Key nu este configurat. Vă rugăm să configurați Google Maps în modulul de Module.');
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps="true"]');

    if (existingScript) {
      if (window.google && window.google.maps) {
        setIsLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setIsLoaded(true), { once: true });
        existingScript.addEventListener(
          'error',
          () => {
            setError('Eroare la încărcarea Google Maps. Verificați API key-ul.');
            setIsLoaded(false);
          },
          { once: true }
        );
      }
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.setAttribute('data-google-maps', 'true');
    script.onload = () => {
      setIsLoaded(true);
    };
    script.onerror = () => {
      setError('Eroare la încărcarea Google Maps. Verificați API key-ul.');
      setIsLoaded(false);
    };
    
    document.head.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;

    // Initialize map with default center (București)
    const defaultCenter = coordinates || { lat: 44.4268, lng: 26.1025 };
    
    const googleMap = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: coordinates ? 15 : 10,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
    });

    setMap(googleMap);

    // Add marker if coordinates exist
    if (coordinates) {
      const googleMarker = new window.google.maps.Marker({
        position: coordinates,
        map: googleMap,
        draggable: true,
        title: address,
      });

      googleMarker.addListener('dragend', () => {
        const pos = googleMarker.getPosition();
        if (pos && onCoordinatesChange) {
          onCoordinatesChange({ lat: pos.lat(), lng: pos.lng() });
        }
      });

      setMarker(googleMarker);
    }

    // Geocode address if no coordinates
    if (address && !coordinates && window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;
          const coords = { lat: location.lat(), lng: location.lng() };
          
          googleMap.setCenter(coords);
          googleMap.setZoom(15);

          const googleMarker = new window.google.maps.Marker({
            position: coords,
            map: googleMap,
            draggable: true,
            title: address,
          });

          googleMarker.addListener('dragend', () => {
            const pos = googleMarker.getPosition();
            if (pos && onCoordinatesChange) {
              onCoordinatesChange({ lat: pos.lat(), lng: pos.lng() });
            }
          });

          setMarker(googleMarker);
          
          if (onCoordinatesChange) {
            onCoordinatesChange(coords);
          }
        } else {
          setError('Nu s-a putut găsi locația pentru adresa introdusă.');
        }
      });
    }

    // Add click listener to add marker
    googleMap.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        
        if (marker) {
          marker.setPosition(e.latLng);
        } else {
          const googleMarker = new window.google.maps.Marker({
            position: coords,
            map: googleMap,
            draggable: true,
          });

          googleMarker.addListener('dragend', () => {
            const pos = googleMarker.getPosition();
            if (pos && onCoordinatesChange) {
              onCoordinatesChange({ lat: pos.lat(), lng: pos.lng() });
            }
          });

          setMarker(googleMarker);
        }

        if (onCoordinatesChange) {
          onCoordinatesChange(coords);
        }
      }
    });
  }, [isLoaded, address, coordinates, onCoordinatesChange]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
        <div className="text-center p-4">
          <i className="ri-error-warning-line text-2xl mb-2"></i>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Se încarcă harta...</p>
        </div>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-full" />;
}



