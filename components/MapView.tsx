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
    if (!mapRef.current) return

    const loadData = async () => {
      try {
        const response = await fetch("/objects2.json")
        const data = await response.json()
        
        mapService.init(mapRef.current!, [42.7339, 25.4858], 7)
        mapService.loadGeoJSON(data)
        setIsLoading(false)
      } catch (error) {
        console.error("Failed to load GeoJSON:", error)
        setIsLoading(false)
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
    <div ref={mapRef} className="h-full w-full z-0">
      {isLoading && <div className="text-white">Loading map data...</div>}
    </div>
  )
}