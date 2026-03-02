// mapService.ts
import L from "leaflet";
import geojsonvtModule from "geojson-vt";
import RBush from "rbush";
import type { GeoFeature } from "../types/geo";

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

  private isReady = false;

  // ---------------- LOGGING HELPERS ----------------

  private logEnter(fn: string) {
    console.log(`entered function ${fn}`);
  }

  private logExit(fn: string, reason: string) {
    console.log(`exited function ${fn}: ${reason}`);
  }

  // -------------------------------------------------

  private getFeatureId(f: GeoFeature): string {
    this.logEnter("getFeatureId");

    if ((f as any)._id) return (f as any)._id;

    const id = f.properties?.['@id'] || f.id || (f as any)._internalId;
    return id ? id.toString() : `gen-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getThemeColors() {
    this.logEnter("getThemeColors");

    return {
      primary: this.darkTiles ? "#60a5fa" : "#2563eb",
      fill: "rgba(59, 130, 246, 0.15)",
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

    if (this.map) {
      this.logExit("init", "map already initialized");
      return;
    }

    this.map = L.map(container, { center, zoom, minZoom: 5, maxZoom: 18 });

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
  }

  setRawData(rawData: any) {
    this.logEnter("setRawData");

    try {
      const data = JSON.parse(JSON.stringify(rawData));
      const features = data.features || [];

      this.featureMap.clear();
      this.spatialIndex.clear();

      const items: SpatialItem[] = [];

      features.forEach((f: GeoFeature, index: number) => {
        const existingId = f.properties?.['@id'] || f.id;
        const stableId = existingId ? existingId.toString() : `feat-${index}`;

        (f as any)._id = stableId;

        if (!f.properties) {
          f.properties = {} as any; 
        }

        f.properties.__id = stableId;
        this.featureMap.set(stableId, f);

        const tempLayer = L.geoJSON(f);
        const bounds = tempLayer.getBounds();

        if (bounds.isValid()) {
          items.push({ 
            minX: bounds.getWest(), 
            minY: bounds.getSouth(), 
            maxX: bounds.getEast(), 
            maxY: bounds.getNorth(), 
            feature: f 
          });
        }
      });

      this.spatialIndex.load(items);

      this.tileIndex = geojsonvt(data, {
        maxZoom: 18,
        indexMaxZoom: 18,
        tolerance: 5,
        extent: 4096,
        buffer: 128
      });

      this.setRegion("All");
      this.isReady = true;
    } catch (e) {
      console.error("Critical error indexing GeoJSON:", e);
      this.logExit("setRawData", "exception occurred");
    }
  }

  private drawTileCanvas(canvas: HTMLCanvasElement, coords: L.Coords) {
    this.logEnter("drawTileCanvas");

    if (!this.isReady || !this.tileIndex) {
      this.logExit("drawTileCanvas", "not ready or tileIndex missing");
      return;
    }

    const size = 256;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const vtTile = this.tileIndex.getTile(coords.z, coords.x, coords.y);

    if (!vtTile) {
      this.logExit("drawTileCanvas", "vtTile is null");
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();

    ctx.lineJoin = 'round'; 
    ctx.lineCap = 'round';

    const colors = this.getThemeColors();

    const activeFeatures: any[] = [];

    const renderFeature = (feature: any, isActive: boolean, isSelected: boolean) => {
      let currentFill = colors.fill;
      let currentOutline = colors.outline;
      let currentLineWidth = 1;

      if (isActive) {
        if (isSelected) {
          currentOutline = colors.selected;
          currentFill = "rgba(249,115,22,0.4)";
          currentLineWidth = 2.5;
        } else {
          currentOutline = colors.highlight;
          currentFill = "rgba(34,197,94,0.4)";
          currentLineWidth = 2;
        }
      }

      if (feature.type === 1) {
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
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }

      if (feature.type === 3) {
        ctx.fillStyle = currentFill;
        ctx.fill();
        ctx.strokeStyle = currentOutline;
        ctx.lineWidth = currentLineWidth;
        ctx.stroke();
      } else if (feature.type === 2) {
        ctx.strokeStyle = currentOutline;
        ctx.lineWidth = currentLineWidth;
        ctx.stroke();
      }
    };

    for (const feature of vtTile.features) {
      const vid = feature.tags?.['@id']?.toString() ||
                  feature.id?.toString() ||
                  feature.tags?.__id?.toString();

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

    for (const item of activeFeatures) {
      renderFeature(item.feature, true, item.isSelected);
    }

    ctx.restore();
  }

  loadGeoJSON() {
    this.logEnter("loadGeoJSON");

    if (!this.map || !this.tileIndex) {
      this.logExit("loadGeoJSON", "map or tileIndex missing");
      return;
    }

    if (this.tileLayer) this.map.removeLayer(this.tileLayer);

    const CanvasLayer = L.GridLayer.extend({
      createTile: (coords: L.Coords, done: any) => {
        const tile = document.createElement('canvas') as HTMLCanvasElement;
        const size = 256;
        const dpr = window.devicePixelRatio || 1;

        tile.width = size * dpr;
        tile.height = size * dpr;
        tile.style.width = `${size}px`;
        tile.style.height = `${size}px`;

        setTimeout(() => {
          this.drawTileCanvas(tile, coords);
          done(null, tile);
        }, 0);

        return tile;
      }
    });

    this.tileLayer = new (CanvasLayer as any)().addTo(this.map);
  }

  private findFeatureAt(lat: number, lng: number): GeoFeature | null {
    this.logEnter("findFeatureAt");

    if (!this.map) {
      this.logExit("findFeatureAt", "map not initialized");
      return null;
    }

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

      if (this.currentRegion !== "All" &&
          !this.filteredIds.has(this.getFeatureId(f))) continue;

      const geom = f.geometry;

      if (geom.type === "Point") {
        const p = this.map.latLngToContainerPoint([
          (geom as any).coordinates[1],
          (geom as any).coordinates[0]
        ]);
        if (p.distanceTo(cp) <= 15) return f;
      }
    }

    this.logExit("findFeatureAt", "no feature matched");
    return null;
  }

  destroy() {
    this.logEnter("destroy");
    this.map?.remove();
    this.map = undefined;
  }
}

export const mapService = new MapService();