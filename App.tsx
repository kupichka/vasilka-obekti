import { useState, useEffect, useCallback } from "react"
import MapView from "./components/MapView"
import InfoPanel from "./components/InfoPanel"
import { quizEngine } from "./services/quizEngine"
import { mapService } from "./services/mapService"
import data from "./data/objects2.json"
import type { GeoFeature } from "./types/geo"
import "./stylized.css"

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

  // Initialize data and services once on mount
  useEffect(() => {
    quizEngine.setFeatures(data);
    mapService.setRawData(data);
    // Force React to re-render with the populated regions
    setRegionList(quizEngine.getAvailableRegions());
  }, [])

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  // Single source of truth for starting a question
  const startNewQuestion = useCallback(() => {
    // Ensure we have a pool to draw from (default to All if empty)
    if (quizEngine.getPoolSize() === 0) {
      quizEngine.setRegion("All"); 
    }

    const next = quizEngine.getNextQuestion();
    
    if (next) {
      setTarget(next);
      setSelected(null);
      setIsSpoiled(false);
      mapService.resetAllStyles();
    } else {
      showToast("No objects found!", "error");
    }
  }, [showToast]);

  const handleSelect = useCallback((feature: GeoFeature) => {
    setSelected(feature)
    
    if (mode === "quiz" && target) {
      if (feature.properties['@id'] === target.properties['@id']) {
        if (isSpoiled) {
          quizEngine.handleGiveUp(target)
          showToast("Found it! (No points for hints)", "success")
        } else {
          setScore(s => s + 1)
          showToast("Correct! +1", "success")
        }
        startNewQuestion()
      } else {
        showToast(`Nope, that's ${feature.properties.name}`, "error")
      }
    }
  }, [mode, target, isSpoiled, startNewQuestion, showToast])

  const handleShowHint = () => {
    if (target && target.properties['@id']) {
      setIsSpoiled(true)
      mapService.highlightFeatureById(target.properties['@id'], "#22c55e")
      mapService.zoomToFeatureById(target.properties['@id'])
    }
  }

  // Create a handler for region changes
  const handleRegionChange = (region: string) => {
    quizEngine.setRegion(region);
    mapService.renderFilteredFeatures(region);
    
    if (mode === "quiz") {
      startNewQuestion();
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden stylized" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Toast Notification */}
      {feedback && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-[2000] px-6 py-2 rounded-full shadow-2xl transition-all animate-bounce text-white font-bold ${
          feedback.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Header Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-4 header-toggle-container p-2 rounded-2xl shadow-xl border border-slate-200">
        <div className="flex p-1">
          <button 
            onClick={() => {
              setMode("learn");
              mapService.resetAllStyles();
              handleRegionChange("All");
            }}
            style = {{marginRight: '30px'}}
            className={`px-6 py-2 rounded-lg transition-all ${mode === "learn" ? "bg-white shadow text-blue-600 font-bold" : "text-slate-500"}`}
          >
            Learn
          </button>
          <button 
            onClick={() => { 
              setMode("quiz"); 
              startNewQuestion(); 
            }}
            className={`px-6 py-2 rounded-lg transition-all ${mode === "quiz" ? "bg-white shadow text-orange-500 font-bold" : "text-slate-500"}`}
          >
            Quiz
          </button>
        </div>
        {mode === "quiz" && <div className="pr-4 font-mono font-bold text-slate-700">Score: {score}</div>}
      </div>
      <div className="absolute top-4 right-4 z-[1000] bg-white p-2 rounded-xl shadow-lg border border-slate-200">
        <label className="text-xs font-bold text-slate-400 block mb-1 px-1 tracking-tighter">ИЗБЕРИ ОБЛАСТ</label>
        <select 
          onChange={(e) => handleRegionChange(e.target.value)}
          className="bg-slate-50 border-none text-sm font-bold text-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {regionList.map(region => (
            <option key={region} value={region}>{region}</option>
          ))}
        </select>
      </div>
      <div className="absolute bottom-5 right-1 z-[1000] bg-white p-3 rounded-xl shadow-lg border border-slate-200 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="showLabels" 
            checked={showLabels}
            onChange={(e) => {
              setShowLabels(e.target.checked);
              mapService.setTileLayer(e.target.checked);
            }}
            className="cursor-pointer w-4 h-4"
          />
          <label htmlFor="showLabels" className="text-xs font-bold text-slate-700 cursor-pointer">
            Show map labels
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="darkTiles" 
            checked={darkTiles}
            onChange={(e) => {
              setDarkTiles(e.target.checked);
              mapService.setDarkTiles(e.target.checked);
            }}
            className="cursor-pointer w-4 h-4"
          />
          <label htmlFor="darkTiles" className="text-xs font-bold text-slate-700 cursor-pointer">
            Dark map tiles
          </label>
        </div>
      </div>
      {/* Quiz Prompt */}
      {mode === "quiz" && target && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2 w-full max-w-xs">
          <div className="bg-white px-8 py-4 rounded-2xl border-b-4 border-orange-400 shadow-2xl text-center w-full">
            <p className="text-sm uppercase tracking-widest text-slate-400 font-bold">Намери обекта:</p>
            <p className="text-2xl font-black text-slate-800">{target.properties.name}</p>
          </div>
          <button 
            onClick={handleShowHint}
            className="bg-slate-800 text-dark text-xs px-4 py-1.5 rounded-full hover:bg-slate-700 transition-colors uppercase tracking-tighter"
          >
            Покажи (без точка)
          </button>
        </div>
      )}

      <MapView onFeatureSelect={handleSelect} />
      <InfoPanel feature={selected} />
    </div>
  )
}