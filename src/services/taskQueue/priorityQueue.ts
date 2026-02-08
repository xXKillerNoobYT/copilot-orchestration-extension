/**
 * @file taskQueue/priorityQueue.ts
 * @module PriorityQueue
 * @description Binary heap priority queue implementation (MT-016.5)
 * 
 * Efficient priority queue using a min-heap for task ordering.
 * Tasks with lower priority numbers are processed first.
 * 
 * **Simple explanation**: A smarter queue that always gives you the most
 * important item first. Like a VIP line where importance determines position.
 */

// ============================================================================
// PriorityQueue Class
// ============================================================================

/**
 * Binary heap priority queue.
 * 
 * **Simple explanation**: A special list that always keeps the most important
 * item ready to grab. When you add items, they automatically sort themselves
 * so you always get the right one first.
 */
export class PriorityQueue<T> {
    private heap: T[] = [];
    private compare: (a: T, b: T) => number;

    /**
     * Create a new priority queue
     * @param compare - Comparison function (return negative if a < b)
     */
    constructor(compare: (a: T, b: T) => number) {
        this.compare = compare;
    }

    /**
     * Add an item to the queue
     */
    enqueue(item: T): void {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    /**
     * Remove and return the highest priority item
     */
    dequeue(): T | undefined {
        if (this.heap.length === 0) return undefined;
        if (this.heap.length === 1) return this.heap.pop();

        const result = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown(0);

        return result;
    }

    /**
     * Peek at the highest priority item without removing it
     */
    peek(): T | undefined {
        return this.heap[0];
    }

    /**
     * Get the size of the queue
     */
    size(): number {
        return this.heap.length;
    }

    /**
     * Check if the queue is empty
     */
    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    /**
     * Clear the queue
     */
    clear(): void {
        this.heap = [];
    }

    /**
     * Convert to array (does not modify queue)
     */
    toArray(): T[] {
        return [...this.heap].sort(this.compare);
    }

    /**
     * Move an item up to maintain heap property
     */
    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);

            if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) {
                break;
            }

            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    /**
     * Move an item down to maintain heap property
     */
    private bubbleDown(index: number): void {
        const length = this.heap.length;

        for (; ;) {
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < length && this.compare(this.heap[leftChild], this.heap[smallest]) < 0) {
                smallest = leftChild;
            }

            if (rightChild < length && this.compare(this.heap[rightChild], this.heap[smallest]) < 0) {
                smallest = rightChild;
            }

            if (smallest === index) break;

            [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
            index = smallest;
        }
    }

    /**
     * Remove a specific item from the queue
     */
    remove(predicate: (item: T) => boolean): T | undefined {
        const index = this.heap.findIndex(predicate);
        if (index === -1) return undefined;

        const item = this.heap[index];

        // Move last item to this position
        this.heap[index] = this.heap.pop()!;

        if (index < this.heap.length) {
            this.bubbleUp(index);
            this.bubbleDown(index);
        }

        return item;
    }

    /**
     * Update an item's priority (remove and re-add)
     */
    update(predicate: (item: T) => boolean, newItem: T): boolean {
        const removed = this.remove(predicate);
        if (removed !== undefined) {
            this.enqueue(newItem);
            return true;
        }
        return false;
    }

    /**
     * Find an item without removing it
     */
    find(predicate: (item: T) => boolean): T | undefined {
        return this.heap.find(predicate);
    }

    /**
     * Check if an item exists
     */
    has(predicate: (item: T) => boolean): boolean {
        return this.heap.some(predicate);
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new PriorityQueue instance
 * @param compare - Comparison function (return negative if a < b)
 */
export function createPriorityQueue<T>(compare: (a: T, b: T) => number): PriorityQueue<T> {
    return new PriorityQueue<T>(compare);
}

/**
 * Create a min-heap priority queue for numbers
 */
export function createMinHeap(): PriorityQueue<number> {
    return createPriorityQueue<number>((a, b) => a - b);
}

/**
 * Create a max-heap priority queue for numbers
 */
export function createMaxHeap(): PriorityQueue<number> {
    return createPriorityQueue<number>((a, b) => b - a);
}
