import type { GeoFeature } from "../types/geo";
import * as topojson from "topojson-client";

interface DeferredItem {
    featureId: string;
    questionsUntil: number;
}

class QuizEngine {
    private featureMap: Map<string, GeoFeature> = new Map();
    private featuresByRegion: Map<string, Set<string>> = new Map();
    private currentPoolIds: Set<string> = new Set();
    private mainQueue: string[] = [];
    private deferredQueue: DeferredItem[] = [];
    private lastFeatureId: string | null = null;

    setFeatures(topoData: any) {
        this.featureMap.clear();
        this.featuresByRegion.clear();
        
        // Track global index across layers to prevent collisions
        let globalIndex = 0;

        Object.keys(topoData.objects).forEach((layerName) => {
            const data = topojson.feature(topoData, topoData.objects[layerName]) as any;
            const features = data.type === "FeatureCollection" ? data.features : [data];

            features.forEach((f: any) => {
                if (!f.geometry) return;

                // FIX: Use the exact same logic as MapService
                // Use existing ID, or create a truly unique one including layer name
                const id = f.properties?.['@id'] || f.id || `feat-${layerName}-${globalIndex}`;
                
                // Ensure both @id and __id are set so MapService and geojson-vt see them
                if (!f.properties) f.properties = {};
                f.properties['@id'] = id;
                f.properties['__id'] = id; 
                f._id = id; // Internal reference

                this.featureMap.set(id.toString(), f);
                
                let regions = f.properties.region || 'Unknown';
                if (!Array.isArray(regions)) regions = [regions];

                regions.forEach((region: string) => {
                if (!this.featuresByRegion.has(region)) {
                    this.featuresByRegion.set(region, new Set());
                }
                this.featuresByRegion.get(region)!.add(id.toString());
                });
                
                globalIndex++;
            });
        });
        this.currentPoolIds = new Set(this.featureMap.keys());
    }

    setRegion(region: string | "All") {
        if (region === "All") {
            this.currentPoolIds = new Set(this.featureMap.keys());
        } else {
            this.currentPoolIds = new Set(this.featuresByRegion.get(region) || []);
        }
        this.deferredQueue = [];
        this.generateNewPermutation();
    }

    private generateNewPermutation(): void {
        // Shuffle current pool IDs
        this.mainQueue = this.shuffleArray(Array.from(this.currentPoolIds));

        // Ensure first item of new permutation isn't the same as last item of previous
        if (this.lastFeatureId !== null && this.mainQueue.length > 1) {
            const firstItemId = this.mainQueue[0];
            if (firstItemId === this.lastFeatureId) {
                // Swap first item with a random other item
                const randomIndex = Math.floor(Math.random() * (this.mainQueue.length - 1)) + 1;
                [this.mainQueue[0], this.mainQueue[randomIndex]] = [this.mainQueue[randomIndex], this.mainQueue[0]];
            }
        }
    }

    private shuffleArray<T>(array: T[]): T[] {
        // Fisher-Yates shuffle
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    getNextQuestion(): GeoFeature | null {
        // Decrement all deferred timers (one question has passed)
        this.deferredQueue.forEach(item => item.questionsUntil--);

        // Check if any deferred items are ready to be replayed
        const readyIndex = this.deferredQueue.findIndex(item => item.questionsUntil <= 0);
        if (readyIndex >= 0) {
            const readyItem = this.deferredQueue[readyIndex];
            this.deferredQueue.splice(readyIndex, 1);

            // Insert into main queue at random position (not first or last to avoid immediate repeat)
            if (this.mainQueue.length > 0) {
                const insertPos = Math.floor(Math.random() * (this.mainQueue.length - 1)) + 1;
                this.mainQueue.splice(insertPos, 0, readyItem.featureId);
            } else {
                this.mainQueue.push(readyItem.featureId);
            }
        }

        // If main queue is empty, generate new permutation
        if (this.mainQueue.length === 0) {
            this.generateNewPermutation();
        }

        const nextQuestionId = this.mainQueue.shift() || null;
        if (nextQuestionId) {
            this.lastFeatureId = nextQuestionId;
            return this.featureMap.get(nextQuestionId) || null;
        }
        return null;
    }

    handleGiveUp(feature: GeoFeature): void {
        // Schedule feature to replay in a few questions
        const questionsDelay = Math.floor(Math.random() * 4) + 4;
        const featureId = feature.properties['@id'];
        if (!featureId) {
            // if we somehow don't have an id, skip deferring
            return;
        }
        this.deferredQueue.push({
            featureId,
            questionsUntil: questionsDelay,
        });
    }

    checkAnswer(selectedId: number, targetId: number): boolean {
        return selectedId === targetId;
    }

    getPoolSize(): number {
        return this.mainQueue.length + this.deferredQueue.length;
    }

    getAvailableRegions(): string[] {
        // 1. Define your desired order exactly as they appear in the JSON 'region' property
        const regionPriority = [
            "Дунавска равнина",
            "Предбалкан", 
            "Стара планина", 
            "Задбалкански котловини",
            "Средногорие",
            "Тракийско-Странджанска",
            "Рила",
            "Пирин",
            "Родопи",
            "Черноморска",
            "Градове (257)",
            "Реки (25)"
        ];

        const regions = Array.from(this.featuresByRegion.keys())
            .filter(r => r !== "Unknown")
            .sort((a, b) => {
                const indexA = regionPriority.indexOf(a);
                const indexB = regionPriority.indexOf(b);

                // If both are in the priority list, sort by their position there
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                
                // If only one is in the list, move it to the front
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;

                // If neither are in the list, sort alphabetically as a fallback
                return a.localeCompare(b);
            });

        return ["All", ...regions];
    }
}

export const quizEngine = new QuizEngine();