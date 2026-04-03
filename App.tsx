// App.tsx
import { useState, useEffect, useCallback, useRef } from "react"
import MapView from "./components/MapView"
import InfoPanel from "./components/InfoPanel"
import { quizEngine } from "./services/quizEngine"
import { mapService } from "./services/mapService"
import type { GeoFeature } from "./types/geo"
import "./stylized.css"
import rawData from "./data/objects2_cleaned.json";
import villagesData from "./data/towns_cleaned.json";

export default function App() {
  const [mode, setMode] = useState<"learn" | "quiz">("learn")
  const [selected, setSelected] = useState<GeoFeature | null>(null)
  const [target, setTarget] = useState<GeoFeature | null>(null)
  const [score, setScore] = useState(0)
  const [isSpoiled, setIsSpoiled] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [regionList, setRegionList] = useState<string[]>(["All"])
  const [currentRegion, setCurrentRegion] = useState<string>("All")
  const [showLabels, setShowLabels] = useState(true)
  const [darkTiles, setDarkTiles] = useState(false)
  const [isDataReady, setIsDataReady] = useState(false);
  const loadedDataType = useRef<"Objects" | "Cities">("Objects");

  // initial data load for quizEngine and mapService
  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Feed the engines
        quizEngine.setFeatures(rawData);
        mapService.setRawData(rawData); 
        
        // 2. Set UI states
        const available = quizEngine.getAvailableRegions();
        setRegionList(["Градове 1", "Градове 2", "Градове 3", "Градове 4", "Градове 5", "Градове 6", "Градове 7", "Градове (257)", ...available]);
        
        // 3. THE KEY: Signal that the service is ready
        setIsDataReady(true); 
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    loadData();
  }, []);

  // keep mapService tile options in sync when toggles change
  useEffect(() => {
    // set tile layer / tiles theme if map already initialized
    mapService.setDarkTiles(darkTiles)
  }, [darkTiles])

  useEffect(() => {
    mapService.setTileLayer(showLabels)
  }, [showLabels])

  // toast helper
  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  // start a new quiz question
  const startNewQuestion = useCallback(() => {
    if (quizEngine.getPoolSize() === 0) quizEngine.setRegion(currentRegion || "All");
    const next = quizEngine.getNextQuestion();
    if (next) {
      setTarget(next);
      setSelected(null);
      setIsSpoiled(false);
      mapService.resetAllStyles();
    } else {
      showToast("Няма намерени обекти!", "error");
    }
  }, [currentRegion, showToast]);

  // feature selection handler (called by MapView -> mapService)
  const handleSelect = useCallback((feature: GeoFeature | null) => {
    setSelected(feature)
    if(!feature){
      return;
    }
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

  // show hint / reveal target feature
  const handleShowHint = () => {
    if (target?.properties['@id']) {
      setIsSpoiled(true)
      // highlight and zoom
      mapService.highlightFeatureById(target.properties['@id'])
      mapService.zoomToFeatureById(target.properties['@id'])
      // mark as given up in quiz engine (optional: you already handle this on correct click when spoiled)
      quizEngine.handleGiveUp(target)
    }
  }

  // region change from dropdowns
  const handleRegionChange = (region: string) => {
    const isCityRegion = region.startsWith("Градове");
    const currentlyLoaded = loadedDataType.current;

    if (isCityRegion && currentlyLoaded !== "Cities") {
      loadedDataType.current = "Cities";
      quizEngine.setFeatures(villagesData);
      mapService.setRawData(villagesData);
    } else if(!isCityRegion && currentlyLoaded !== "Objects") {
      loadedDataType.current = "Objects";
      quizEngine.setFeatures(rawData);
      mapService.setRawData(rawData);
    }
    setCurrentRegion(region)
    quizEngine.setRegion(region);
    mapService.renderFilteredFeatures(region);
    mapService.flyToRegion(region);
    if (mode === "quiz") startNewQuestion();
  };

  function formatName(name: string) {
    if (name === "Торфено бранище") {
      return <>Торфено <i>брани</i>ще</>
    } else if (name === "Резерват Бистришко бранище") {
      return <>Резерват Бистришко <i>брани</i>ще</>
    }
    return name
  }

  return (
    <div className="h-full w-full relative overflow-hidden stylized" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {feedback && (
        <div className={`absolute top-28 left-2/3 -translate-x-1/2 z-[2000] px-2 py-2 rounded-full shadow-2xl transition-all motion-safe:md:animate-bounce text-white font-bold text-center max-md:text-[10px] max-md:px-4 ${
          feedback.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {feedback.msg}
        </div>
      )}

      <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center header-toggle-container p-2 rounded-2xl shadow-xl border border-slate-200 mobile-no-bg transition-all duration-400 ease-in-out`}>
        <div className="flex p-1">
          <button 
            onClick={() => { setMode("learn"); mapService.resetAllStyles(); }}
            className={`px-6 py-2 rounded-lg mr-[30px] transition-all ${mode === "learn" ? "bg-white text-blue-600 font-bold" : "text-slate-500"}`}
          >
            Научи
          </button>
          <button 
            onClick={() => { setMode("quiz"); startNewQuestion(); }}
            className={`px-6 py-2 rounded-lg transition-all ${mode === "quiz" ? "bg-white text-orange-500 font-bold" : "text-slate-500"}`}
          >
            Тест
          </button>
        </div>
        <div 
          className={`grid transition-all duration-300 ease-in-out desktop-only ${
            mode === "quiz" ? "grid-cols-[1fr] opacity-100 ml-4" : "grid-cols-[0fr] opacity-0 ml-0 delay-200"
          }`}
        >
          <div className="overflow-hidden whitespace-nowrap font-mono font-bold text-slate-700 pr-4 ml-[4.5px]">
            Точки: {score}
          </div>
        </div>
      </div>

      {/* QUIZ PROMPTS */}
      <>
        {/* DESKTOP */}
        <div 
          className={`desktop-only absolute top-24 left-1/2 z-[1000] flex flex-col items-center gap-2 w-full max-w-xs transition-all duration-400 ease-out origin-top
            ${mode === "quiz" && target 
              ? "opacity-100 -translate-x-1/2 translate-y-0 pointer-events-auto delay-200" 
              : "opacity-0 -translate-x-1/2 -translate-y-6 scale-95 pointer-events-none"
            }`}
        >
          <div className="bg-white px-8 py-4 rounded-2xl border-b-4 shadow-2xl text-center w-full">
            <p className="text-sm uppercase tracking-widest text-slate-400 font-bold">Намери обекта</p>
            <p className="text-2xl font-black text-slate-800">
              {target ? formatName(target.properties.name) : "..."}
            </p>
          </div>
          <button 
            onClick={handleShowHint} 
            className="bg-slate-800 text-white text-xs px-4 py-1.5 rounded-full hover:bg-slate-700 transition-colors uppercase tracking-tighter"
          >
            Покажи (без точка)
          </button>
        </div>

        {/* MOBILE */}
        <div 
          className={`mobile-only fixed top-20 left-1/2 w-[95%] z-[1000] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
            ${mode === "quiz" && target 
              ? "opacity-100 -translate-x-1/2 pointer-events-auto" 
              : "opacity-0 -translate-x-[150%] pointer-events-none"
            }`}
        >
          <div className="bg-[#281e3f] w-full p-2 border-b-2 border-[#a24e53] flex items-center justify-between gap-2 shadow-2xl">
            <span className="text-sm font-black truncate text-white"> 
              {target ? formatName(target.properties.name) : "..."} 
            </span>
            <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-[10px] bg-black/40 px-1 py-0.5 text-white">
                  Точки: {score}
                </span>
                <button 
                  onClick={handleShowHint} 
                  className="bg-[#a24e53] text-white text-[9px] px-2 py-1 uppercase font-bold border border-[#73374e] active:scale-95 transition-transform"
                >
                  Покажи
                </button>
            </div>
          </div>
        </div>
      </>

      {/* DESKTOP REGION SELECTOR */}
      <div className="desktop-only absolute top-4 right-4 z-[1000] bg-white p-2 rounded-xl shadow-lg border border-slate-200">
        <label className="text-xs font-bold text-slate-400 block mb-1 px-1 tracking-tighter uppercase" aria-label="Избери област">ИЗБЕРИ ОБЛАСТ</label>
        <select
          value={currentRegion}
          onChange={(e) => handleRegionChange(e.target.value)}
          className="bg-slate-50 border-none text-sm font-bold text-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {regionList.map(region => <option key={region} value={region}>{region}</option>)}
        </select>
      </div>

      {/* DESKTOP SETTINGS */}
      <div className="desktop-only absolute bottom-5 right-1 z-[1000] bg-white p-3 rounded-xl shadow-lg border border-slate-200 flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="showLabels" checked={showLabels} onChange={(e) => { setShowLabels(e.target.checked); }} className="cursor-pointer w-4 h-4" />
          <label htmlFor="showLabels" className="text-xs font-bold text-slate-700 cursor-pointer">Наименования</label>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="darkTiles" checked={darkTiles} onChange={(e) => { setDarkTiles(e.target.checked); }} className="cursor-pointer w-4 h-4" />
          <label htmlFor="darkTiles" className="text-xs font-bold text-slate-700 cursor-pointer">Тъмна карта</label>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="mobile-only absolute bottom-0 left-0 w-full z-[1000] bg-[#281e3f] border-t-2 border-[#3a2444] px-2 py-2 flex items-center justify-between gap-1 mobile-safe-bottom">
        <select 
          value={currentRegion}
          onChange={(e) => handleRegionChange(e.target.value)}
          className="bg-[#140e1e] text-[11px] font-normal p-2 border border-[#3a2444] flex-1 min-w-0 text-[#ffecd6]"
        >
          {regionList.map(region => <option key={region} value={region}>{region}</option>)}
        </select>

        <div className="flex shrink-0 items-center gap-2 justify-end pl-1">
          <div className="flex items-center gap-1">
            <input type="checkbox" id="m-labels" checked={showLabels} onChange={(e) => {setShowLabels(e.target.checked)}} className="w-3.5 h-3.5" />
            <label htmlFor="m-labels" className="text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap">Наименования</label>
          </div>
          <div className="flex items-center gap-1">
            <input type="checkbox" id="m-dark" checked={darkTiles} onChange={(e) => {setDarkTiles(e.target.checked)}} className="w-3.5 h-3.5" />
            <label htmlFor="m-dark" className="text-[9px] font-bold uppercase tracking-tighter whitespace-nowrap">Тъмно</label>
          </div>
        </div>
      </div>

      {/* <MapView onFeatureSelect={handleSelect} /> */ /* OLD CODE*/}
      {/* Only mount MapView when data is actually indexed and ready */}
      {isDataReady ? (
        <MapView onFeatureSelect={handleSelect} />
      ) : (
        <div className="loading-screen">Preparing Geographic Data...</div>
      )}

      <div className="info-panel-mobile-container">
        <InfoPanel feature={selected} />
      </div>
    </div>
  )
}