/**
 * Polygon Optimization Service
 * Reduces polygon complexity for better mobile/web performance
 * Uses Ramer-Douglas-Peucker algorithm for coordinate simplification
 */

interface SimplifyOptions {
  tolerance?: number; // in kilometers, default 0.1km
  highQuality?: boolean; // if true, uses higher precision (slower but better quality)
}

class PolygonOptimizer {
  /**
   * Convert kilometers to approximate degrees (rough conversion for latitude)
   */
  private kmToDegrees(km: number): number {
    // 1 km ≈ 0.009 degrees (at equator)
    return km / 111.32;
  }

  /**
   * Calculate distance from point to line using perpendicular distance formula
   */
  private perpendicularDistance(point: [number, number], lineStart: [number, number], lineEnd: [number, number]): number {
    const [x, y] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
    const denominator = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);

    return denominator === 0 ? 
      Math.sqrt((x - x1) ** 2 + (y - y1) ** 2) : 
      numerator / denominator;
  }

  /**
   * Simplify a line using Ramer-Douglas-Peucker algorithm
   * Removes points that are too close to the line between start and end points
   */
  private simplifyLine(points: [number, number][], epsilon: number): [number, number][] {
    if (points.length <= 2) return points;

    let maxDistance = 0;
    let maxIndex = 0;

    // Find the point with the maximum distance
    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDistance > epsilon) {
      const recursive1 = this.simplifyLine(points.slice(0, maxIndex + 1), epsilon);
      const recursive2 = this.simplifyLine(points.slice(maxIndex), epsilon);

      // Remove duplicate endpoint
      return [...recursive1.slice(0, -1), ...recursive2];
    } else {
      return [points[0], points[points.length - 1]];
    }
  }

  /**
   * Simplify a single polygon (ring)
   */
  private simplifyRing(ring: [number, number][], tolerance: number): [number, number][] {
    return this.simplifyLine(ring, tolerance);
  }

  /**
   * Simplify a MultiPolygon or Polygon GeoJSON geometry
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simplifyGeometry(geometry: any, options: SimplifyOptions = {}): any {
    const tolerance = this.kmToDegrees(options.tolerance ?? 0.1);

    if (geometry.type === "Polygon") {
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring: [number, number][]) =>
          this.simplifyRing(ring, tolerance)
        )
      };
    } else if (geometry.type === "MultiPolygon") {
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((polygon: [number, number][][]) =>
          polygon.map((ring: [number, number][]) =>
            this.simplifyRing(ring, tolerance)
          )
        )
      };
    } else if (geometry.type === "LineString") {
      return {
        type: "LineString",
        coordinates: this.simplifyRing(geometry.coordinates, tolerance)
      };
    } else if (geometry.type === "MultiLineString") {
      return {
        type: "MultiLineString",
        coordinates: geometry.coordinates.map((line: [number, number][]) =>
          this.simplifyRing(line, tolerance)
        )
      };
    }

    return geometry;
  }

  /**
   * Simplify entire GeoJSON FeatureCollection
   * Returns simplified copy, original untouched
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simplifyGeoJSON(geojson: any, options: SimplifyOptions = {}): any {
    return {
      ...geojson,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      features: geojson.features.map((feature: any) => ({
        ...feature,
        geometry: this.simplifyGeometry(feature.geometry, options)
      }))
    };
  }

  /**
   * Get statistics about simplification
   * Returns reduction percentage and point counts
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSimplificationStats(original: any, simplified: any): {
    reductionPercent: number;
    originalPoints: number;
    simplifiedPoints: number;
  } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const countPoints = (geom: any): number => {
      if (!geom) return 0;
      if (geom.type === "Point") return 1;
      if (geom.type === "LineString" || geom.type === "MultiPoint") return geom.coordinates.length;
      if (geom.type === "Polygon") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return geom.coordinates.reduce((sum: number, ring: any) => sum + ring.length, 0);
      }
      if (geom.type === "MultiLineString") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return geom.coordinates.reduce((sum: number, line: any) => sum + line.length, 0);
      }
      if (geom.type === "MultiPolygon") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return geom.coordinates.reduce((sum1: number, polygon: any) => 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sum1 + polygon.reduce((sum2: number, ring: any) => sum2 + ring.length, 0), 0);
      }
      return 0;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalPoints = original.features.reduce((sum: number, f: any) => sum + countPoints(f.geometry), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const simplifiedPoints = simplified.features.reduce((sum: number, f: any) => sum + countPoints(f.geometry), 0);

    return {
      originalPoints,
      simplifiedPoints,
      reductionPercent: Math.round(((originalPoints - simplifiedPoints) / originalPoints) * 100)
    };
  }
}

export const polygonOptimizer = new PolygonOptimizer();
