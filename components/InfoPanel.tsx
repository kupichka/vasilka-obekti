import type { GeoFeature } from "../types/geo"

interface Props {
  feature: GeoFeature | null
}

export default function InfoPanel({ feature }: Props) {
  if (!feature) {
    return (
      <div className="absolute bottom-4 left-4 z-[1000] bg-white p-4 rounded shadow">
        <p>Select an object</p>
      </div>
    )
  }

  const { name, category, region, description } = feature.properties

  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white p-4 rounded shadow max-w-sm">
      <h2 className="text-lg font-bold">{name}</h2>
      <p className="text-sm text-gray-500">{category}</p>
      {region && <p className="text-sm">{region}</p>}
      {description && <p className="mt-2 text-sm">{description}</p>}
    </div>
  )
}