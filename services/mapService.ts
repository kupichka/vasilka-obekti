// mapService.ts
import L from "leaflet";
import geojsonvtModule from "geojson-vt";
import RBush from "rbush";
import type { GeoFeature } from "../types/geo";
import * as topojson from "topojson-client";

const geojsonvt = (geojsonvtModule as any).default || geojsonvtModule;
interface SpatialItem {
  minX: number; minY: number; maxX: number; maxY: number;
  feature: GeoFeature;
}

class MapService {
  private map?: L.Map;
  private tileLayer?: L.GridLayer;
  private tileIndex: any;
  private spatialIndex = new RBush<SpatialItem>();
  private onFeatureClick?: (feature: GeoFeature) => void;

  private featureMap = new Map<string, GeoFeature>();
  private selectedFeatureId: string | null = null;
  private highlightedFeatureId: string | null = null; 
  private hoveredFeatureId: string | null = null; 

  private filteredIds = new Set<string>();
  private currentRegion: string = "All";

  private darkTiles: boolean = true;
  private showLabels: boolean = true;
  private pendingRedraw = false;

  private mouseMoveThrottle = 40; 
  private lastMouseMove = 0;

  private logEnter(fn: string) {
    console.log(`entered function ${fn}`);
  }

  private logExit(fn: string, reason: string) {
    console.log(`exited function ${fn}: ${reason}`);
  }

