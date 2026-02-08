/**
 * Tests for Plan Collaboration Features (MT-033.14)
 *
 * Covers: addComment, resolveComment, unresolveComment, deleteComment,
 * getCommentsForField, getUnresolvedComments, getCommentThread,
 * recordChange, getRecentChanges, getChangesByAuthor, getChangesForField,
 * requestReview, respondToReview, getPendingReviews,
 * renderCommentThread, renderCommentIndicator, renderChangeHistory,
 * renderReviewPanel, getCollaborationStyles, getCollaborationScript,
 * createCollaborationData
 */

import * as crypto from 'crypto';

jest.mock('crypto', () => ({
    randomUUID: jest.fn(() => 'mock-uuid-1234'),
}));

import {
    addComment,
    resolveComment,
    unresolveComment,
    deleteComment,
    getCommentsForField,
    getUnresolvedComments,
    getCommentThread,
    recordChange,
    getRecentChanges,
    getChangesByAuthor,
    getChangesForField,
    requestReview,
    respondToReview,
    getPendingReviews,
    renderCommentThread,
    renderCommentIndicator,
    renderChangeHistory,
    renderReviewPanel,
    getCollaborationStyles,
    getCollaborationScript,
    createCollaborationData,
    CollaborationData,
    Comment,
    ChangeRecord,
    ReviewRequest,
} from '../../src/ui/planCollaboration';

