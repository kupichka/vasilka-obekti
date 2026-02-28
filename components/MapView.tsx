import { useEffect, useRef, useState } from "react"
import { mapService } from "../services/mapService"
import type { GeoFeature } from "../types/geo"
import geoData from "../data/objects2.json";

interface Props {
  onFeatureSelect: (feature: GeoFeature) => void
}

export default function MapView({ onFeatureSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!mapRef.current) return

    const loadData = async () => {
      try {
        // 1. Set the data into the service's memory
        mapService.setRawData(geoData);

        // 2. INITIALIZE the map (This creates the L.Map instance)
        // IMPORTANT: This must happen before loadGeoJSON
        mapService.init(mapRef.current!, [42.7339, 25.4858], 7);

        // 3. NOW load the shapes onto the initialized map
        mapService.loadGeoJSON(geoData);

        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load GeoJSON:", error);
        setIsLoading(false);
      }
    }

    loadData()
    mapService.setFeatureClickHandler(onFeatureSelect)

    return () => {
      mapService.destroy()
    }
  }, [])

  useEffect(() => {
    mapService.setFeatureClickHandler(onFeatureSelect)
  }, [onFeatureSelect])

  return (
    <div 
      ref={mapRef} 
      className="h-full w-full z-0 flex items-center justify-center"
    >
      {isLoading && (
        <div className="text-white w-1/2 text-center">
          <span className="block text-lg">Loading map data...</span>
        </div>
      )}
    </div>
  );

}