import { useState, useEffect, useCallback } from "react"
import MapView from "./components/MapView"
import InfoPanel from "./components/InfoPanel"
import { quizEngine } from "./services/quizEngine"
import { mapService } from "./services/mapService"
import type { GeoFeature } from "./types/geo"
import "./stylized.css"
import rawData from "./data/objects2.json";

export default function App() {
  const [mode, setMode] = useState<"learn" | "quiz">("learn")
  const [selected, setSelected] = useState<GeoFeature | null>(null)
  const [target, setTarget] = useState<GeoFeature | null>(null)
  const [score, setScore] = useState(0)
  const [isSpoiled, setIsSpoiled] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [regionList, setRegionList] = useState<string[]>(["All"])
  const [showLabels, setShowLabels] = useState(true)
  const [darkTiles, setDarkTiles] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
//        const response = await fetch("/objects2.json")
//        const data = await response.json()
        quizEngine.setFeatures(rawData)
        mapService.setRawData(rawData)
        // mapService.loadGeoJSON(rawData) // uh this line is shady, idk if I like it 
        setRegionList(quizEngine.getAvailableRegions())
      } catch (error) {
        console.error("Failed to load data:", error)
      }
    }
    loadData()
  }, [])

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  const startNewQuestion = useCallback(() => {
    if (quizEngine.getPoolSize() === 0) quizEngine.setRegion("All"); 
    const next = quizEngine.getNextQuestion();
    if (next) {
      setTarget(next);
      setSelected(null);
      setIsSpoiled(false);
      mapService.resetAllStyles();
    } else {
      showToast("Няма намерени обекти!", "error");
    }
  }, [showToast]);

  const handleSelect = useCallback((feature: GeoFeature) => {
    setSelected(feature)
    if (mode === "quiz" && target) {
      if (feature.properties['@id'] === target.properties['@id']) {
        if (isSpoiled) {
          quizEngine.handleGiveUp(target)
          showToast("Откри го!", "success")
        } else {
          setScore(s => s + 1)
          showToast("Правилно! +1", "success")
        }
        startNewQuestion()
      } else {
        showToast(`Не, това е ${feature.properties.name}`, "error")
      }
    }
  }, [mode, target, isSpoiled, startNewQuestion, showToast])

  const handleShowHint = () => {
    if (target?.properties['@id']) {
      setIsSpoiled(true)
      mapService.highlightFeatureById(target.properties['@id'], "#22c55e")
      mapService.zoomToFeatureById(target.properties['@id'])
    }
  }

  const handleRegionChange = (region: string) => {
    quizEngine.setRegion(region);
    mapService.renderFilteredFeatures(region);
    if (mode === "quiz") startNewQuestion();
  };

  return (
    <div className="h-full w-full relative overflow-hidden stylized" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      
      {/* Toast Notification - Smaller text on mobile */}
      {feedback && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-[2000] px-6 py-2 rounded-full shadow-2xl transition-all animate-bounce text-white font-bold text-center max-md:text-[10px] max-md:px-4 ${
          feedback.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* --- HEADER CONTROLS --- */}
      {/* Desktop: Original classes. Mobile: Remove background/borders via the CSS class you have */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 header-toggle-container p-2 rounded-2xl shadow-xl border border-slate-200 mobile-no-bg">
        <div className="flex p-1">
          <button 
            onClick={() => { setMode("learn"); mapService.resetAllStyles(); handleRegionChange("All"); }}
            style={{ marginRight: '30px' }}
            className={`px-6 py-2 rounded-lg transition-all ${mode === "learn" ? "bg-white shadow text-blue-600 font-bold" : "text-slate-500"}`}
          >
            Научи
          </button>
          <button 
            onClick={() => { setMode("quiz"); startNewQuestion(); }}
            className={`px-6 py-2 rounded-lg transition-all ${mode === "quiz" ? "bg-white shadow text-orange-500 font-bold" : "text-slate-500"}`}
          >
            Тест
          </button>
        </div>
        {mode === "quiz" && <div className="pr-4 font-mono font-bold text-slate-700 max-md:hidden">Точки: {score}</div>}
      </div>

      {/* --- DESKTOP REGION SELECTOR (Original) --- */}
      <div className="max-md:hidden absolute top-4 right-4 z-[1000] bg-white p-2 rounded-xl shadow-lg border border-slate-200">
        <label className="text-xs font-bold text-slate-400 block mb-1 px-1 tracking-tighter uppercase">ИЗБЕРИ ОБЛАСТ</label>
        <select onChange={(e) => handleRegionChange(e.target.value)} className="bg-slate-50 border-none text-sm font-bold text-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer">
          {regionList.map(region => <option key={region} value={region}>{region}</option>)}
        </select>
      </div>

      {/* --- DESKTOP SETTINGS (Original) --- */}
      <div className="max-md:hidden absolute bottom-5 right-1 z-[1000] bg-white p-3 rounded-xl shadow-lg border border-slate-200 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="showLabels" checked={showLabels} onChange={(e) => { setShowLabels(e.target.checked); mapService.setTileLayer(e.target.checked); }} className="cursor-pointer w-4 h-4" />
          <label htmlFor="showLabels" className="text-xs font-bold text-slate-700 cursor-pointer">Наименования</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="darkTiles" checked={darkTiles} onChange={(e) => { setDarkTiles(e.target.checked); mapService.setDarkTiles(e.target.checked); }} className="cursor-pointer w-4 h-4" />
          <label htmlFor="darkTiles" className="text-xs font-bold text-slate-700 cursor-pointer">Тъмна карта</label>
        </div>
      </div>

      {/* --- MOBILE CONSOLIDATED BOTTOM BAR --- */}
      <div className="md:hidden absolute bottom-0 left-0 w-full z-[1000] bg-[#281e3f] border-t-2 border-[#3a2444] px-2 py-2 flex items-center justify-between gap-1">
        <select 
          onChange={(e) => handleRegionChange(e.target.value)} 
          /* Use flex-1 so the select fills the remaining space instead of forcing 50% */
          className="bg-[#140e1e] text-[11px] font-normal p-2 border border-[#3a2444] flex-1 min-w-0 text-[#ffecd6]"
        >
          {regionList.map(region => <option key={region} value={region}>{region}</option>)}
        </select>

        {/* shrink-0 ensures the labels don't wrap to a second line */}
        <div className="flex shrink-0 items-center gap-2 justify-end pl-1">
          <div className="flex items-center gap-1">
            <input type="checkbox" id="m-labels" checked={showLabels} onChange={(e) => {setShowLabels(e.target.checked); mapService.setTileLayer(e.target.checked)}} className="w-3.5 h-3.5" />
            <label htmlFor="m-labels" className="text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap">Наименования</label>
          </div>
          <div className="flex items-center gap-1">
            <input type="checkbox" id="m-dark" checked={darkTiles} onChange={(e) => {setDarkTiles(e.target.checked); mapService.setDarkTiles(e.target.checked)}} className="w-3.5 h-3.5" />
            <label htmlFor="m-dark" className="text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap">Тъмно</label>
          </div>
        </div>
      </div>

      {/* --- QUIZ PROMPTS --- */}
      {mode === "quiz" && target && (
        <>
          {/* Desktop Version: Original Bulky Card */}
          <div className="max-md:hidden absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 w-full max-w-xs">
            <div className="bg-white px-8 py-4 rounded-2xl border-b-4 border-orange-400 shadow-2xl text-center w-full">
              <p className="text-sm uppercase tracking-widest text-slate-400 font-bold">Намери обекта:</p>
              <p className="text-2xl font-black text-slate-800">{target.properties.name}</p>
            </div>
            <button onClick={handleShowHint} className="bg-slate-800 text-white text-xs px-4 py-1.5 rounded-full hover:bg-slate-700 transition-colors uppercase tracking-tighter">Покажи (без точка)</button>
          </div>

          {/* Mobile Version: One-Line Optimized */}
          <div className="md:hidden absolute top-20 left-1/2 -translate-x-1/2 z-[1000] w-[95%]">
             <div className="bg-[#281e3f] p-2 border-b-2 border-[#a24e53] flex items-center justify-between gap-2 shadow-2xl">
                <span className="text-sm font-black truncate">{target.properties.name}</span>
                <div className="flex items-center gap-2">
                   <span className="font-mono font-bold text-[10px] bg-black/40 px-1 py-0.5">Точки: {score}</span>
                   <button onClick={handleShowHint} className="bg-[#a24e53] text-[9px] px-2 py-1 uppercase font-bold border border-[#73374e]">Покажи</button>
                </div>
             </div>
          </div>
        </>
      )}

      <MapView onFeatureSelect={handleSelect} />
      
      {/* InfoPanel with bottom margin fix */}
      <div className="info-panel-mobile-container">
        <InfoPanel feature={selected} />
      </div>
    </div>
  )
}