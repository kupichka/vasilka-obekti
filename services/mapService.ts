import L from "leaflet"
import type { GeoFeature } from "../types/geo"
import { themeService } from "./themeService"
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
  private rawData: any;
  private selectedLayer?: L.Layer
  private tileLayer?: L.TileLayer
  private showLabels: boolean = true;
  private useSimplifiedPolygons: boolean = true;
  private currentZoom: number = 7;

  private getThemeColors(): ThemeColors {
    const isDark = themeService.getTheme() === 'dark';
    return {
      primaryFeatureColor: isDark ? "#60a5fa" : "#2563eb",
      primaryFeatureFill: isDark ? "#3b82f6" : "#3b82f6",
      selectedColor: "#f97316",
      highlightColor: "#22c55e"
    };
  }

  /**
   * Detect if running on mobile device
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Get optimal simplification tolerance based on zoom level
   * Lower tolerance (more detail) at higher zoom levels
   */
  private getAdaptiveSimplificationTolerance(zoom: number): number {
    if (zoom <= 6) return 0.5;     // Very zoomed out: high simplification
    if (zoom <= 8) return 0.2;     // Zoomed out: moderate simplification
    if (zoom <= 10) return 0.1;    // Medium zoom: light simplification
    return 0.05;                    // Zoomed in: minimal simplification
  }

  /**
   * Simplify data for better performance (especially mobile)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
   */
  private optimizeDataForPerformance(data: any): any {
    if (!this.useSimplifiedPolygons) return data;

    const tolerance = this.getAdaptiveSimplificationTolerance(this.currentZoom);
    return polygonOptimizer.simplifyGeoJSON(data, { tolerance });
  }

  init(container: HTMLDivElement, center: [number, number], zoom: number) {
    // Prevent double initialization from React StrictMode
    if (this.map) return

    // Auto-enable simplification on mobile devices
    this.useSimplifiedPolygons = this.isMobileDevice();
    this.currentZoom = zoom;

    this.map = L.map(container, {
      center,
      zoom,
      minZoom: 5,
      maxZoom: 15,
      maxBounds: [
        [40.5, 21.0],
        [44.9, 29.5]
      ],
      maxBoundsViscosity: 0.6
    })

    // Track zoom changes for adaptive simplification
    this.map.on('zoom', () => {
      if (this.map) {
        this.currentZoom = this.map.getZoom();
      }
    });

    this.tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(this.map);
  }

  setTileLayer(showLabels: boolean) {
    if (!this.map) return;

    this.showLabels = showLabels;
    const isDark = themeService.getTheme() === 'dark';

    // Remove existing tile layer if any
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    let url: string;
    let attribution: string;

    if (isDark) {
      // Dark mode tile layers
      url = showLabels
        ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}{r}.png";
      attribution = "© OpenStreetMap contributors, © CARTO";
    } else {
      // Light mode tile layers
      url = showLabels 
        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
      attribution = showLabels
        ? "© OpenStreetMap contributors"
        : "© OpenStreetMap contributors, © CARTO";
    }
    
    this.tileLayer = L.tileLayer(url, { attribution }).addTo(this.map);
  }

  updateTilesForTheme() {
    if (!this.map) return;
    // Re-apply the current tile layer with the new theme
    this.setTileLayer(this.showLabels);
  }

