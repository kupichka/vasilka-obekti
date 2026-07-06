import type { GeoFeature } from "../types/geo"

interface Props {
  feature: GeoFeature | null
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200">
      {children}
    </span>
  )
}

function CoinIcon() {
  return (
    <IconWrap>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-pound-sterling-icon lucide-circle-pound-sterling"><circle cx="12" cy="12" r="10"/><path d="M10 16V9.5a1 1 0 0 1 5 0"/><path d="M8 12h4"/><path d="M8 16h7"/></svg>
    </IconWrap>
  )
}

function CashIcon() {
  return (
    <IconWrap>
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote-icon lucide-banknote"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
    </IconWrap>
  )
}

function CardIcon() {
  return (
    <IconWrap>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.5 10h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 14h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </IconWrap>
  )
}

export default function InfoPanel({ feature }: Props) {
  if (!feature) {
    return (
      <div className="absolute bottom-3 left-3 z-[1000] bg-white p-4 rounded shadow border border-slate-200">
        <p>Натисни обект</p>
      </div>
    )
  }

  const { name, category, region, description } = feature.properties as Record<string, any>

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
    "Защитени области (27)",
  ])

  const rawRegion = Array.isArray(region) ? region : [region]
  const visibleRegions = rawRegion.filter((r) => r && !hiddenRegions.has(r))

  const formattedRegion = visibleRegions.length > 0 ? visibleRegions.join(", ") : null

  const isVendingMachine =
    feature.properties.amenity === "vending_machine" ||
    Boolean(feature.properties.vending)

  const vendingRaw = typeof feature.properties.vending === "string" ? feature.properties.vending : ""
  const vendingLabels: Record<string, string> = {
    parking_tickets: "Паркинг билети",
    public_transport_tickets: "Билети за градски транспорт",
    coffee: "Кафе",
    drinks: "Напитки",
    snacks: "Закуски",
    cigarettes: "Цигари",
    bike_tube: "Вътрешни гуми",
    bicycle_tube: "Вътрешни гуми",
    food: "Храна",
    fuel: "Гориво",
    flowers: "Цветя",
    pizza: "Пица",
  }

  const vendingLabel =
    vendingLabels[vendingRaw] ?? vendingRaw.replaceAll("_", " ")

  const payments = {
    coins: feature.properties["payment:coins"] === "yes",
    cash:
      feature.properties["payment:cash"] === "yes" ||
      feature.properties["payment:notes"] === "yes",
    cards:
      feature.properties["payment:credit_cards"] === "yes" ||
      feature.properties["payment:debit_cards"] === "yes" ||
      feature.properties["payment:contactless"] === "yes" ||
      feature.properties["payment:card"] === "yes",
    visa: feature.properties["payment:visa"] === "yes",
    mastercard: feature.properties["payment:mastercard"] === "yes",
  }

  const hasAnyPayment =
    payments.coins || payments.cash || payments.cards || payments.visa || payments.mastercard

  return (
    <div className="absolute bottom-3 left-3 z-[1000] bg-white p-4 max-w-sm rounded shadow border border-slate-200">
      <h2 className="text-lg font-bold">{name}</h2>

      {category && <p className="text-sm text-gray-500">{category}</p>}
      {formattedRegion && <p className="text-sm">{formattedRegion}</p>}
      {!isVendingMachine && description && <p className="mt-2 text-sm">{description}</p>}

      {isVendingMachine && (
        <div className="">
          <div>
            <h3 className="font-semibold text-m">Вендинг машина</h3>
            {description && <p className="mt-2 text-sm">{description}</p>}
            {vendingLabel && (
              <p className="text-sm mt-2">
                <span className="font-medium">Продава:</span> {vendingLabel}
              </p>
            )}
          </div>
          

          <div className="space-y-1 text-sm">
            {feature.properties.operator && (
              <p>
                <span className="font-medium">Оператор:</span> {feature.properties.operator}
              </p>
            )}
            {feature.properties.brand && (
              <p>
                <span className="font-medium">Марка:</span> {feature.properties.brand}
              </p>
            )}
            {feature.properties.level && (
              <p>
                <span className="font-medium">Етаж:</span> {feature.properties.level}
              </p>
            )}
            {feature.properties.indoor && (
              <p>
                <span className="font-medium">Местоположение:</span> На закрито
              </p>
            )}
          </div>

          {hasAnyPayment && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 mt-2">
                Приема
              </p>
              <div className="flex flex-wrap gap-2">
                {payments.coins && (
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CoinIcon />
                    <span>Coins</span>
                  </div>
                )}
                {payments.cash && (
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CashIcon />
                    <span>Cash / Notes</span>
                  </div>
                )}
                {payments.cards && (
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CardIcon />
                    <span>Cards</span>
                  </div>
                )}
              </div>

              {(payments.visa || payments.mastercard) && (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  {payments.visa && (
                    <span className="px-2 py-0.5 rounded-full border border-slate-200">
                      Visa
                    </span>
                  )}
                  {payments.mastercard && (
                    <span className="px-2 py-0.5 rounded-full border border-slate-200">
                      Mastercard
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}