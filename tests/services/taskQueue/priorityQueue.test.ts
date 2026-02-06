/**
 * @file taskQueue/priorityQueue.test.ts
 * @description Tests for PriorityQueue (MT-016.5)
 */

import {
    PriorityQueue,
    createPriorityQueue,
    createMinHeap,
    createMaxHeap
} from '../../../src/services/taskQueue/priorityQueue';

describe('PriorityQueue', () => {
    describe('Test 1: constructor', () => {
        it('should create empty queue', () => {
            const queue = createMinHeap();
            expect(queue.size()).toBe(0);
            expect(queue.isEmpty()).toBe(true);
        });
    });

    describe('Test 2: enqueue', () => {
        it('should add items to queue', () => {
            const queue = createMinHeap();
            queue.enqueue(5);
            queue.enqueue(3);
            queue.enqueue(7);

            expect(queue.size()).toBe(3);
        });
    });

    describe('Test 3: dequeue', () => {
        it('should return items in priority order (min-heap)', () => {
            const queue = createMinHeap();
            queue.enqueue(5);
            queue.enqueue(3);
            queue.enqueue(7);
            queue.enqueue(1);

            expect(queue.dequeue()).toBe(1);
            expect(queue.dequeue()).toBe(3);
            expect(queue.dequeue()).toBe(5);
            expect(queue.dequeue()).toBe(7);
        });

        it('should return items in priority order (max-heap)', () => {
            const queue = createMaxHeap();
            queue.enqueue(5);
            queue.enqueue(3);
            queue.enqueue(7);
            queue.enqueue(1);

            expect(queue.dequeue()).toBe(7);
            expect(queue.dequeue()).toBe(5);
            expect(queue.dequeue()).toBe(3);
            expect(queue.dequeue()).toBe(1);
        });

        it('should return undefined for empty queue', () => {
            const queue = createMinHeap();
            expect(queue.dequeue()).toBeUndefined();
        });
    });

    describe('Test 4: peek', () => {
        it('should return highest priority item without removing', () => {
            const queue = createMinHeap();
            queue.enqueue(5);
            queue.enqueue(3);

            expect(queue.peek()).toBe(3);
            expect(queue.size()).toBe(2); // Not removed
        });
    });

    describe('Test 5: custom comparator', () => {
        it('should work with objects and custom compare', () => {
            interface Task { id: string; priority: number }

            const queue = createPriorityQueue<Task>((a, b) => a.priority - b.priority);
            queue.enqueue({ id: 'A', priority: 3 });
            queue.enqueue({ id: 'B', priority: 1 });
            queue.enqueue({ id: 'C', priority: 2 });

            expect(queue.dequeue()?.id).toBe('B');
            expect(queue.dequeue()?.id).toBe('C');
            expect(queue.dequeue()?.id).toBe('A');
        });
    });

    describe('Test 6: remove', () => {
        it('should remove specific item', () => {
            const queue = createMinHeap();
            queue.enqueue(1);
            queue.enqueue(2);
            queue.enqueue(3);

            const removed = queue.remove(x => x === 2);

            expect(removed).toBe(2);
            expect(queue.size()).toBe(2);
        });

        it('should return undefined if not found', () => {
            const queue = createMinHeap();
            queue.enqueue(1);

            expect(queue.remove(x => x === 5)).toBeUndefined();
        });
    });

    describe('Test 7: update', () => {
        it('should update item priority', () => {
            interface Task { id: string; priority: number }

            const queue = createPriorityQueue<Task>((a, b) => a.priority - b.priority);
            queue.enqueue({ id: 'A', priority: 3 });
            queue.enqueue({ id: 'B', priority: 2 });

            // Update A to be highest priority
            queue.update(t => t.id === 'A', { id: 'A', priority: 1 });

            expect(queue.dequeue()?.id).toBe('A');
        });
    });

    describe('Test 8: find and has', () => {
        it('should find item', () => {
            const queue = createMinHeap();
            queue.enqueue(1);
            queue.enqueue(2);
            queue.enqueue(3);

            expect(queue.find(x => x === 2)).toBe(2);
            expect(queue.find(x => x === 5)).toBeUndefined();
        });

        it('should check if item exists', () => {
            const queue = createMinHeap();
            queue.enqueue(1);
            queue.enqueue(2);

            expect(queue.has(x => x === 1)).toBe(true);
            expect(queue.has(x => x === 5)).toBe(false);
        });
    });

    describe('Test 9: clear and toArray', () => {
        it('should clear queue', () => {
            const queue = createMinHeap();
            queue.enqueue(1);
            queue.enqueue(2);
            queue.clear();

            expect(queue.isEmpty()).toBe(true);
        });

        it('should convert to sorted array', () => {
            const queue = createMinHeap();
            queue.enqueue(3);
            queue.enqueue(1);
            queue.enqueue(2);

            expect(queue.toArray()).toEqual([1, 2, 3]);
        });
    });
});
