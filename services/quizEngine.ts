import type { GeoFeature } from "../types/geo";

interface DeferredItem {
    feature: GeoFeature;
    questionsUntil: number;
}

class QuizEngine {
    private allFeatures: GeoFeature[] = [];
    private currentPool: GeoFeature[] = [];
    private mainQueue: GeoFeature[] = [];
    private deferredQueue: DeferredItem[] = [];
    private lastFeatureId: string | null = null;

    setFeatures(data: any) {
        // Support both GeoJSON structure and flat arrays
        let features = data.features || data;
        // Filter out features with null geometry
        this.allFeatures = features.filter((f: any) => f.geometry !== null);
        this.currentPool = [...this.allFeatures];
    }

    setRegion(region: string | "All") {
        if (region === "All") {
            this.currentPool = [...this.allFeatures];
        } else {
            this.currentPool = this.allFeatures.filter(
                (f) => f.properties.region === region
            );
        }
        this.deferredQueue = []; // Clear deferred items when switching regions
        this.generateNewPermutation();
    }

    private generateNewPermutation(): void {
        // Shuffle current pool
        this.mainQueue = this.shuffleArray([...this.currentPool]);

        // Ensure first item of new permutation isn't the same as last item of previous
        if (this.lastFeatureId !== null && this.mainQueue.length > 1) {
            const firstItemId = this.mainQueue[0].properties['@id'];
            if (firstItemId && firstItemId === this.lastFeatureId) {
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
                this.mainQueue.splice(insertPos, 0, readyItem.feature);
            } else {
                this.mainQueue.push(readyItem.feature);
            }
        }

        // If main queue is empty, generate new permutation
        if (this.mainQueue.length === 0) {
            this.generateNewPermutation();
        }

        const nextQuestion = this.mainQueue.shift() || null;
        if (nextQuestion && nextQuestion.properties['@id']) {
            this.lastFeatureId = nextQuestion.properties['@id'];
        }
        return nextQuestion;
    }

    handleGiveUp(feature: GeoFeature): void {
        // Schedule feature to replay in 5-7 questions
        const questionsDelay = Math.floor(Math.random() * 3) + 5; // Random between 5-7
        this.deferredQueue.push({
            feature,
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
        const regions = this.allFeatures.map(f => f.properties.region || "Uncategorized");
        return ["All", ...new Set(regions)];
    }
}

export const quizEngine = new QuizEngine();