  private getFeatureId(f: GeoFeature): string {
    this.logEnter("getFeatureID");
    if ((f as any)._id) return (f as any)._id;
    const id = f.properties?.['@id'] || f.id || (f as any)._internalId;
    return id ? id.toString() : `gen-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getThemeColors() {
    this.logEnter("getThemeColors");
    return {
      primary: this.darkTiles ? "#60a5fa" : "#2563eb",
      fill: "rgba(59, 130, 246, 0.35)",
      outline: this.darkTiles ? "rgba(96, 165, 250, 0.6)" : "rgba(37, 99, 235, 0.6)",
      highlight: "#22c55e",
      selected: "#f97316",
    };
  }

  public setFeatureClickHandler(handler: (feature: GeoFeature) => void) {
    this.logEnter("setFeatureClickHandler");
    this.onFeatureClick = handler;
  }

  init(container: HTMLDivElement, center: [number, number], zoom: number) {
    this.logEnter("init");
    if (this.map){ 
      this.logExit("init", "map already initialized?");
      return;
    }
    this.map = L.map(container, { center, zoom, minZoom: 8, maxZoom: 18,
      // maxBounds: [
      //   [39.8, 20.5],  // southwest
      //   [45.5, 30.2]   // northeast
      // ],
      // maxBoundsViscosity: 0.754
    });
    
    // Kept the pane just in case you add tooltips or other standard Leaflet overlays later
    if (!this.map.getPane('featurePane')) {
      const fp = this.map.createPane('featurePane');
      fp.style.zIndex = '650'; 
      fp.style.pointerEvents = 'none'; 
    }

    this.setTileLayer(this.showLabels);

    this.map.on("click", (e: L.LeafletMouseEvent) => {
      const feature = this.findFeatureAt(e.latlng.lat, e.latlng.lng);
      if (feature) {
        this.selectedFeatureId = this.getFeatureId(feature);
        this.onFeatureClick?.(feature);
        this.updateHighlightLayer();
      }
    });

    this.map.on("mousemove", (e: L.LeafletMouseEvent) => {
      const now = performance.now();
      if (now - this.lastMouseMove < this.mouseMoveThrottle) return;
      this.lastMouseMove = now;

      const feature = this.findFeatureAt(e.latlng.lat, e.latlng.lng);
      const id = feature ? this.getFeatureId(feature) : null;
      if (this.hoveredFeatureId !== id) {
        this.hoveredFeatureId = id;
        if (this.map) this.map.getContainer().style.cursor = id ? 'pointer' : '';
        this.updateHighlightLayer();
      }
    });
    this.logExit("init", "end of function");
  }

  private isReady=false;

  setRawData(topoData: any) {
    this.logEnter("setRawData");
    try {
      this.featureMap.clear();
      this.spatialIndex.clear();
      const items: SpatialItem[] = [];
      const allFeatures: any[] = [];
      
      let globalIndex = 0;

      Object.keys(topoData.objects).forEach((layerName) => {
          const data = topojson.feature(topoData, topoData.objects[layerName]) as any;
          const layerFeatures = data.features || (data.geometry ? [data] : []);

          layerFeatures.forEach((f: GeoFeature) => {
              // MATCHING LOGIC: Use the same ID generation as QuizEngine
              const existingId = f.properties?.['@id'] || f.id;
              const stableId = existingId ? existingId.toString() : `feat-${layerName}-${globalIndex}`;
              
              // Inject IDs everywhere to be safe
              (f as any)._id = stableId;
              if (!f.properties) f.properties = {} as any; 
              f.properties['@id'] = stableId; // Sync with QuizEngine
              f.properties.__id = stableId;  // For geojson-vt tags

              this.featureMap.set(stableId, f);
              allFeatures.push(f);

              const tempLayer = L.geoJSON(f);
              const bounds = tempLayer.getBounds();
              if (bounds.isValid()) {
                  items.push({ 
                      minX: bounds.getWest(), minY: bounds.getSouth(), 
                      maxX: bounds.getEast(), maxY: bounds.getNorth(), 
                      feature: f 
                  });
              }
              globalIndex++;
          });
      });
      
      this.spatialIndex.load(items);
      const combinedGeoJSON = {
        type: "FeatureCollection",
        features: allFeatures
      };

      this.tileIndex = geojsonvt(combinedGeoJSON, { 
        maxZoom: 18, 
        indexMaxZoom: 18, 
        tolerance: 5, 
        extent: 4096, 
        buffer: 128 
      });
      this.setRegion("All");
      this.isReady = true;

      if (this.map && !this.tileLayer) {
        console.log("Data arrived late, triggering loadGeoJSON now");
        this.loadGeoJSON();
      }
    } catch (e){
      console.error("Critical error indexing GeoJSON:", e);
      this.logExit("setRawData", "exception occured");
    } 
  }

  private drawTileCanvas(canvas: HTMLCanvasElement, coords: L.Coords) {
    this.logEnter("drawTileCanvas");
    if (!this.isReady || !this.tileIndex){
      this.logExit("drawTileCanvas", "data isn't ready or tileIndex is evil");
      return;
    }
    const size = 256;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    console.log("REQUESTING TILE AT Z:", coords.z);
    const vtTile = this.tileIndex.getTile(coords.z, coords.x, coords.y);
    if (!vtTile) {
      this.logExit("drawTileCanvas", "vtTile is stupid");
      ctx.restore();
      return;
    }

    // TILE SEAMS FIX: Strict clipping mask
    ctx.beginPath();
    ctx.rect(-0.5, -0.5, size + 1, size + 1);
    ctx.clip();

    ctx.lineJoin = 'round'; 
    ctx.lineCap = 'round';
    const colors = this.getThemeColors();

    const renderFeature = (feature: any, isActive: boolean, isSelected: boolean) => {
      let currentFill = colors.fill;
      let currentOutline = colors.outline;
      let currentLineWidth = 1;

      if (isActive) {
        if (isSelected) {
          currentOutline = colors.selected;
          currentFill = "rgba(249, 115, 22, 0.4)"; 
          currentLineWidth = 2.5;
        } else {
          currentOutline = colors.highlight;
          currentFill = "rgba(34, 197, 94, 0.4)";
          currentLineWidth = 2;
        }
      } else if (feature.type === 2) {
        currentOutline = colors.primary;
        currentLineWidth = 1.5;
      }

      if (feature.type === 1) { // Points
        ctx.fillStyle = currentFill;
        ctx.strokeStyle = currentOutline;
        ctx.lineWidth = currentLineWidth;

        for (const p of feature.geometry) {
          const px = (p[0] / 4096) * size;
          const py = (p[1] / 4096) * size;
          
          ctx.beginPath();
          ctx.arc(px, py, isActive ? 8 : 6, 0, Math.PI * 2); 
          ctx.fill();
          ctx.stroke();
        }
        return;
      }

      ctx.beginPath();
      for (const ring of feature.geometry) {
        for (let i = 0; i < ring.length; i++) {
          const x = (ring[i][0] / 4096) * size;
          const y = (ring[i][1] / 4096) * size;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }

      if (feature.type === 3) { // Polygon
        ctx.fillStyle = currentFill;
        ctx.fill();
        ctx.strokeStyle = currentOutline;
        ctx.lineWidth = currentLineWidth;
        ctx.stroke();
      } else if (feature.type === 2) { // LineString
        ctx.strokeStyle = currentOutline;
        ctx.lineWidth = currentLineWidth;
        ctx.stroke();
      }
    };

    // TWO-PASS RENDER FIX
    const activeFeatures: any[] = [];

    for (const feature of vtTile.features) {
      const vid = feature.tags?.['@id']?.toString() || feature.id?.toString() || feature.tags?.__id?.toString();
      const isFiltered = this.currentRegion !== "All" && (!vid || !this.filteredIds.has(vid));
      if (isFiltered) continue;

      const isSelected = vid === this.selectedFeatureId;
      const isHighlighted = vid === this.highlightedFeatureId;
      const isHovered = vid === this.hoveredFeatureId;
      const isActive = isSelected || isHighlighted || isHovered;

      if (isActive) {
        activeFeatures.push({ feature, isSelected });
      } else {
        renderFeature(feature, false, false);
      }
    }

    // Draw active features on top
    for (const item of activeFeatures) {
      renderFeature(item.feature, true, item.isSelected);
    }
    
    ctx.restore();
    this.logExit("drawTileCanvas", "function end");
  }

  loadGeoJSON() {
    this.logEnter("loadGeoJSON");
    if (!this.map || !this.tileIndex){
      this.logExit("loadGeoJSON", "map isn't here or tileIndex is evil");
      return;
    }
    if (this.tileLayer){
      console.log("loadGeoJSON: remove tile layer");
      this.map.removeLayer(this.tileLayer);
    }

    const CanvasLayer = L.GridLayer.extend({
      options: {
        pane: "overlayPane",
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 6
      },
      createTile: (coords: L.Coords, done: any) => {
        const tile = document.createElement('canvas') as HTMLCanvasElement;
        const size = 256;
        const dpr = window.devicePixelRatio || 1;
        tile.width = size * dpr; tile.height = size * dpr;
        tile.style.width = `${size}px`; tile.style.height = `${size}px`;

        setTimeout(() => {
          this.drawTileCanvas(tile, coords);
          done(null, tile);
        }, 0);
        
        return tile;
      }
    });

    this.tileLayer = new (CanvasLayer as any)().addTo(this.map);
    this.logExit("loadGeoJSON", "function end");
  }

  setTileLayer(showLabels: boolean) {
    this.logEnter("setTileLayer");
    this.showLabels = showLabels;
    if (!this.map){
      this.logExit("setTileLayer", "map is evil?");
      return;
    }
    this.map.eachLayer(l => { if (l instanceof L.TileLayer) this.map?.removeLayer(l); });

    let url = "";
    let attribution = "";

    if (this.darkTiles) {
      url = `https://{s}.basemaps.cartocdn.com/rastertiles/dark_${showLabels ? 'all' : 'nolabels'}/{z}/{x}/{y}{r}.png`;
      attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
    } else {
      if (showLabels) {
        url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        attribution = '&copy; OpenStreetMap contributors';
      } else {
        url = "https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png";
        attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
      }
    }

