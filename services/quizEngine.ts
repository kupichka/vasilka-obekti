import type { GeoFeature } from "../types/geo";

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

    setFeatures(data: any) {
        // Support both GeoJSON structure and flat arrays
        let features = data.features || data;
        
        // Build feature map and region index (single source of truth)
        this.featureMap.clear();
        this.featuresByRegion.clear();
        
        features.forEach((f: any) => {
            if (f.geometry === null) return;
            
            const id = f.properties['@id'];
            this.featureMap.set(id, f);
            
            const region = f.properties.region || 'Unknown';
            if (!this.featuresByRegion.has(region)) {
                this.featuresByRegion.set(region, new Set());
            }
            this.featuresByRegion.get(region)!.add(id);
        });
        
        // Initialize pool with all feature IDs
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
        // Schedule feature to replay in 5-7 questions
        const questionsDelay = Math.floor(Math.random() * 3) + 5; // Random between 5-7
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
        const regions = Array.from(this.featuresByRegion.keys());
        return ["All", ...regions].filter(r => r !== "Unknown");
    }
}

export const quizEngine = new QuizEngine();