// mapService.ts
import L from "leaflet";
import geojsonvtModule from "geojson-vt";
import RBush from "rbush";
import type { GeoFeature } from "../types/geo";
import * as topojson from "topojson-client";

const DEBUG = false;
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
  private onFeatureClick?: (feature: GeoFeature | null) => void;

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
    if(DEBUG) this.logEnter("getFeatureID");
    if ((f as any)._id) return (f as any)._id;
    const id = f.properties?.['@id'] || f.id || (f as any)._internalId;
    return id ? id.toString() : `gen-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getThemeColors() {
    if(DEBUG) this.logEnter("getThemeColors");
    return {
      primary: this.darkTiles ? "#60a5fa" : "#2563eb",
      fill: "rgba(59, 130, 246, 0.35)",
      outline: this.darkTiles ? "rgba(96, 165, 250, 0.6)" : "rgba(37, 99, 235, 0.6)",
      highlight: "#22c55e",
      selected: "#f97316",
    };
  }

  public setFeatureClickHandler(handler: (feature: GeoFeature | null) => void) {
    if(DEBUG) this.logEnter("setFeatureClickHandler");
    this.onFeatureClick = handler;
  }

  init(container: HTMLDivElement, center: [number, number], zoom: number) {
    if(DEBUG) this.logEnter("init");
    if (this.map){ 
      if(DEBUG) this.logExit("init", "map already initialized?");
      return;
    }
    this.map = L.map(container, { center, zoom, minZoom: 5, maxZoom: 18,
      maxBounds: [
        [38.0, 19.0],  // southwest
        [47.0, 31.0]   // northeast
      ],
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
      this.selectedFeatureId = feature ? this.getFeatureId(feature) : null;
      this.onFeatureClick?.(feature);
      this.updateHighlightLayer();
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
    if(DEBUG) this.logExit("init", "end of function");
  }

  private isReady=false;

  setRawData(topoData: any) {
    if(DEBUG) this.logEnter("setRawData");
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
              const existingId = f.properties?.['@id'] || f.id;
              const stableId = existingId ? existingId.toString() : `feat-${layerName}-${globalIndex}`;

              // Inject IDs everywhere to be safe
              (f as any)._id = stableId;
              if (!f.properties) f.properties = {} as any;
              f.properties['@id'] = stableId; 
              f.properties.__id = stableId;  

              // FIX: Check if we've already seen this ID in a previous layer and merge regions
              const existingFeature = this.featureMap.get(stableId);
              if (existingFeature) {
                  const existingRegions = existingFeature.properties.region || [];
                  const newRegions = f.properties.region || [];
                  
                  // Normalize to arrays
                  const arr1 = Array.isArray(existingRegions) ? existingRegions : [existingRegions];
                  const arr2 = Array.isArray(newRegions) ? newRegions : [newRegions];
                  
                  // Merge and deduplicate
                  existingFeature.properties.region = Array.from(new Set([...arr1, ...arr2]));
            
                  // 2. SKIP: We don't push to allFeatures or spatial index again
                  return;
              }

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
      if(DEBUG) this.logExit("setRawData", "exception occured");
    } 
  }

  private drawTileCanvas(canvas: HTMLCanvasElement, coords: L.Coords) {
    if(DEBUG) this.logEnter("drawTileCanvas");
    if (!this.isReady || !this.tileIndex){
      if(DEBUG) this.logExit("drawTileCanvas", "data isn't ready or tileIndex is evil");
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
      if(DEBUG) this.logExit("drawTileCanvas", "vtTile is stupid");
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
    if(DEBUG) this.logExit("drawTileCanvas", "function end");
  }

  loadGeoJSON() {
    if(DEBUG) this.logEnter("loadGeoJSON");
    if (!this.map || !this.tileIndex){
      if(DEBUG) this.logExit("loadGeoJSON", "map isn't here or tileIndex is evil");
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
    if(DEBUG) this.logExit("loadGeoJSON", "function end");
  }

  setTileLayer(showLabels: boolean) {
    if(DEBUG) this.logEnter("setTileLayer");
    this.showLabels = showLabels;
    if (!this.map){
      if(DEBUG) this.logExit("setTileLayer", "map is evil?");
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

    L.tileLayer(url, { attribution/*, detectRetina: true */ }).addTo(this.map);
    if(DEBUG) this.logExit("setTileLayer", "function end");
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
      const target = this.currentRegion.toLowerCase().trim();

      for (const [id, f] of this.featureMap) {
        const props = f.properties || {};

        for (const k of propKeys) {
          const value = props[k];
          if (!value) continue;

          const values = Array.isArray(value) ? value : [value];

          if (values.some(v => String(v).toLowerCase().trim() === target)) {
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
    if (f && this.map) this.map.fitBounds(L.geoJSON(f).getBounds(), { padding: [50, 50], maxZoom: 10 });
  }

  resetAllStyles() {
    this.selectedFeatureId = null; this.highlightedFeatureId = null; this.hoveredFeatureId = null;
    this.updateHighlightLayer();
  }

  renderFilteredFeatures(r: string) { this.setRegion(r); }

  private findFeatureAt(lat: number, lng: number): GeoFeature | null {
    if (!this.map) return null;
    const cp = this.map.latLngToContainerPoint([lat, lng]);
    
    const zoom = this.map.getZoom();
    const hitRadius = zoom <= 7 ? 4 : zoom <= 10 ? 7 : 10;

    const nw = this.map.containerPointToLatLng(cp.subtract([15, 15]));
    const se = this.map.containerPointToLatLng(cp.add([15, 15]));

    const matches = this.spatialIndex.search({ 
      minX: nw.lng, 
      minY: se.lat, 
      maxX: se.lng, 
      maxY: nw.lat  
    });

    // Define our priority tiers
    const points: any[] = [];
    const lines: any[] = [];
    const polygons: any[] = [];

    const edgePt = L.point(cp.x + hitRadius, cp.y);
    const thresholdLngDeg = Math.abs(this.map.containerPointToLatLng(edgePt).lng - lng);
    const thresholdSq = thresholdLngDeg * thresholdLngDeg;

    // 2. Pre-calculate the cosine of the latitude for fast flat-plane scaling
    const cosLat = Math.cos(lat * Math.PI / 180);

    // 1. Categorize matches
    for (const match of matches) {
      const f = match.feature;
      if (this.currentRegion !== "All" && !this.filteredIds.has(this.getFeatureId(f))) continue;

      const type = f.geometry.type;
      if (type === "Point") points.push(f);
      else if (type === "LineString" || type === "MultiLineString") lines.push(f);
      else if (type === "Polygon" || type === "MultiPolygon") polygons.push(f);
    }

    // 2. Check Points first
    for (const f of points) {
      const geom = f.geometry;
      const p = this.map.latLngToContainerPoint([(geom as any).coordinates[1], (geom as any).coordinates[0]]);
      if (p.distanceTo(cp) <= 15) return f;
    }

    // 3. Check Lines second
    for (const f of lines) {
      const geom = f.geometry;
      const coords = geom.type === "LineString" ? [(geom as any).coordinates] : (geom as any).coordinates;
      for (const line of coords) {
        if (this.fastPointNearLine(lng, lat, line, thresholdSq, cosLat)) return f;
      }
    }

    // 4. Check Polygons last
    for (const f of polygons) {
      const geom = f.geometry;
      const coords = (geom as any).coordinates;
      if (geom.type === "Polygon") {
        if (this.pointInPolygon([lng, lat], coords)) return f;
      } else { // MultiPolygon
        for (const poly of coords) {
          if (this.pointInPolygon([lng, lat], poly)) return f;
        }
      }
    }

    return null;
  }

  private fastPointNearLine(lng: number, lat: number, coords: any[], thresholdSq: number, cosLat: number): boolean {
    for (let i = 0; i < coords.length - 1; i++) {
      const x1 = coords[i][0], y1 = coords[i][1];
      const x2 = coords[i+1][0], y2 = coords[i+1][1];
      
      if (this.distToSegmentSqGeographic(lng, lat, x1, y1, x2, y2, cosLat) <= thresholdSq) {
        return true;
      }
    }
    return false;
  }

  private distToSegmentSqGeographic(px: number, py: number, x1: number, y1: number, x2: number, y2: number, cosLat: number): number {
    // Scale longitude by cos(lat) to account for map distortion (Earth's curvature)
    const dx = (x2 - x1) * cosLat;
    const dy = y2 - y1;
    
    const pxScaled = px * cosLat;
    const x1Scaled = x1 * cosLat;
    
    const l2 = dx * dx + dy * dy;
    
    if (l2 === 0) {
      const ddx = pxScaled - x1Scaled;
      const ddy = py - y1;
      return ddx * ddx + ddy * ddy;
    }

    let t = ((pxScaled - x1Scaled) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));

    const projX = x1Scaled + t * dx;
    const projY = y1 + t * dy;

    const ddx = pxScaled - projX;
    const ddy = py - projY;

    return ddx * ddx + ddy * ddy; // Return squared distance to avoid Math.sqrt overhead
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
    if(DEBUG) this.logEnter("updateHighlightLayer");
    const stateKey = `${this.selectedFeatureId}-${this.highlightedFeatureId}-${this.hoveredFeatureId}`;
    if ((this as any)._lastStateKey === stateKey){
      if(DEBUG) this.logExit("updateHighlightLayer", "state is the same, no need for update");
      return;
    }
    (this as any)._lastStateKey = stateKey;

    this.scheduleRedraw();
    if(DEBUG) this.logExit("updateHighlightLayer", "schedule redraw, function exit");
  }

  private scheduleRedraw() {
    if(DEBUG) this.logEnter("scheduleRedraw");
    if (this.pendingRedraw){
      if(DEBUG) this.logExit("scheduleRedraw", "already pending redraw");
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
      if(DEBUG) this.logExit("scheduleRedraw", "highlight layer is redrawn, function end");
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
          // 1. Normalize to an array
          const values = Array.isArray(props[k]) ? props[k] : [props[k]];
          let addedValidRegion = false;

          // 2. Add each region individually
          values.forEach(v => {
            const val = String(v).trim();
            if (val && val.toLowerCase() !== "all") {
              foundRegions.add(val);
              addedValidRegion = true;
            }
          });

          // 3. If we found and added valid regions from this key, stop checking fallback keys
          if (addedValidRegion) {
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

  private getFastBounds(geometry: any): L.LatLngBounds {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const stack = [geometry.coordinates];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || current.length === 0) continue;

      // If the first element is a number, we've hit the bottom [lng, lat] pair
      if (typeof current[0] === 'number') {
        const lng = current[0];
        const lat = current[1];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else {
        // It's an array of arrays, push them all onto the stack to be processed
        for (let i = 0; i < current.length; i++) {
          stack.push(current[i]);
        }
      }
    }
    
    return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
  }

  public flyToRegion(region: string) {
    if(DEBUG) this.logEnter("flyToRegion");
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
        const value = props[k];

        if (Array.isArray(value)) {
          if (value.some((r: string) => r.toLowerCase() === region.toLowerCase())) {
            match = true;
            break;
          }
        } else if (value?.toString().toLowerCase() === region.toLowerCase()) {
          match = true;
          break;
        }
      }

      if (match) {
        bounds.extend(this.getFastBounds(f.geometry));
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
    if(DEBUG) this.logEnter("destroy");
    this.map?.remove(); 
    this.map = undefined; 
  }
}

export const mapService = new MapService();