/**
 * Type definitions for Google Maps API
 */

declare global {
  interface Window {
    google: {
      maps: {
        Map: new (element: HTMLElement, options?: any) => any;
        Marker: new (options?: any) => any;
        InfoWindow: new (options?: any) => any;
        Geocoder: new () => {
          geocode: (request: any, callback: (results: any[] | null, status: string) => void) => void;
        };
        MapMouseEvent: {
          latLng: {
            lat: () => number;
            lng: () => number;
          } | null;
        };
        LatLngBounds: new (sw?: any, ne?: any) => {
          extend: (location: { lat: number; lng: number }) => void;
        };
        LatLng: new (lat: number, lng: number) => {
          lat: () => number;
          lng: () => number;
        };
        places?: {
          AutocompleteService: new () => any;
          PlacesService: new (element: HTMLElement) => any;
          PlacesServiceStatus: {
            OK: string;
            [key: string]: string;
          };
          [key: string]: any;
        };
        SymbolPath?: {
          CIRCLE: any;
          [key: string]: any;
        };
        Animation?: {
          DROP: any;
          [key: string]: any;
        };
        event?: {
          addListener: (instance: any, eventName: string, handler: () => void) => any;
          removeListener: (listener: any) => void;
        };
        geocoder?: boolean;
        [key: string]: any; // Allow additional properties
      };
    };
  }

  namespace google {
    namespace maps {
      interface MapMouseEvent {
        latLng: {
          lat: () => number;
          lng: () => number;
        } | null;
      }
    }
  }
}

export {};

