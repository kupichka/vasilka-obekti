// App.tsx
import { useState, useEffect, useCallback, useRef } from "react"
import MapView from "./components/MapView"
import InfoPanel from "./components/InfoPanel"
import { quizEngine } from "./services/quizEngine"
import { mapService } from "./services/mapService"
import type { GeoFeature } from "./types/geo"
// import { ALL_REGIONS } from "./types/geo"
import "./stylized.css"
import rawData from "./data/objects2_cleaned.json";
import villagesData from "./data/towns_cleaned.json";

// Helper to validate mode
const getSavedMode = (): "learn" | "quiz" => {
  const saved = localStorage.getItem("vasilka_mode");
  return (saved === "learn" || saved === "quiz") ? saved : "learn";
};

// Helper to validate region
const getSavedRegions = (): string[] => {
  const saved = localStorage.getItem("vasilka_regions");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  // Fallback to old single region save
  const oldSaved = localStorage.getItem("vasilka_region");
  return oldSaved ? [oldSaved] : ["All"];
};

const getSavedScore = (): number => {
  const saved = localStorage.getItem("vasilka_score");
  return saved ? parseInt(saved, 10) : 0;
};

const getDarkTiles = (): boolean => {
  const saved = localStorage.getItem("vasilka_tiles");
  return saved === "true";
};

const getLabels = (): boolean => {
  const saved = localStorage.getItem("vasilka_labels");
  return saved !== "false";
};

const REGION_CATEGORIES = {
  "Градове": [
    "Градове 1", "Градове 2", "Градове 3", "Градове 4", "Градове 5", 
    "Градове 6", "Градове 7"
  ],
  "Физико-географски региони": [
    "Дунавска равнина", "Предбалкан", "Стара планина", "Задбалкански котловини", 
    "Краище", "Осоговско-Беласишка", "Средногорие", "Рила", "Пирин", 
    "Родопи", "Тракийско-Странджанска", "Черноморска"
  ],
  "Други": [
    "Защитени области (27)", "Реки (32)"
  ]
};

const ALL_CITIES = REGION_CATEGORIES["Градове"];
const ALL_GEO = [...REGION_CATEGORIES["Физико-географски региони"], ...REGION_CATEGORIES["Други"]];

