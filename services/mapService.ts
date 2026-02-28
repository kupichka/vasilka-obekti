import L from "leaflet"
import type { GeoFeature } from "../types/geo"
import { polygonOptimizer } from "./polygonOptimizer"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureClickHandler = (feature: GeoFeature) => void

interface ThemeColors {
  primaryFeatureColor: string;
  primaryFeatureFill: string;
  selectedColor: string;
  highlightColor: string;
}

class MapService {
  private map?: L.Map
  private geoLayer?: L.GeoJSON
  private onFeatureClick?: FeatureClickHandler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private featureMap?: Map<string, GeoFeature>
  private selectedLayer?: L.Layer
  private tileLayer?: L.TileLayer
  private invisibleLines: L.Polyline[] = [] // Tracks hitbox lines to prevent memory leaks

  private showLabels: boolean = true;
  private useSimplifiedPolygons: boolean = true;
  private currentZoom: number = 7;
  private darkTiles: boolean = true;

  private getThemeColors(): ThemeColors {
    const isDark = this.darkTiles;
    return {
      primaryFeatureColor: isDark ? "#60a5fa" : "#2563eb",
      primaryFeatureFill: "#3b82f6",
      selectedColor: "#f97316",
      highlightColor: "#22c55e"
    };
  }

  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  private getAdaptiveSimplificationTolerance(zoom: number): number {
    if (zoom <= 6) return 0.5;
    if (zoom <= 8) return 0.2;
    if (zoom <= 10) return 0.1;
    return 0.05;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private optimizeDataForPerformance(data: any): any {
    if (!this.useSimplifiedPolygons) return data;
    const tolerance = this.getAdaptiveSimplificationTolerance(this.currentZoom);
    return polygonOptimizer.simplifyGeoJSON(data, { tolerance });
  }

  /**
   * Cleans up existing GeoJSON layers and ghost hitboxes before rendering new ones
   */
  private clearCurrentLayers() {
    if (this.geoLayer && this.map) {
      this.map.removeLayer(this.geoLayer);
    }
    this.invisibleLines.forEach(line => line.remove());
    this.invisibleLines = [];
  }

  /**
   * Centralizes the styling and event binding logic previously duplicated 
   * across loadGeoJSON and renderFilteredFeatures.
   */
  private getGeoJsonOptions(): L.GeoJSONOptions {
    const colors = this.getThemeColors();

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pointToLayer: (_feature: any, latlng: any) => {
        return L.circleMarker(latlng, {
          radius: 6,
          color: colors.primaryFeatureColor,
          weight: 2,
          opacity: 1,
          fillColor: colors.primaryFeatureFill,
          fillOpacity: 0.5
        });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: (feature: any) => {
        const isLine = feature?.geometry?.type === 'LineString' || feature?.geometry?.type === 'MultiLineString';
        return {
          color: colors.primaryFeatureColor,
          fillColor: colors.primaryFeatureFill,
          weight: isLine ? 4 : 3,
          opacity: 1,
          fillOpacity: 0.5,
          lineCap: 'round',
          lineJoin: 'round'
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature: (feature: GeoFeature, layer: any) => {
        const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
        
        if (isLine && layer instanceof L.Polyline) {
          const invisibleLine = L.polyline(layer.getLatLngs() as any, {
            color: 'transparent',
            weight: 15,
            opacity: 0,
            interactive: true,
            className: 'river-hitbox'
          }).addTo(this.map!);
          
          this.invisibleLines.push(invisibleLine);

          invisibleLine.on("mouseover", () => layer.setStyle({ weight: 6, opacity: 0.8 }));
          invisibleLine.on("mouseout", () => layer.setStyle({ weight: 4, opacity: 1 }));
          
          const clickHandler = () => {
            this.selectLayer(layer);
            this.onFeatureClick?.(feature);
          };
          
          invisibleLine.on("click", clickHandler);
          layer.on("click", clickHandler);
        } else {
          layer.on("click", () => {
            this.selectLayer(layer);
            this.onFeatureClick?.(feature);
          });
        }
      }
    };
  }

  // --- Public API ---

  init(container: HTMLDivElement, center: [number, number], zoom: number) {
    this.darkTiles = true;
    if (this.map) return

    this.useSimplifiedPolygons = this.isMobileDevice();
    this.currentZoom = zoom;

    this.map = L.map(container, {
      center,
      zoom,
      minZoom: 5,
      maxZoom: 15,
      // maxBounds: [
      //   [40.5, 21.0],
      //   [44.9, 29.5]
      // ],
      maxBoundsViscosity: 0.6
    })

    this.map.on('zoom', () => {
      if (this.map) this.currentZoom = this.map.getZoom();
    });

    this.setTileLayer(this.showLabels);
  }

  setTileLayer(showLabels: boolean) {
    if (!this.map) return;

    this.showLabels = showLabels;
    const isDark = this.darkTiles;

    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    let url: string;
    let attribution: string;

    if (isDark) {
      url = showLabels
        ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png";
      attribution = "© OpenStreetMap contributors, © CARTO";
    } else {
      url = showLabels 
        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
      attribution = showLabels
        ? "© OpenStreetMap contributors"
        : "© OpenStreetMap contributors, © CARTO";
    }
    
    this.tileLayer = L.tileLayer(url, { attribution }).addTo(this.map);
  }

  updateTiles() {
    if (!this.map) return;
    this.setTileLayer(this.showLabels);
  }

  setDarkTiles(dark: boolean) {
    this.darkTiles = dark;
    this.updateTiles();
    if (this.geoLayer && this.featureMap) {
      this.reloadGeoJSON();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadGeoJSON(data: any) {
    this.clearCurrentLayers();
    const displayData = this.optimizeDataForPerformance(data);
    
    this.geoLayer = L.geoJSON(displayData, this.getGeoJsonOptions());
    this.geoLayer.addTo(this.map!);
  }

  private selectLayer(layer: L.Layer) {
    if (this.selectedLayer && this.geoLayer) {
      if (this.selectedLayer instanceof L.CircleMarker) {
        (this.selectedLayer as L.CircleMarker).setRadius(6);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.geoLayer.resetStyle(this.selectedLayer as any);
    }

    this.selectedLayer = layer;

    if (layer instanceof L.CircleMarker) {
      (layer as L.CircleMarker).setStyle({
        radius: 8,
        color: "#f97316",
        weight: 3,
        fillColor: "#f97316",
        fillOpacity: 0.8
      });
    } else if ("setStyle" in layer) {
      (layer as L.Path).setStyle({
        color: "#f97316",
        fillOpacity: 0.75,
        weight: 4
      });
      (layer as L.Path).bringToFront();
    }
  }

  setFeatureClickHandler(handler: FeatureClickHandler) {
    this.onFeatureClick = handler
  }

  destroy() {
    if (this.map) {
      this.clearCurrentLayers();
      this.map.remove()
      this.map = undefined
      this.geoLayer = undefined
      this.selectedLayer = undefined
      this.tileLayer = undefined
    }
  }

  clearSelection() {
    if (this.selectedLayer && this.geoLayer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.geoLayer.resetStyle(this.selectedLayer as any);
      this.selectedLayer = undefined;
    }
  }

  highlightFeatureById(osmId: string, color: string = "#22c55e") {
    if (!this.geoLayer) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.geoLayer.eachLayer((layer: any) => {
      if (layer.feature.properties['@id'] === osmId) {
        if (layer instanceof L.CircleMarker) {
          layer.setStyle({
            radius: 8,
            color: color,
            weight: 3,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.8
          });
        } else if ("setStyle" in layer) {
          layer.setStyle({
            color: color,
            weight: 4,
            fillOpacity: 0.7,
            fillColor: color
          });
        }
        layer.bringToFront();
      }
    });
  }

  zoomToFeatureById(osmId: string) {
    if (!this.map || !this.geoLayer) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.geoLayer.eachLayer((layer: any) => {
      if (layer.feature.properties['@id'] === osmId) {
        let bounds: L.LatLngBounds;
        
        if (layer instanceof L.CircleMarker) {
          const latlng = layer.getLatLng();
          bounds = L.latLngBounds(latlng, latlng);
        } else if ("getBounds" in layer) {
          bounds = (layer as L.Polygon).getBounds();
        } else {
          return;
        }
        
        if (!this.map) return;
        this.map.fitBounds(bounds, { 
          padding: [50, 50], 
          maxZoom: 14,
          animate: true,
          duration: 1.0
        });
      }
    });
  }

  onThemeChange() {
    this.updateTiles();
    if (this.geoLayer && this.featureMap) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedId = this.selectedLayer && (this.selectedLayer as any).feature?.properties?.['@id'];
      
      this.reloadGeoJSON();

      if (selectedId !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.geoLayer.eachLayer((layer: any) => {
          if (layer.feature.properties['@id'] === selectedId) {
            this.selectLayer(layer);
          }
        });
      }
    }
  }

  resetAllStyles() {
    if (this.geoLayer) {
      this.geoLayer.resetStyle();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRawData(data: any) {
    const features = data.features || (Array.isArray(data) ? data : []);
    this.featureMap = new Map();
    
    features.forEach((f: any, index: number) => {
      if (f.geometry !== null) {
        // Fallback: Use @id, then id, then the array index
        const id = f.properties?.['@id'] || f.id || `gen-id-${index}`;
        
        // Ensure the property itself exists for later lookups (like highlightFeatureById)
        if (!f.properties['@id']) {
          f.properties['@id'] = id;
        }
        
        this.featureMap!.set(id, f);
      }else{
        console.log("AWAWAWA NOT GEOMETRY");
      }
    });
  }

  private reloadGeoJSON() {
    if (!this.featureMap) return;
    
    const features = Array.from(this.featureMap.values());
    const geoJSON = {
      type: "FeatureCollection" as const,
      features
    };
    this.loadGeoJSON(geoJSON);
  }

  renderFilteredFeatures(region: string) {
    if (!this.map || !this.featureMap) return;

    const filteredFeatures = region === "All"
      ? Array.from(this.featureMap.values())
      : Array.from(this.featureMap.values()).filter(f => f.properties.region === region);

    const filteredData = {
      type: "FeatureCollection" as const,
      features: filteredFeatures
    };

    // Make sure we clean up the existing layers first to prevent overlapping issues
    this.clearCurrentLayers();

    const displayData = this.optimizeDataForPerformance(filteredData);
    
    // We can safely reuse the configuration extracted earlier
    this.geoLayer = L.geoJSON(displayData, this.getGeoJsonOptions());
    this.geoLayer.addTo(this.map);
  }

  setSimplificationEnabled(enabled: boolean) {
    this.useSimplifiedPolygons = enabled;
    if (this.featureMap) {
      this.reloadGeoJSON();
    }
  }

  getSimplificationStats() {
    if (!this.featureMap) return null;
    
    const features = Array.from(this.featureMap.values());
    const fullData = {
      type: "FeatureCollection" as const,
      features
    };
    const simplified = this.optimizeDataForPerformance(fullData);
    return polygonOptimizer.getSimplificationStats(fullData, simplified);
  }

  isSimplificationEnabled(): boolean {
    return this.useSimplifiedPolygons;
  }
}

export const mapService = new MapService()