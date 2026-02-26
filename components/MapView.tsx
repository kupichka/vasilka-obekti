import { useEffect, useRef } from "react"
import { mapService } from "../services/mapService"
// Fix: Ensure this matches your actual file extension
import data from "../data/objects2.json" 
import type { GeoFeature } from "../types/geo"

interface Props {
  onFeatureSelect: (feature: GeoFeature) => void
}

export default function MapView({ onFeatureSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)

  // Inside MapView.tsx
    useEffect(() => {
    if (!mapRef.current) return

    mapService.init(mapRef.current, [42.7339, 25.4858], 7)
    mapService.loadGeoJSON(data)
    
    // We use the service to update the handler so the effect doesn't re-run
    mapService.setFeatureClickHandler(onFeatureSelect)

    return () => {
        mapService.destroy()
    }
    }, []) // EMPTY ARRAY = No resets.

    // Add a second effect to update the click handler reference without rebuilding the map
    useEffect(() => {
    mapService.setFeatureClickHandler(onFeatureSelect)
    }, [onFeatureSelect])

  return <div ref={mapRef} className="h-full w-full z-0" />
}