import { useEffect, useRef, useState } from "react"
import { mapService } from "../services/mapService"
import type { GeoFeature } from "../types/geo"

interface Props {
  onFeatureSelect: (feature: GeoFeature) => void
}

export default function MapView({ onFeatureSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!mapRef.current) return;

    const initMap = () => {
      // These will now succeed every time because isDataReady is true
      mapService.init(mapRef.current!, [42.7339, 25.4858], 7);
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

  return (
    <div ref={mapRef} className="h-full w-full z-0 relative">
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