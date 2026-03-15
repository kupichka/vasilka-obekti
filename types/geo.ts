import type { Feature, Geometry } from "geojson"

export interface GeoFeatureProps {
  id: number
  name: string
  category: string
  region?: string | string[];
  difficulty?: number
  description?: string
  aliases?: string[]
  centroid?: [number, number]
  "@id"?: string,
  [key:string]: any,
}

export type GeoFeature = Feature<Geometry, GeoFeatureProps>

export type Region = "Southwest" | "Northeast" | "Thracian Plain" | string;

export interface QuizState {
  currentObject: GeoFeature | null;
  score: number;
  totalQuestions: number;
  isCorrect: boolean | null;
  message: string;
}