describe('PlanCollaboration', () => {
    let data: CollaborationData;
    let uuidCounter: number;

    beforeEach(() => {
        jest.clearAllMocks();
        uuidCounter = 0;
        (crypto.randomUUID as jest.Mock).mockImplementation(() => {
            uuidCounter++;
            return `uuid-${uuidCounter}`;
        });
        data = createCollaborationData('testUser');
    });

    // ========================================================================
    // createCollaborationData
    // ========================================================================

    describe('createCollaborationData', () => {
        it('Test 1: should create empty collaboration data with given user', () => {
            const result = createCollaborationData('alice@example.com');
            expect(result.currentUser).toBe('alice@example.com');
            expect(result.comments).toEqual([]);
            expect(result.changes).toEqual([]);
            expect(result.reviews).toEqual([]);
        });
    });

    // ========================================================================
    // Comment Management
    // ========================================================================

    describe('addComment', () => {
        it('Test 2: should add a comment to the specified field path', () => {
            const comment = addComment(data, 'overview.name', 'Looks good!');
            expect(comment.id).toBe('uuid-1');
            expect(comment.author).toBe('testUser');
            expect(comment.text).toBe('Looks good!');
            expect(comment.fieldPath).toBe('overview.name');
            expect(comment.resolved).toBe(false);
            expect(comment.parentId).toBeUndefined();
            expect(comment.createdAt).toBeInstanceOf(Date);
            expect(comment.updatedAt).toBeInstanceOf(Date);
            expect(data.comments).toHaveLength(1);
            expect(data.comments[0]).toBe(comment);
        });

        it('Test 3: should add a threaded reply with parentId', () => {
            const parent = addComment(data, 'features.0', 'Needs more detail');
            const reply = addComment(data, 'features.0', 'Added detail', parent.id);
            expect(reply.parentId).toBe(parent.id);
            expect(data.comments).toHaveLength(2);
        });

        it('Test 4: should use the current user from collaboration data', () => {
            data.currentUser = 'bob@team.com';
            const comment = addComment(data, 'goals', 'Nice goals');
            expect(comment.author).toBe('bob@team.com');
        });
    });

    describe('resolveComment', () => {
        it('Test 5: should resolve an existing comment', () => {
            const comment = addComment(data, 'overview', 'Fix typo');
            const result = resolveComment(data, comment.id);
            expect(result).toBe(true);
            expect(data.comments[0].resolved).toBe(true);
            expect(data.comments[0].resolvedBy).toBe('testUser');
            expect(data.comments[0].resolvedAt).toBeInstanceOf(Date);
        });

        it('Test 6: should return false for non-existent comment', () => {
            const result = resolveComment(data, 'nonexistent-id');
            expect(result).toBe(false);
        });
    });

    describe('unresolveComment', () => {
        it('Test 7: should unresolve a resolved comment', () => {
            const comment = addComment(data, 'overview', 'Fix typo');
            resolveComment(data, comment.id);
            expect(data.comments[0].resolved).toBe(true);

            const result = unresolveComment(data, comment.id);
            expect(result).toBe(true);
            expect(data.comments[0].resolved).toBe(false);
            expect(data.comments[0].resolvedBy).toBeUndefined();
            expect(data.comments[0].resolvedAt).toBeUndefined();
        });

        it('Test 8: should return false for non-existent comment', () => {
            const result = unresolveComment(data, 'nonexistent-id');
            expect(result).toBe(false);
        });
    });

    describe('deleteComment', () => {
        it('Test 9: should delete an existing comment', () => {
            const comment = addComment(data, 'overview', 'Remove this');
            expect(data.comments).toHaveLength(1);
            const result = deleteComment(data, comment.id);
            expect(result).toBe(true);
            expect(data.comments).toHaveLength(0);
        });

        it('Test 10: should also delete replies when parent is deleted', () => {
            const parent = addComment(data, 'overview', 'Parent comment');
            addComment(data, 'overview', 'Reply 1', parent.id);
            addComment(data, 'overview', 'Reply 2', parent.id);
            expect(data.comments).toHaveLength(3);

            deleteComment(data, parent.id);
            expect(data.comments).toHaveLength(0);
        });

        it('Test 11: should return false for non-existent comment', () => {
            const result = deleteComment(data, 'nonexistent-id');
            expect(result).toBe(false);
        });

        it('Test 12: should not delete unrelated comments when deleting a parent', () => {
            const parent = addComment(data, 'overview', 'Parent');
            addComment(data, 'overview', 'Reply', parent.id);
            const unrelated = addComment(data, 'features', 'Unrelated comment');

            deleteComment(data, parent.id);
            expect(data.comments).toHaveLength(1);
            expect(data.comments[0].id).toBe(unrelated.id);
        });
    });

    describe('getCommentsForField', () => {
        it('Test 13: should return only comments for the specified field', () => {
            addComment(data, 'overview.name', 'Comment on name');
            addComment(data, 'overview.description', 'Comment on description');
            addComment(data, 'overview.name', 'Another on name');

            const result = getCommentsForField(data, 'overview.name');
            expect(result).toHaveLength(2);
            expect(result.every(c => c.fieldPath === 'overview.name')).toBe(true);
        });

        it('Test 14: should return empty array if no comments match', () => {
            addComment(data, 'overview', 'Some comment');
            const result = getCommentsForField(data, 'features');
            expect(result).toEqual([]);
        });
    });

    describe('getUnresolvedComments', () => {
        it('Test 15: should return only unresolved top-level comments', () => {
            const c1 = addComment(data, 'overview', 'Unresolved 1');
            const c2 = addComment(data, 'features', 'Unresolved 2');
            const c3 = addComment(data, 'goals', 'Will resolve');
            addComment(data, 'overview', 'Reply to c1', c1.id);
            resolveComment(data, c3.id);

            const result = getUnresolvedComments(data);
            expect(result).toHaveLength(2);
            expect(result.map(c => c.id)).toContain(c1.id);
            expect(result.map(c => c.id)).toContain(c2.id);
        });

        it('Test 16: should exclude replies even if unresolved', () => {
            const parent = addComment(data, 'overview', 'Parent');
            addComment(data, 'overview', 'Reply', parent.id);

            const result = getUnresolvedComments(data);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(parent.id);
        });
    });

    describe('getCommentThread', () => {
        it('Test 17: should return parent and sorted replies', () => {
            const parent = addComment(data, 'overview', 'Parent comment');

            // Add replies with controlled timestamps
            const reply1 = addComment(data, 'overview', 'First reply', parent.id);
            reply1.createdAt = new Date('2025-01-01T10:00:00Z');
            const reply2 = addComment(data, 'overview', 'Second reply', parent.id);
            reply2.createdAt = new Date('2025-01-01T11:00:00Z');

            const thread = getCommentThread(data, parent.id);
            expect(thread).toHaveLength(3);
            expect(thread[0].id).toBe(parent.id);
            expect(thread[1].text).toBe('First reply');
            expect(thread[2].text).toBe('Second reply');
        });

        it('Test 18: should return empty array for non-existent comment', () => {
            const result = getCommentThread(data, 'nonexistent');
            expect(result).toEqual([]);
        });

        it('Test 19: should return empty array if commentId refers to a reply', () => {
            const parent = addComment(data, 'overview', 'Parent');
            const reply = addComment(data, 'overview', 'Reply', parent.id);

            const result = getCommentThread(data, reply.id);
            expect(result).toEqual([]);
        });
    });

    // ========================================================================
    // Change Tracking
    // ========================================================================

    describe('recordChange', () => {
        it('Test 20: should record a change and return it', () => {
            const change = recordChange(
                data, 'update', 'overview.name', 'Old Name', 'New Name', 'Updated project name'
            );

            expect(change.id).toBeDefined();
            expect(change.author).toBe('testUser');
            expect(change.changeType).toBe('update');
            expect(change.fieldPath).toBe('overview.name');
            expect(change.previousValue).toBe('Old Name');
            expect(change.newValue).toBe('New Name');
            expect(change.description).toBe('Updated project name');
            expect(change.timestamp).toBeInstanceOf(Date);
            expect(data.changes).toHaveLength(1);
        });

        it('Test 21: should trim changes to last 1000 when exceeding limit', () => {
            // Fill data with 1000 changes directly
            for (let i = 0; i < 1000; i++) {
                data.changes.push({
                    id: `old-${i}`,
                    author: 'testUser',
                    timestamp: new Date(),
                    changeType: 'update',
                    fieldPath: `field.${i}`,
                    description: `Change ${i}`,
                });
            }
            expect(data.changes).toHaveLength(1000);

            // Recording one more should trigger trimming
            const newChange = recordChange(
                data, 'create', 'new.field', undefined, 'value', 'New entry'
            );

            expect(data.changes).toHaveLength(1000);
            // The first old change should be gone, last old change + new change present
            expect(data.changes[data.changes.length - 1]).toBe(newChange);
            expect(data.changes[0].id).toBe('old-1');
        });

        it('Test 22: should support all change types', () => {
            const createChange = recordChange(data, 'create', 'f.1', undefined, 'val', 'Created');
            const updateChange = recordChange(data, 'update', 'f.2', 'old', 'new', 'Updated');
            const deleteChange = recordChange(data, 'delete', 'f.3', 'old', undefined, 'Deleted');

            expect(createChange.changeType).toBe('create');
            expect(updateChange.changeType).toBe('update');
            expect(deleteChange.changeType).toBe('delete');
            expect(data.changes).toHaveLength(3);
        });
    });

    describe('getRecentChanges', () => {
        it('Test 23: should return changes sorted by most recent first', () => {
            const c1 = recordChange(data, 'create', 'f.1', null, 'v1', 'First');
            c1.timestamp = new Date('2025-01-01T10:00:00Z');
            const c2 = recordChange(data, 'update', 'f.2', 'v1', 'v2', 'Second');
            c2.timestamp = new Date('2025-01-01T12:00:00Z');
            const c3 = recordChange(data, 'update', 'f.3', 'v2', 'v3', 'Third');
            c3.timestamp = new Date('2025-01-01T11:00:00Z');

            const recent = getRecentChanges(data);
            expect(recent[0].description).toBe('Second');
            expect(recent[1].description).toBe('Third');
            expect(recent[2].description).toBe('First');
        });

        it('Test 24: should respect the limit parameter', () => {
            for (let i = 0; i < 10; i++) {
                recordChange(data, 'update', `f.${i}`, null, i, `Change ${i}`);
            }

            const limited = getRecentChanges(data, 3);
            expect(limited).toHaveLength(3);
        });

        it('Test 25: should default to 20 when no limit given', () => {
            for (let i = 0; i < 30; i++) {
                recordChange(data, 'update', `f.${i}`, null, i, `Change ${i}`);
            }

            const result = getRecentChanges(data);
            expect(result).toHaveLength(20);
        });
    });

    describe('getChangesByAuthor', () => {
        it('Test 26: should filter changes by author', () => {
            recordChange(data, 'update', 'f.1', null, 'v1', 'By testUser');
            data.currentUser = 'otherUser';
            recordChange(data, 'update', 'f.2', null, 'v2', 'By otherUser');
            data.currentUser = 'testUser';
            recordChange(data, 'update', 'f.3', null, 'v3', 'By testUser again');

            const result = getChangesByAuthor(data, 'testUser');
            expect(result).toHaveLength(2);
            expect(result.every(c => c.author === 'testUser')).toBe(true);
        });
    });

    describe('getChangesForField', () => {
        it('Test 27: should return changes matching field path prefix', () => {
            recordChange(data, 'update', 'overview.name', null, 'v', 'Name change');
            recordChange(data, 'update', 'overview.description', null, 'v', 'Desc change');
            recordChange(data, 'update', 'features.0', null, 'v', 'Feature change');

            const result = getChangesForField(data, 'overview');
            expect(result).toHaveLength(2);
            expect(result[0].description).toBe('Name change');
            expect(result[1].description).toBe('Desc change');
        });

        it('Test 28: should return exact field match as well', () => {
            recordChange(data, 'update', 'overview', null, 'v', 'Exact match');

            const result = getChangesForField(data, 'overview');
            expect(result).toHaveLength(1);
        });
    });

    // ========================================================================
    // Review Workflow
    // ========================================================================

    describe('requestReview', () => {
        it('Test 29: should create a review request with pending status', () => {
            const review = requestReview(data, 'reviewer@team.com', 'Please review this');
            expect(review.id).toBeDefined();
            expect(review.requester).toBe('testUser');
            expect(review.reviewer).toBe('reviewer@team.com');
            expect(review.status).toBe('pending');
            expect(review.message).toBe('Please review this');
            expect(review.requestedAt).toBeInstanceOf(Date);
            expect(review.respondedAt).toBeUndefined();
            expect(data.reviews).toHaveLength(1);
        });

        it('Test 30: should work without a message', () => {
            const review = requestReview(data, 'reviewer@team.com');
            expect(review.message).toBeUndefined();
            expect(review.status).toBe('pending');
        });
    });

    describe('respondToReview', () => {
        it('Test 31: should approve a review request', () => {
            const review = requestReview(data, 'reviewer@team.com');
            const result = respondToReview(data, review.id, 'approved', 'Looks good!');
            expect(result).toBe(true);
            expect(data.reviews[0].status).toBe('approved');
            expect(data.reviews[0].response).toBe('Looks good!');
            expect(data.reviews[0].respondedAt).toBeInstanceOf(Date);
        });

        it('Test 32: should request changes on a review', () => {
            const review = requestReview(data, 'reviewer@team.com');
            const result = respondToReview(data, review.id, 'changes_requested', 'Needs fixes');
            expect(result).toBe(true);
            expect(data.reviews[0].status).toBe('changes_requested');
            expect(data.reviews[0].response).toBe('Needs fixes');
        });

        it('Test 33: should dismiss a review', () => {
            const review = requestReview(data, 'reviewer@team.com');
            const result = respondToReview(data, review.id, 'dismissed');
            expect(result).toBe(true);
            expect(data.reviews[0].status).toBe('dismissed');
        });

        it('Test 34: should return false for non-existent review', () => {
            const result = respondToReview(data, 'nonexistent-id', 'approved');
            expect(result).toBe(false);
        });
    });

    describe('getPendingReviews', () => {
        it('Test 35: should return only pending reviews for the current user', () => {
            data.currentUser = 'requester';
            requestReview(data, 'alice@team.com', 'Review 1');
            requestReview(data, 'bob@team.com', 'Review 2');

            // Switch to alice - she should see her pending review
            data.currentUser = 'alice@team.com';
            const pendingForAlice = getPendingReviews(data);
            expect(pendingForAlice).toHaveLength(1);
            expect(pendingForAlice[0].reviewer).toBe('alice@team.com');
        });

        it('Test 36: should exclude responded reviews', () => {
            data.currentUser = 'requester';
            const review = requestReview(data, 'reviewer@team.com');
            respondToReview(data, review.id, 'approved');

            data.currentUser = 'reviewer@team.com';
            const pending = getPendingReviews(data);
            expect(pending).toHaveLength(0);
        });
    });

    // ========================================================================
    // UI Rendering
    // ========================================================================

    describe('renderCommentThread', () => {
        it('Test 37: should return empty string for empty thread', () => {
            const result = renderCommentThread([]);
            expect(result).toBe('');
        });

        it('Test 38: should render parent comment with actions', () => {
            const parent: Comment = {
                id: 'c-1',
                author: 'alice',
                text: 'Great plan!',
                createdAt: new Date(),
                updatedAt: new Date(),
                resolved: false,
                fieldPath: 'overview',
            };

            const html = renderCommentThread([parent]);
            expect(html).toContain('data-comment-id="c-1"');
            expect(html).toContain('alice');
            expect(html).toContain('Great plan!');
            expect(html).toContain("resolveComment('c-1')");
            expect(html).toContain("replyToComment('c-1')");
            expect(html).toContain("deleteComment('c-1')");
            expect(html).not.toContain('resolved');
        });

        it('Test 39: should render resolved comment with reopen button', () => {
            const parent: Comment = {
                id: 'c-2',
                author: 'bob',
                text: 'Fixed this',
                createdAt: new Date(),
                updatedAt: new Date(),
                resolved: true,
                resolvedBy: 'alice',
                resolvedAt: new Date(),
                fieldPath: 'overview',
            };

            const html = renderCommentThread([parent]);
            expect(html).toContain('comment-thread resolved');
            expect(html).toContain("unresolveComment('c-2')");
            expect(html).toContain('Reopen');
            expect(html).toContain('Resolved by alice');
        });

        it('Test 40: should render replies within the thread', () => {
            const parent: Comment = {
                id: 'c-3',
                author: 'alice',
                text: 'Parent text',
                createdAt: new Date(),
                updatedAt: new Date(),
                resolved: false,
                fieldPath: 'overview',
            };
            const reply: Comment = {
                id: 'c-4',
                author: 'bob',
                text: 'Reply text',
                createdAt: new Date(),
                updatedAt: new Date(),
                resolved: false,
                fieldPath: 'overview',
                parentId: 'c-3',
            };

            const html = renderCommentThread([parent, reply]);
            expect(html).toContain('comment-replies');
            expect(html).toContain('Reply text');
            expect(html).toContain('bob');
        });

        it('Test 41: should escape HTML in author and text', () => {
            const parent: Comment = {
                id: 'c-5',
                author: '<script>alert("xss")</script>',
                text: 'Text with <b>html</b> & "quotes"',
                createdAt: new Date(),
                updatedAt: new Date(),
                resolved: false,
                fieldPath: 'overview',
            };

            const html = renderCommentThread([parent]);
            expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
            expect(html).toContain('Text with &lt;b&gt;html&lt;/b&gt; &amp; &quot;quotes&quot;');
            expect(html).not.toContain('<script>');
        });
    });

    describe('renderCommentIndicator', () => {
        it('Test 42: should render add-comment button when count is zero', () => {
            const html = renderCommentIndicator('overview.name', 0);
            expect(html).toContain("addCommentTo('overview.name')");
            expect(html).toContain('Add comment');
            expect(html).toContain('comment-indicator add');
        });

        it('Test 43: should render comment count when comments exist', () => {
            const html = renderCommentIndicator('features.0', 5);
            expect(html).toContain("showCommentsFor('features.0')");
            expect(html).toContain('5 comment(s)');
            expect(html).toContain('has-comments');
        });
    });

    describe('renderChangeHistory', () => {
        it('Test 44: should render empty state when no changes', () => {
            const html = renderChangeHistory([]);
            expect(html).toContain('No changes recorded yet');
            expect(html).toContain('change-history-empty');
        });

        it('Test 45: should render change items with appropriate icons', () => {
            const changes: ChangeRecord[] = [
                {
                    id: 'ch-1',
                    author: 'alice',
                    timestamp: new Date(),
                    changeType: 'create',
                    fieldPath: 'features.0',
                    description: 'Added new feature',
                },
                {
                    id: 'ch-2',
                    author: 'bob',
                    timestamp: new Date(),
                    changeType: 'update',
                    fieldPath: 'overview',
                    description: 'Updated project name',
                },
                {
                    id: 'ch-3',
                    author: 'charlie',
                    timestamp: new Date(),
                    changeType: 'delete',
                    fieldPath: 'goals.2',
                    description: 'Removed goal',
                },
            ];

            const html = renderChangeHistory(changes);
            expect(html).toContain('change-history');
            expect(html).toContain('Added new feature');
            expect(html).toContain('Updated project name');
            expect(html).toContain('Removed goal');
            expect(html).toContain('alice');
            expect(html).toContain('bob');
            expect(html).toContain('charlie');
        });

        it('Test 46: should escape HTML in change descriptions', () => {
            const changes: ChangeRecord[] = [
                {
                    id: 'ch-4',
                    author: '<script>evil</script>',
                    timestamp: new Date(),
                    changeType: 'update',
                    fieldPath: 'f',
                    description: 'Desc with <b>html</b>',
                },
            ];

            const html = renderChangeHistory(changes);
            expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
            expect(html).toContain('Desc with &lt;b&gt;html&lt;/b&gt;');
        });
    });

    describe('renderReviewPanel', () => {
        it('Test 47: should show no-reviews message when no pending reviews', () => {
            const html = renderReviewPanel([]);
            expect(html).toContain('No pending reviews');
            expect(html).toContain('Request Review');
        });

        it('Test 48: should render pending reviews with action buttons', () => {
            const reviews: ReviewRequest[] = [
                {
                    id: 'rev-1',
                    requester: 'alice',
                    reviewer: 'bob',
                    status: 'pending',
                    message: 'Please take a look',
                    requestedAt: new Date(),
                },
            ];

            const html = renderReviewPanel(reviews);
            expect(html).toContain('alice');
            expect(html).toContain('Please take a look');
            expect(html).toContain("approveReview('rev-1')");
            expect(html).toContain("requestChanges('rev-1')");
            expect(html).toContain("dismissReview('rev-1')");
        });

        it('Test 49: should not render non-pending reviews in the pending section', () => {
            const reviews: ReviewRequest[] = [
                {
                    id: 'rev-2',
                    requester: 'alice',
                    reviewer: 'bob',
                    status: 'approved',
                    requestedAt: new Date(),
                    respondedAt: new Date(),
                },
            ];

            const html = renderReviewPanel(reviews);
            expect(html).toContain('No pending reviews');
        });

        it('Test 50: should render review without message gracefully', () => {
            const reviews: ReviewRequest[] = [
                {
                    id: 'rev-3',
                    requester: 'charlie',
                    reviewer: 'dave',
                    status: 'pending',
                    requestedAt: new Date(),
                },
            ];

            const html = renderReviewPanel(reviews);
            expect(html).toContain('charlie');
            expect(html).not.toContain('review-message');
        });
    });

    // ========================================================================
    // Styles and Script
    // ========================================================================

    describe('getCollaborationStyles', () => {
        it('Test 51: should return CSS string with key selectors', () => {
            const css = getCollaborationStyles();
            expect(css).toContain('.comment-thread');
            expect(css).toContain('.comment-thread.resolved');
            expect(css).toContain('.comment-indicator');
            expect(css).toContain('.change-history');
            expect(css).toContain('.review-panel');
            expect(css).toContain('.comment-reply-form');
        });
    });

    describe('getCollaborationScript', () => {
        it('Test 52: should return JavaScript with all handler functions', () => {
            const script = getCollaborationScript();
            expect(script).toContain('function addCommentTo(fieldPath)');
            expect(script).toContain('function showCommentsFor(fieldPath)');
            expect(script).toContain('function replyToComment(commentId)');
            expect(script).toContain('function submitReply(commentId)');
            expect(script).toContain('function resolveComment(commentId)');
            expect(script).toContain('function unresolveComment(commentId)');
            expect(script).toContain('function deleteComment(commentId)');
            expect(script).toContain('function approveReview(reviewId)');
            expect(script).toContain('function requestChanges(reviewId)');
            expect(script).toContain('function dismissReview(reviewId)');
            expect(script).toContain('function openRequestReview()');
        });

        it('Test 53: should use vscode.postMessage for communication', () => {
            const script = getCollaborationScript();
            expect(script).toContain('vscode.postMessage');
        });
    });

    // ========================================================================
    // Edge Cases and Integration
    // ========================================================================

    describe('Edge cases', () => {
        it('Test 54: should handle multiple comments on same field from different users', () => {
            data.currentUser = 'alice';
            addComment(data, 'overview.name', 'Alice comment');
            data.currentUser = 'bob';
            addComment(data, 'overview.name', 'Bob comment');

            const fieldComments = getCommentsForField(data, 'overview.name');
            expect(fieldComments).toHaveLength(2);
            expect(fieldComments[0].author).toBe('alice');
            expect(fieldComments[1].author).toBe('bob');
        });

        it('Test 55: should handle resolving and unresolving the same comment multiple times', () => {
            const comment = addComment(data, 'overview', 'Toggle me');

            resolveComment(data, comment.id);
            expect(data.comments[0].resolved).toBe(true);

            unresolveComment(data, comment.id);
            expect(data.comments[0].resolved).toBe(false);

            resolveComment(data, comment.id);
            expect(data.comments[0].resolved).toBe(true);
            expect(data.comments[0].resolvedBy).toBe('testUser');
        });

        it('Test 56: should not mutate original changes array order in getRecentChanges', () => {
            const c1 = recordChange(data, 'create', 'f.1', null, 'v1', 'First');
            c1.timestamp = new Date('2025-01-01T10:00:00Z');
            const c2 = recordChange(data, 'update', 'f.2', 'v1', 'v2', 'Second');
            c2.timestamp = new Date('2025-01-01T12:00:00Z');

            getRecentChanges(data);

            // Original array should still be in insertion order
            expect(data.changes[0].description).toBe('First');
            expect(data.changes[1].description).toBe('Second');
        });

        it('Test 57: should handle empty string field paths', () => {
            const comment = addComment(data, '', 'Root-level comment');
            expect(comment.fieldPath).toBe('');
            const result = getCommentsForField(data, '');
            expect(result).toHaveLength(1);
        });

        it('Test 58: should handle getChangesForField with prefix matching correctly', () => {
            recordChange(data, 'update', 'overview', null, 'v', 'Exact');
            recordChange(data, 'update', 'overview.name', null, 'v', 'Sub-field');
            recordChange(data, 'update', 'overviewExtra', null, 'v', 'Similar prefix');

            const result = getChangesForField(data, 'overview');
            // 'overview', 'overview.name', and 'overviewExtra' all start with 'overview'
            expect(result).toHaveLength(3);
        });
    });
});
