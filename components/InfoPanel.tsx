import type { GeoFeature } from "../types/geo"

interface Props {
  feature: GeoFeature | null
}

export default function InfoPanel({ feature }: Props) {
  if (!feature) {
    return (
      <div className="absolute bottom-2 left-2 z-[1000] bg-white p-4 rounded shadow border-slate-200">
        <p>Натисни обект</p>
      </div>
    )
  }

  const { name, category, region, description } = feature.properties
  const hiddenRegions = new Set([
    "Градове (257)",
    "Градове 1",
    "Градове 2",
    "Градове 3",
    "Градове 4",
    "Градове 5",
    "Градове 6",
    "Градове 7",
    "Реки (32)",
    "Защитени области (27)"
  ])

  const rawRegion = Array.isArray(region) ? region : [region]

  const visibleRegions = rawRegion.filter(
    (r) => r && !hiddenRegions.has(r)
  )

  const formattedRegion = visibleRegions.length > 0
    ? visibleRegions.join(", ")
    : null
  return (
    <div className="absolute bottom-2 left-2 z-[1000] bg-white p-4 max-w-sm border-slate-200">
      <h2 className="text-lg font-bold">{name}</h2>
      <p className="text-sm text-gray-500">{category}</p>
      {formattedRegion && <p className="text-sm">{formattedRegion}</p>}
      {description && <p className="mt-2 text-sm">{description}</p>}
    </div>
  )
}