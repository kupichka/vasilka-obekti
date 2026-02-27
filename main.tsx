import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './dark.css'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import L from "leaflet"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"

delete (L.Icon.Default.prototype as any)._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// dark.css is loaded via import; no runtime theme service required

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
