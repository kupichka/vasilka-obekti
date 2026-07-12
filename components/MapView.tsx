import { useEffect, useRef, useState } from "react"
import { mapService } from "../services/mapService"
import type { GeoFeature } from "../types/geo"

interface Props {
  onFeatureSelect: (feature: GeoFeature | null) => void
  isVendingMode?: boolean
  onPanToUserLocation?: () => void
}

export default function MapView({ onFeatureSelect, isVendingMode = false, onPanToUserLocation }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!mapRef.current) return;

    const initMap = () => {
      // These will now succeed every time because isDataReady is true
      mapService.init(mapRef.current!, [42.7339, 25.4858], 8);
      mapService.loadGeoJSON();
      setIsLoading(false);
    };

    initMap();

    return () => mapService.destroy();
  }, []);

  // Update handler when it changes
  useEffect(() => {
    mapService.setFeatureClickHandler(onFeatureSelect);
  }, [onFeatureSelect]);

  // Handle vending mode - show/hide user location
  useEffect(() => {
    if (isVendingMode) {
      mapService.showUserLocation();
    } else {
      mapService.hideUserLocation();
    }
  }, [isVendingMode]);

  return (
    <div ref={mapRef} className="h-full w-full z-0 relative">
      {isVendingMode && onPanToUserLocation && (
        <button
          onClick={onPanToUserLocation}
          className="absolute bottom-4 right-4 z-[1000] bg-blue-500 hover:bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-colors"
          title="Pan to my location"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-[1001]">
          <div className="text-white text-center p-6 bg-slate-800 rounded-xl shadow-2xl">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <span className="text-lg font-bold tracking-tight">Подготовка на картата...</span>
          </div>
        </div>
      )}
    </div>
  );
}