export default function App() {
  const [mode, setMode] = useState<"learn" | "quiz">(getSavedMode)

  const initialSavedRegions = getSavedRegions().filter(r => r !== "All" && r !== "Градове (257)");
  const isInitialCities = initialSavedRegions.some(r => r.startsWith("Градове"));

  const [activeTab, setActiveTab] = useState<"geo" | "cities">(isInitialCities ? "cities" : "geo");
  const [currentRegions, setCurrentRegions] = useState<string[]>(initialSavedRegions.length > 0 ? initialSavedRegions : ALL_GEO);
  
  // Memories for remembering selections when toggling categories
  const [geoHistory, setGeoHistory] = useState<string[]>(isInitialCities ? ALL_GEO : (initialSavedRegions.length ? initialSavedRegions : ALL_GEO));
  const [cityHistory, setCityHistory] = useState<string[]>(isInitialCities && initialSavedRegions.length ? initialSavedRegions : ALL_CITIES);
  
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [selected, setSelected] = useState<GeoFeature | null>(null)
  const [target, setTarget] = useState<GeoFeature | null>(null)
  const [score, setScore] = useState<number>(getSavedScore)
  const [isSpoiled, setIsSpoiled] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [showLabels, setShowLabels] = useState<boolean>(getLabels)
  const [darkTiles, setDarkTiles] = useState<boolean>(getDarkTiles)
  const [isDataReady, setIsDataReady] = useState(false);
  const loadedDataType = useRef<"Objects" | "Cities">("Objects");
  const [showAbout, setShowAbout] = useState(false);

  // initial data load for quizEngine and mapService
  useEffect(() => {
    const loadData = async () => {
      try {
        const isAll = currentRegions.includes("All");
        const hasCities = currentRegions.some(r => r.startsWith("Градове"));
        const hasObjects = currentRegions.some(r => !r.startsWith("Градове") && r !== "All");

        // Merge datasets if both are selected, otherwise pick the right one
        let initialData: any = rawData; // Use 'any' to avoid strict TopoJSON shape mismatches
        if (hasCities && !hasObjects && !isAll) {
          initialData = villagesData;
        } else if (hasCities && hasObjects) {
          initialData = {
            ...rawData,
            objects: {
              ...rawData.objects,
              ...villagesData.objects
            }
          };
        }

        quizEngine.setFeatures(initialData);
        mapService.setRawData(initialData);
        
        // Pass the ARRAY of regions to the engines
        quizEngine.setRegions(currentRegions);
        mapService.renderFilteredFeatures(currentRegions);

        setIsDataReady(true); 

        if (mode === "quiz"){
          const next = quizEngine.getNextQuestion();
          if (next) setTarget(next);
        }
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
    localStorage.setItem("vasilka_tiles", darkTiles.toString());
  }, [darkTiles])

  useEffect(() => {
    mapService.setTileLayer(showLabels)
    localStorage.setItem("vasilka_labels", showLabels.toString());
  }, [showLabels])

  useEffect(() => {
    localStorage.setItem("vasilka_mode", mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem("vasilka_regions", JSON.stringify(currentRegions));
  }, [currentRegions]);

  useEffect(() => {
    localStorage.setItem("vasilka_score", score.toString());
  }, [score]);

  // toast helper
  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setFeedback({ msg, type })
    setTimeout(() => setFeedback(null), 2000)
  }, [])

  // start a new quiz question
  const startNewQuestion = useCallback((regionsToUse?: string[]) => {
    const regions = regionsToUse || currentRegions;

    if (quizEngine.getPoolSize() === 0 && regions.length > 0) {
      quizEngine.setRegions(regions);
    }
    
    const next = quizEngine.getNextQuestion();
    if (next) {
      setTarget(next);
      setSelected(null);
      setIsSpoiled(false);
      mapService.resetAllStyles();
    } else {
      showToast("Няма избрани обекти!", "error");
      setTarget(null);
    }
  }, [currentRegions, showToast]);

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
        showToast(`Не, това е/са ${feature.properties.name}`, "error")
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

  // Handle manual tab switching via the radio buttons
  const handleTabChange = (tab: "geo" | "cities") => {
    if (activeTab === tab) return;

    setActiveTab(tab);
    const newRegions = tab === "cities" ? [...cityHistory] : [...geoHistory];
    setCurrentRegions(newRegions);

    const dataset = tab === "cities" ? villagesData : rawData;
    loadedDataType.current = tab === "cities" ? "Cities" : "Objects";
    
    quizEngine.setFeatures(dataset);
    mapService.setRawData(dataset);

    quizEngine.setRegions(newRegions);
    mapService.renderFilteredFeatures(newRegions);
    
    if (newRegions.length > 0) {
      mapService.flyToRegions(newRegions);
    }

    if (mode === "quiz") startNewQuestion(newRegions);
  };

  // region change from dropdowns
  const handleToggleRegion = (region: string) => {
    const isCityRegion = ALL_CITIES.includes(region) || region.startsWith("Градове");
    const targetTab = isCityRegion ? "cities" : "geo";
    
    let baseRegions: string[] = [];
    
    // Auto-switch tabs if clicked element is from the inactive category
    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
      baseRegions = targetTab === "cities" ? [...cityHistory] : [...geoHistory];
      
      const dataset = targetTab === "cities" ? villagesData : rawData;
      loadedDataType.current = targetTab === "cities" ? "Cities" : "Objects";
      quizEngine.setFeatures(dataset);
      mapService.setRawData(dataset);
    } else {
      baseRegions = [...currentRegions];
    }

    let newRegions: string[] = [];
    if (baseRegions.includes(region)) {
      newRegions = baseRegions.filter(r => r !== region);
    } else {
      newRegions = [...baseRegions, region];
    }

    setCurrentRegions(newRegions);
    if (targetTab === "geo") setGeoHistory(newRegions);
    else setCityHistory(newRegions);

    quizEngine.setRegions(newRegions);
    mapService.renderFilteredFeatures(newRegions);
    
    if (newRegions.length > 0) {
      mapService.flyToRegions(newRegions);
    }
    
    if (mode === "quiz") startNewQuestion(newRegions);
  };

  const handleToggleAll = (tab: "geo" | "cities") => {
    const allItems = tab === "geo" ? ALL_GEO : ALL_CITIES;
    let newRegions: string[] = [];
    
    if (activeTab !== tab) {
      // If switching tabs via the "All" button, activate that tab and select everything
      setActiveTab(tab);
      const dataset = tab === "cities" ? villagesData : rawData;
      loadedDataType.current = tab === "cities" ? "Cities" : "Objects";
      quizEngine.setFeatures(dataset);
      mapService.setRawData(dataset);
      
      newRegions = [...allItems];
    } else {
      // Toggle logic for the currently active tab
      const isAllSelected = allItems.every(r => currentRegions.includes(r));
      newRegions = isAllSelected ? [] : [...allItems];
    }
    
    setCurrentRegions(newRegions);
    if (tab === "geo") setGeoHistory(newRegions);
    else setCityHistory(newRegions);

    quizEngine.setRegions(newRegions);
    mapService.renderFilteredFeatures(newRegions);
    
    if (newRegions.length > 0) {
      mapService.flyToRegions(newRegions);
    }
    
    if (mode === "quiz") startNewQuestion(newRegions);
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
        <div className={`absolute top-28 left-2/3 -translate-x-1/2 z-[2000] px-2 py-2 shadow-2xl transition-all motion-safe:md:animate-bounce text-white font-bold text-center max-md:text-[10px] max-md:px-4 ${
          feedback.type === "success" ? "bg-green-500" : "bg-red-500"
        }`}>
          {feedback.msg}
        </div>
      )}

      <div className={`absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center header-toggle-container p-2 border border-slate-200 mobile-no-bg transition-all duration-400 ease-in-out z-10`}>
        <div className="flex p-1">
          <button 
            onClick={() => { setMode("learn"); mapService.resetAllStyles(); }}
            className={`px-6 py-2 mr-[30px] transition-all ${mode === "learn" ? "bg-white text-blue-600 font-bold" : "text-slate-500"}`}
          >
            Научи
          </button>
          <button 
            onClick={() => { setMode("quiz"); startNewQuestion(); }}
            className={`px-6 py-2 transition-all ${mode === "quiz" ? "bg-white text-orange-500 font-bold" : "text-slate-500"}`}
          >
            Тест
          </button>
        </div>
        <div 
          className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out desktop-only ${
            mode === "quiz" 
              ? "w-[90px] opacity-100 ml-4" 
              : "w-0 opacity-0 ml-0 pointer-events-none delay-200"
          }`}
        >
          <div className="whitespace-nowrap font-mono font-bold text-slate-700 pl-1">
            Точки: {score}
          </div>
        </div>
      </div>

      {/* QUIZ PROMPTS */}
      <>
        {/* DESKTOP */}
        <div 
          className={`desktop-only absolute top-20 left-1/2 z-[1000] flex flex-col items-center gap-2 w-full max-w-xs transition-all duration-400 ease-out origin-top z-5
            ${mode === "quiz" && target 
              ? "opacity-100 -translate-x-1/2 translate-y-0 pointer-events-auto delay-200" 
              : "opacity-0 -translate-x-1/2 -translate-y-6 scale-95 pointer-events-none"
            }`}
        >
          <div className="bg-white px-8 py-4 border-b-4 shadow-2xl text-center w-full">
            <p className="text-sm uppercase tracking-widest text-slate-400 font-bold">Намери обекта</p>
            <p className="text-2xl font-black text-slate-800">
              {target ? formatName(target.properties.name) : "..."}
            </p>
          </div>
          <button 
            onClick={handleShowHint} 
            className="bg-slate-800 text-white text-xs px-4 py-1.5 hover:bg-slate-700 transition-colors uppercase tracking-tighter"
          >
            Покажи (без точка)
          </button>
        </div>

        {/* MOBILE */}
        <div 
          className={`mobile-only fixed top-16 left-1/2 w-[calc(100%-1rem)] z-[1000] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
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

      {/* The Trigger Button (Top Right) */}
      <button 
        onClick={() => setShowRegionModal(true)}
        className="absolute top-3 right-3 z-[1000] p-2.5 rounded-xl shadow-lg border border-slate-200 bg-white/90 text-slate-700 backdrop-blur-md hover:bg-slate-50 transition-all duration-200"
        aria-label="Настройки и филтри"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 12 12 17 22 12"></polyline>
          <polyline points="2 17 12 22 22 17"></polyline>
        </svg>
      </button>

      {/* The Modal Overlay */}
      <div 
        className={`fixed inset-0 z-[2000] bg-slate-950/30 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200 ${
          showRegionModal ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setShowRegionModal(false)}
      >
        <div 
          className="backdrop-blur-md p-5 sm:p-6 rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto relative shadow-xl scrollbar-thin stylized border-[3px] border-[#4e204c]"
          onClick={(e) => e.stopPropagation()} 
        >
          {/* Close Button */}
          <button 
            className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-50"
            onClick={() => setShowRegionModal(false)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <header className="mb-5 border-b-2 border-[#4e204c] pb-3">
            <h2 className="text-xl font-bold tracking-wide text-slate-800">
              Области
            </h2>
          </header>

          <div className="flex flex-col gap-4">
            
            {/* ================= REGIONS FILTER GROUP ================= */}
            <section className="flex flex-col gap-5">

              {/* --- 1. CITIES --- */}
              <div className="transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input 
                      type="radio" 
                      name="datasetTab" 
                      checked={activeTab === "cities"} 
                      onChange={() => handleTabChange("cities")} 
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500/30 accent-blue-600 cursor-pointer" 
                    />
                    <h3 className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                      activeTab === "cities" ? "text-slate-800" : "text-slate-400 group-hover:text-slate-600"
                    }`}>
                      Градове
                    </h3>
                  </label>
                  <button 
                    onClick={() => handleToggleAll("cities")}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full transition-all text-red ${
                      activeTab === "cities" && ALL_CITIES.every(r => currentRegions.includes(r))
                        ? 'bg-blue-600 text-white shadow-sm font-bold' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200'
                    }`}
                  >
                    Всички (257)
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {REGION_CATEGORIES["Градове"].map(region => {
                    const isSelected = activeTab === "cities" && currentRegions.includes(region);
                    return (
                      <button
                        key={region}
                        onClick={() => handleToggleRegion(region)}
                        className={`text-[12px] px-2.5 py-1 rounded-md border transition-all duration-150 ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                            : 'bg-[#12121a] border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="grid place-items-center">
                          {/* This invisible bold text forces the button to always be "bold width" */}
                          <span className="invisible font-bold col-start-1 row-start-1">
                            {region}
                          </span>
                          
                          {/* This is the actual visible text that toggles weights */}
                          <span className={`col-start-1 row-start-1 transition-all duration-150 ${isSelected ? 'font-bold' : 'font-medium'}`}>
                            {region}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* --- 2. PHYSICAL-GEOGRAPHICAL REGIONS --- */}
              <div className="transition-all duration-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input 
                      type="radio" 
                      name="datasetTab" 
                      checked={activeTab === "geo"} 
                      onChange={() => handleTabChange("geo")} 
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500/30 accent-emerald-600 cursor-pointer" 
                    />
                    <h3 className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                      activeTab === "geo" ? "text-slate-800" : "text-slate-400 group-hover:text-slate-600"
                    }`}>
                      Географски региони
                    </h3>
                  </label>
                  <button 
                    onClick={() => handleToggleAll("geo")}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full transition-all ${
                      activeTab === "geo" && ALL_GEO.every(r => currentRegions.includes(r))
                        ? 'bg-emerald-600 text-white shadow-sm font-bold' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-200'
                    }`}
                  >
                    Всички
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {REGION_CATEGORIES["Физико-географски региони"].map(region => {
                    const isSelected = activeTab === "geo" && currentRegions.includes(region);
                    return (
                      <button
                        key={region}
                        onClick={() => handleToggleRegion(region)}
                        className={`text-[12px] px-2.5 py-1 rounded-md border transition-all duration-150 ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="grid place-items-center">
                          {/* Invisible bold block to hold the width */}
                          <span className="invisible font-bold col-start-1 row-start-1">
                            {region}
                          </span>
                          
                          {/* Visible toggling text */}
                          <span className={`col-start-1 row-start-1 transition-all duration-150 ${isSelected ? 'font-bold' : 'font-medium'}`}>
                            {region}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-regions (Others) */}
                <div className="mt-3 pl-6 flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Допълнителни подкатегории</span>
                  <div className="flex flex-wrap gap-1.5">
                    {REGION_CATEGORIES["Други"].map(region => {
                      const isSelected = activeTab === "geo" && currentRegions.includes(region);
                      return (
                        <button
                          key={region}
                          onClick={() => handleToggleRegion(region)}
                          className={`text-[11px] px-2.5 py-0.5 rounded border transition-all duration-150 font-medium ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm' 
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {region}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

            </section>

            {/* Subtle Divider */}
            <div className="h-[2px] w-full bg-[#4e204c]"></div>

            {/* ================= VIEW SETTINGS ================= */}
            <section className="rounded-xl">
              <h4 className="text-[10px] font-bold text-[#ffecd6]/70 uppercase tracking-wider mb-2.5 px-0.5">
                Настройки за картата
              </h4>
              
              <div className="flex flex-wrap gap-x-5 gap-y-2 px-0.5">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={showLabels} 
                    onChange={(e) => setShowLabels(e.target.checked)} 
                    className="w-4 h-4 rounded border-[#ffecd6]/30 bg-black/20 focus:ring-[#ffecd6]/30 accent-[#ffecd6] cursor-pointer" 
                  />
                  <span className={`text-xs font-semibold select-none transition-colors ${
                    showLabels ? 'text-[#ffecd6]' : 'text-[#ffecd6]/50 group-hover:text-[#ffecd6]/80'
                  }`}>
                    Наименования
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={darkTiles} 
                    onChange={(e) => setDarkTiles(e.target.checked)} 
                    className="w-4 h-4 rounded border-[#ffecd6]/30 bg-black/20 focus:ring-[#ffecd6]/30 accent-[#ffecd6] cursor-pointer" 
                  />
                  <span className={`text-xs font-semibold select-none transition-colors ${
                    darkTiles ? 'text-[#ffecd6]' : 'text-[#ffecd6]/50 group-hover:text-[#ffecd6]/80'
                  }`}>
                    Тъмна
                  </span>
                </label>
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* Only mount MapView when data is actually indexed and ready */}
      {isDataReady ? (
        <MapView onFeatureSelect={handleSelect} />
      ) : (
        <div className="loading-screen">Preparing Geographic Data...</div>
      )}

      <InfoPanel feature={selected} />

      {/* Info button - Positioned top-left */}
      <button 
        onClick={() => setShowAbout(true)}
        className="absolute top-3 left-3 z-[1000] p-2.5 rounded-xl shadow-lg border border-slate-200 bg-white/90 text-slate-700 backdrop-blur-md hover:bg-slate-50 transition-all duration-200"
        aria-label="Show Information"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>

      {/* The About Panel Overlay */}
      <div 
        className={`fixed inset-0 z-[2000] bg-slate-950/30 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-200 ${
          showAbout ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setShowAbout(false)} // Close when clicking backdrop
      >
        <div 
          className="backdrop-blur-md p-5 rounded-xl max-w-lg relative shadow-xl stylized border-[3px] border-[#4e204c]"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the box itself
        >
          <button 
            className="absolute top-2 right-5 text-3xl text-slate-400 hover:text-slate-600 !border-none !shadow-none !bg-none"
            onClick={() => setShowAbout(false)}
          >
            &times;
          </button>

          <div className="space-y-2 selection:bg-blue-100">
            {/* Header Section */}
            <header className="border-b-2 border-[#4e204c] pb-3">
              <h2 className="text-xl font-black uppercase tracking-wider text-blue-700">
                Гео Обекти
              </h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">
                Образователен инструмент за НПМГ
              </p>
            </header>

            {/* Main Description */}
            <section className="text-sm leading-relaxed">
              <p>
                <strong className="text-slate-900">Гео Обекти</strong> (достъпен на <a href="https://vasilka.kupichka.org" className="text-blue-600 hover:underline font-medium">vasilka.kupichka.org</a>) е специализирана платформа за усвояване на географската номенклатура на България. Проектът е създаден за подготовка за изпитването в <strong className="text-slate-900">10. клас</strong> по география, включващ 250-те задължителни природни обекта.
              </p>
            </section>

            {/* Scope / List Section */}
            <section>
              <h3 className="font-bold">Обхват на сайта:</h3>
              <ul className="list-disc ml-5 space-y-1 text-sm">
                <li><strong>250+ природни обекта:</strong> Разделени по физико-географски области (Дунавска равнина, Стара планина, Рила, Пирин, Родопи и др.)</li>
                <li><strong>Специализирани подкатегории:</strong> Защитени територии и реки от 250те обекта.</li>
                <li><strong>Градове в България:</strong> Пълен списък от 257 града, организирани в 7 региона за по-лесно запаметяване.</li>
              </ul>
            </section>

            {/* Author Attribution */}
            <footer className="pt-2">
              <p className="text-sm">
                Разработено от <strong className="text-slate-900">Борислав Дочев</strong> от <strong>НПМГ</strong> за подпомагане на интерактивното обучение по география.
              </p>
              
              <div className="mt-4 pt-4 border-t-2 border-[#4e204c] flex justify-between items-center text-[10px] tracking-widest text-slate-400 font-bold">
                <span>Данни: OpenStreetMap</span>
                <span>Source code: <a href="https://github.com/kupichka/vasilka-obekti" target="_blank" className="text-blue-600 hover:underline font-medium">GitHub</a></span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  )
}