loadGeoJSON(data: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (this.geoLayer) this.map?.removeLayer(this.geoLayer);

  // Store raw data for later use
  this.rawData = data;

  // Apply optimization for better performance
  const displayData = this.optimizeDataForPerformance(data);

  const colors = this.getThemeColors();

  this.geoLayer = L.geoJSON(displayData, {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // Determine if this is a LineString (like rivers)
      const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
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
      // For LineString features, add an invisible thicker line for better clickability
      if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') && layer instanceof L.Polyline) {
        const invisibleLine = L.polyline(layer.getLatLngs() as any, {
          color: 'transparent',
          weight: 15, // Much thicker for easier clicking
          opacity: 0,
          interactive: true,
          className: 'river-hitbox'
        }).addTo(this.map!);
        
        // Add hover effect to visible line when hovering over invisible line
        invisibleLine.on("mouseover", () => {
          layer.setStyle({
            weight: 6,
            opacity: 0.8
          });
        });
        
        invisibleLine.on("mouseout", () => {
          layer.setStyle({
            weight: 4,
            opacity: 1
          });
        });
        
        // Share click handler between visible and invisible line
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
  }).addTo(this.map!);
}

  private selectLayer(layer: L.Layer) {
  // Reset previous selection
  if (this.selectedLayer && this.geoLayer) {
    // Explicitly reset CircleMarker size if it was one
    if (this.selectedLayer instanceof L.CircleMarker) {
      (this.selectedLayer as L.CircleMarker).setRadius(6);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.geoLayer.resetStyle(this.selectedLayer as any);
  }

  this.selectedLayer = layer;

  // Handle CircleMarkers
  if (layer instanceof L.CircleMarker) {
    (layer as L.CircleMarker).setStyle({
      radius: 8,
      color: "#f97316",
      weight: 3,
      fillColor: "#f97316",
      fillOpacity: 0.8
    });
  }
  // Handle other layer types that support setStyle (Polygons, etc)
  else if ("setStyle" in layer) {
    (layer as L.Path).setStyle({
      color: "#f97316",
      fillOpacity: 0.75,
      weight: 4
    });
    // Bring to front so the highlight isn't hidden by other overlapping objects
    (layer as L.Path).bringToFront();
  }
}

  setFeatureClickHandler(handler: FeatureClickHandler) {
    this.onFeatureClick = handler
  }

  destroy() {
    if (this.map) {
      this.map.remove()
      // Wipe internal state so it can be re-initialized cleanly
      this.map = undefined
      this.geoLayer = undefined
      this.selectedLayer = undefined
      this.tileLayer = undefined
    }
  }
  clearSelection() {
    if (this.selectedLayer && this.geoLayer) {
        this.geoLayer.resetStyle(this.selectedLayer as any);
        this.selectedLayer = undefined;
    }
    }
    highlightFeatureById(osmId: string, color: string = "#22c55e") { // default green
  if (!this.geoLayer) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this.geoLayer.eachLayer((layer: any) => {
    if (layer.feature.properties['@id'] === osmId) {
      // Handle both CircleMarkers and Polygons
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
      // Bring to front so it's visible
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
        
        // Get bounds depending on layer type
        if (layer instanceof L.CircleMarker) {
          const latlng = layer.getLatLng();
          bounds = L.latLngBounds(latlng, latlng);
        } else if ("getBounds" in layer) {
          bounds = (layer as L.Polygon).getBounds();
        } else {
          return;
        }
        
        // Zoom to fit with a smooth transition that gets interrupted by user interaction
        if (!this.map) return;
        this.map.fitBounds(bounds, { 
          padding: [50, 50], 
          maxZoom: 12,
          animate: true,
          duration: 3.0
        });
      }
    });
  }

  onThemeChange() {
    // Update tiles for new theme
    this.updateTilesForTheme();
    
    // Reload the current layer with new colors
    if (this.geoLayer) {
      const currentData = this.rawData;
      // Store the current selection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedId = this.selectedLayer && (this.selectedLayer as any).feature?.properties?.['@id'];
      
      this.loadGeoJSON(currentData);
      
      // Restore selection if there was one
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

  setRawData(data: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rawData = data;
  }

  renderFilteredFeatures(region: string) {
    if (!this.map || !this.rawData) return;

    const colors = this.getThemeColors();

    // 1. Remove the old layer if it exists
    if (this.geoLayer) {
      this.map.removeLayer(this.geoLayer);
    }

    // 2. Filter the features
    const filteredData = {
      ...this.rawData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      features: region === "All" 
        ? this.rawData.features 
        : this.rawData.features.filter((f: any) => f.properties.region === region)
    };

    // 3. Apply optimization
    const displayData = this.optimizeDataForPerformance(filteredData);

    // 4. Create the new layer with only matching features
    this.geoLayer = L.geoJSON(displayData, {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // Determine if this is a LineString (like rivers)
        const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
        return {
          color: colors.primaryFeatureColor,
          weight: isLine ? 4 : 3,
          fillOpacity: 0.4,
          fillColor: colors.primaryFeatureFill,
          lineCap: 'round',
          lineJoin: 'round'
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onEachFeature: (feature: GeoFeature, layer: any) => {
        // For LineString features, add an invisible thicker line for better clickability
        if ((feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') && layer instanceof L.Polyline) {
          const invisibleLine = L.polyline(layer.getLatLngs() as any, {
            color: 'transparent',
            weight: 15, // Much thicker for easier clicking
            opacity: 0,
            interactive: true,
            className: 'river-hitbox'
          }).addTo(this.map!);
          
          // Add hover effect to visible line when hovering over invisible line
          invisibleLine.on("mouseover", () => {
            layer.setStyle({
              weight: 6,
              opacity: 0.8
            });
          });
          
          invisibleLine.on("mouseout", () => {
            layer.setStyle({
              weight: 4,
              opacity: 1
            });
          });
          
          // Share click handler between visible and invisible line
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
    }).addTo(this.map);
  }

  /**
   * Toggle between simplified and full-detail polygons
   * Useful for users who want maximum precision at the cost of performance
   */
  setSimplificationEnabled(enabled: boolean) {
    this.useSimplifiedPolygons = enabled;
    // Reload current data with new simplification setting
    if (this.rawData) {
      this.loadGeoJSON(this.rawData);
    }
  }

  /**
   * Get simplification statistics for performance monitoring
   */
  getSimplificationStats() {
    if (!this.rawData) return null;
    
    const simplified = this.optimizeDataForPerformance(this.rawData);
    return polygonOptimizer.getSimplificationStats(this.rawData, simplified);
  }

  /**
   * Check if currently using simplified polygons
   */
  isSimplificationEnabled(): boolean {
    return this.useSimplifiedPolygons;
  }
}

export const mapService = new MapService()