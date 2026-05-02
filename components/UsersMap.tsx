"use client";

import { useEffect, useRef, useState } from 'react';
import { OnlineUser } from '../utils/pageTracker';

interface UsersMapProps {
  users: OnlineUser[];
}

// Coordonate pentru județele din România
const romaniaCounties: Record<string, { lat: number; lng: number }> = {
  'București': { lat: 44.4268, lng: 26.1025 },
  'Cluj': { lat: 46.7712, lng: 23.6236 },
  'Timiș': { lat: 45.7489, lng: 21.2087 },
  'Constanța': { lat: 44.1598, lng: 28.6348 },
  'Brașov': { lat: 45.6427, lng: 25.5887 },
  'Iași': { lat: 47.1585, lng: 27.6014 },
  'Dolj': { lat: 44.3302, lng: 23.7949 },
  'Ilfov': { lat: 44.4268, lng: 26.1025 },
  'Prahova': { lat: 45.0670, lng: 26.0087 },
  'Argeș': { lat: 44.7167, lng: 24.6333 },
  'Sibiu': { lat: 45.7874, lng: 24.1433 },
  'Mureș': { lat: 46.5428, lng: 24.5579 },
  'Bihor': { lat: 47.0620, lng: 21.9203 },
  'Suceava': { lat: 47.6516, lng: 26.2555 },
};

// Generează coordonate pentru un utilizator bazate pe email sau alte indicii
const getUserLocation = (user: OnlineUser): { lat: number; lng: number } => {
  // Încearcă să extragă județul din email sau alte indicii
  const emailLower = user.userEmail.toLowerCase();
  
  for (const [county, coords] of Object.entries(romaniaCounties)) {
    if (emailLower.includes(county.toLowerCase()) || 
        emailLower.includes(county.toLowerCase().replace('ș', 's').replace('ț', 't'))) {
      // Adaugă variație mică pentru a nu suprapune markerii
      return {
        lat: coords.lat + (Math.random() - 0.5) * 0.1,
        lng: coords.lng + (Math.random() - 0.5) * 0.1
      };
    }
  }
  
  // Dacă e guest sau nu găsește județul, folosește o locație aleatorie în România
  const centerLat = 45.9432;
  const centerLng = 24.9668;
  return {
    lat: centerLat + (Math.random() - 0.5) * 2,
    lng: centerLng + (Math.random() - 0.5) * 2
  };
};

export default function UsersMap({ users }: UsersMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Load Google Maps API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if Google Maps is already loaded
    if (window.google && window.google.maps) {
      setIsLoaded(true);
      return;
    }

    // Get API key from localStorage
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

    // If no API key, try environment variable
    if (!apiKey) {
      apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    if (!apiKey) {
      setError('Google Maps API key nu este configurată');
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
          () => setError('Eroare la încărcarea Google Maps'),
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
    script.onload = () => setIsLoaded(true);
    script.onerror = () => setError('Eroare la încărcarea Google Maps');
    document.head.appendChild(script);

    return () => {
      // Cleanup markers on unmount
      markersRef.current.forEach(marker => marker.setMap(null));
    };
  }, []);

  // Initialize map and markers
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google?.maps || users.length === 0) return;

    // Initialize map centered on Romania
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 45.9432, lng: 24.9668 }, // Center of Romania
        zoom: 6,
        styles: [
          {
            featureType: 'all',
            elementType: 'geometry',
            stylers: [{ color: '#1a1a2e' }]
          },
          {
            featureType: 'all',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#ffffff' }]
          },
          {
            featureType: 'water',
            stylers: [{ color: '#2d3748' }]
          }
        ],
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
    }

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add markers for each user
    const bounds = window.google.maps.LatLngBounds ? new window.google.maps.LatLngBounds() : null;
    
    users.forEach((user) => {
      const location = getUserLocation(user);
      const markerOptions: any = {
        position: location,
        map: mapInstanceRef.current!,
        title: `${user.userName} - ${user.currentPage}`,
      };
      
      // Add icon if SymbolPath is available
      if (window.google.maps.SymbolPath) {
        markerOptions.icon = {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#3B82F6',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        };
      }
      
      // Add animation if Animation is available
      if (window.google.maps.Animation) {
        markerOptions.animation = window.google.maps.Animation.DROP;
      }
      
      const marker = new window.google.maps.Marker(markerOptions);

      // Info window
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="color: #1a1a2e; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="font-weight: bold; margin-bottom: 6px; font-size: 16px;">${user.userName}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 8px;">${user.userEmail}</div>
            <div style="font-size: 13px; color: #3B82F6; font-weight: 500;">
              📄 ${user.currentPage}
            </div>
            <div style="font-size: 11px; color: #999; margin-top: 6px;">
              ${user.currentPath}
            </div>
          </div>
        `,
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
      if (bounds) {
        bounds.extend(location);
      }
    });

    // Fit map to show all markers
    if (users.length > 0 && bounds && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds);
      // Don't zoom in too much if there's only one marker
      if (users.length === 1 && window.google.maps.event) {
        const eventSystem = window.google.maps.event;
        const listener = eventSystem.addListener(
          mapInstanceRef.current,
          'bounds_changed',
          () => {
            if (mapInstanceRef.current!.getZoom()! > 10) {
              mapInstanceRef.current!.setZoom(10);
            }
            eventSystem.removeListener(listener);
          }
        );
      }
    }
  }, [isLoaded, users]);

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white/5 rounded-xl">
        <div className="text-center">
          <i className="ri-error-warning-line text-4xl text-gray-500 mb-2"></i>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white/5 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
          <p className="text-gray-400 text-sm">Se încarcă harta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-xl" style={{ minHeight: '500px' }} />
    </div>
  );
}