    L.tileLayer(url, { attribution }).addTo(this.map);
    this.logExit("setTileLayer", "function end");
  }

  setDarkTiles(dark: boolean) {
    this.darkTiles = dark;
    this.setTileLayer(this.showLabels);
    this.tileLayer?.redraw(); 
  }

  setRegion(region: string) {
    this.currentRegion = region || "All";
    this.filteredIds.clear();
    
    if (this.currentRegion === "All") {
      for (const id of this.featureMap.keys()) this.filteredIds.add(id);
    } else {
      const propKeys = ["region", "oblast", "area", "admin", "regionName"];
      for (const [id, f] of this.featureMap) {
        const props = f.properties || {};
        for (const k of propKeys) {
          if (props[k]?.toString().toLowerCase() === this.currentRegion.toLowerCase()) {
            this.filteredIds.add(id);
            break;
          }
        }
      }
    }
    this.scheduleRedraw();
  }

  highlightFeatureById(id: string | number) {
    this.highlightedFeatureId = id?.toString();
    this.updateHighlightLayer();
  }

  zoomToFeatureById(id: string | number) {
    const f = this.featureMap.get(id.toString());
    if (f && this.map) this.map.fitBounds(L.geoJSON(f).getBounds(), { padding: [50, 50], maxZoom: 14 });
  }

  resetAllStyles() {
    this.selectedFeatureId = null; this.highlightedFeatureId = null; this.hoveredFeatureId = null;
    this.updateHighlightLayer();
  }

  renderFilteredFeatures(r: string) { this.setRegion(r); }

  private findFeatureAt(lat: number, lng: number): GeoFeature | null {
    if (!this.map) return null;
    const cp = this.map.latLngToContainerPoint([lat, lng]);
    
    const nw = this.map.containerPointToLatLng(cp.subtract([15, 15]));
    const se = this.map.containerPointToLatLng(cp.add([15, 15]));

    const matches = this.spatialIndex.search({ 
      minX: nw.lng, 
      minY: se.lat, 
      maxX: se.lng, 
      maxY: nw.lat  
    });
    
    for (let i = matches.length - 1; i >= 0; i--) {
      const f = matches[i].feature;
      if (this.currentRegion !== "All" && !this.filteredIds.has(this.getFeatureId(f))) continue;

      const geom = f.geometry;
      
      if (geom.type === "Point") {
        const p = this.map.latLngToContainerPoint([(geom as any).coordinates[1], (geom as any).coordinates[0]]);
        if (p.distanceTo(cp) <= 15) return f; 
      }
      
      if (geom.type === "LineString" || geom.type === "MultiLineString") {
        const coords = geom.type === "LineString" ? [(geom as any).coordinates] : (geom as any).coordinates;
        for (const line of coords) {
            if (this.pointNearLine(cp, line, this.map, 10)) return f;
        }
      }
      
      if (geom.type === "Polygon" && this.pointInPolygon([lng, lat], (geom as any).coordinates)) return f;
      
      if (geom.type === "MultiPolygon") {
        for (const poly of (geom as any).coordinates) {
          if (this.pointInPolygon([lng, lat], poly)) return f;
        }
      }
    }
    return null;
  }

  private pointNearLine(pt: L.Point, coords: any[], map: L.Map, threshold: number): boolean {
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = map.latLngToContainerPoint([coords[i][1], coords[i][0]]);
      const p2 = map.latLngToContainerPoint([coords[i+1][1], coords[i+1][0]]);
      if (this.distToSegment(pt, p1, p2) <= threshold) return true;
    }
    return false;
  }

  private distToSegment(p: L.Point, a: L.Point, b: L.Point) {
    const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
    if (l2 === 0) return p.distanceTo(a);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return p.distanceTo(L.point(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)));
  }

  // OPTIMIZED: Fast AABB bounds checking and explicit hole handling
  private pointInPolygon(pt: [number, number], rings: any[]): boolean {
    const x = pt[0], y = pt[1];
    let inside = false;

    // First ring is always the exterior ring in valid GeoJSON
    const exterior = rings[0];
    if (!exterior || exterior.length === 0) return false;

    // 1. Fast local bounding box check to avoid heavy math
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < exterior.length; i++) {
      const px = exterior[i][0], py = exterior[i][1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    if (x < minX || x > maxX || y < minY || y > maxY) return false;

    // 2. Ray-casting for the exterior ring
    for (let i = 0, j = exterior.length - 1; i < exterior.length; j = i++) {
      const xi = exterior[i][0], yi = exterior[i][1];
      const xj = exterior[j][0], yj = exterior[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    // If it's not in the exterior, it's not in the polygon
    if (!inside) return false;

    // 3. Explicitly check holes (if inside a hole, it is NOT inside the feature)
    for (let k = 1; k < rings.length; k++) {
      const hole = rings[k];
      let inHole = false;
      for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
        const xi = hole[i][0], yi = hole[i][1];
        const xj = hole[j][0], yj = hole[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inHole = !inHole;
      }
      if (inHole) return false; 
    }

    return true;
  }

  private updateHighlightLayer() {
    this.logEnter("updateHighlightLayer");
    const stateKey = `${this.selectedFeatureId}-${this.highlightedFeatureId}-${this.hoveredFeatureId}`;
    if ((this as any)._lastStateKey === stateKey){
      this.logExit("updateHighlightLayer", "state is the same, no need for update");
      return;
    }
    (this as any)._lastStateKey = stateKey;

    this.scheduleRedraw();
    this.logExit("updateHighlightLayer", "schedule redraw, function exit");
  }

  private scheduleRedraw() {
    this.logEnter("scheduleRedraw");
    if (this.pendingRedraw){
      this.logExit("scheduleRedraw", "already pending redraw");
      return;
    }
    this.pendingRedraw = true;
    
    requestAnimationFrame(() => { 
      this.pendingRedraw = false; 
      
      if (!this.tileLayer) return;

      const tiles = (this.tileLayer as any)._tiles;
      
      for (const key in tiles) {
        const tile = tiles[key];
        if (tile.el && tile.active) { 
          this.drawTileCanvas(tile.el as HTMLCanvasElement, tile.coords);
        }
      }
      this.logExit("scheduleRedraw", "highlight layer is redrawn, function end");
    });
  }

  private readonly CUSTOM_ORDER = [
    "Дунавска равнина",
    "Предбалкан",
  ];

  public getUniqueRegions(): string[] {
    const foundRegions = new Set<string>();
    const propKeys = ["region", "oblast", "area", "admin", "regionName"];

    this.featureMap.forEach(f => {
      const props = f.properties || {};
      for (const k of propKeys) {
        if (props[k]) {
          const val = props[k].toString().trim();
          if (val && val.toLowerCase() !== "all") {
            foundRegions.add(val);
            break; 
          }
        }
      }
    });

    const uniqueList = Array.from(foundRegions);

    return uniqueList.sort((a, b) => {
      const indexA = this.CUSTOM_ORDER.indexOf(a);
      const indexB = this.CUSTOM_ORDER.indexOf(b);

      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      return a.localeCompare(b, 'bg');
    });
  }

  public flyToRegion(region: string) {
    this.logEnter("flyToRegion");
    if (!this.map || this.featureMap.size === 0) return;

    if (region === "All") {
      // Default view for the whole dataset (Bulgaria coordinates)
      this.map.flyTo([42.7339, 25.4858], 8, { duration: 1.0 });
      return;
    }

    const bounds = L.latLngBounds([]);
    const propKeys = ["region", "oblast", "area", "admin", "regionName"];

    this.featureMap.forEach((f) => {
      const props = f.properties || {};
      let match = false;
      for (const k of propKeys) {
        if (props[k]?.toString().toLowerCase() === region.toLowerCase()) {
          match = true;
          break;
        }
      }

      if (match) {
        // Use Leaflet's geoJSON helper to get bounds of individual features
        const layer = L.geoJSON(f);
        bounds.extend(layer.getBounds());
      }
    });

    if (bounds.isValid()) {
      this.map.flyToBounds(bounds, { 
        padding: [0.4, 0.4], 
        duration: 1.5,
        maxZoom: 12 // Prevent zooming in too deep on tiny regions
      });
    }
  }

  destroy() { 
    this.logEnter("destroy");
    this.map?.remove(); 
    this.map = undefined; 
  }
}

export const mapService = new MapService();