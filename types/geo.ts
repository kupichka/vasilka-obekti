import type { Feature, Geometry } from "geojson"

export const ALL_REGIONS = [
  "Градове 1", "Градове 2", "Градове 3", "Градове 4", "Градове 5", "Градове 6", "Градове 7",
  "Градове (257)",
  "All",
  "Дунавска равнина",
  "Предбалкан",
  "Стара планина",
  "Задбалкански котловини",
  "Краище",
  "Осоговско-Беласишка",
  "Средногорие",
  "Рила",
  "Пирин",
  "Родопи",
  "Тракийско-Странджанска",
  "Черноморска",
  "Защитени области (27)",
  "Реки (32)"
] as const; // 'as const' makes the strings literal types

// This means 'Region' is now specifically one of the strings above
export type Region = (typeof ALL_REGIONS)[number] | string;

export interface GeoFeatureProps {
  id: number
  name: string
  category: string
  region?: Region | Region[];
  difficulty?: number
  description?: string
  aliases?: string[]
  centroid?: [number, number]
  "@id"?: string,
  [key:string]: any,
}

export type GeoFeature = Feature<Geometry, GeoFeatureProps>

export interface QuizState {
  currentObject: GeoFeature | null;
  score: number;
  totalQuestions: number;
  isCorrect: boolean | null;
  message: string;
}