/**
 * Plan Collaboration Features (MT-033.14)
 *
 * **Simple explanation**: Add inline comments to any section of your plan,
 * track who changed what, and use a review workflow for team feedback.
 * Like Google Docs comments but for project plans.
 *
 * @module ui/planCollaboration
 */

import * as crypto from 'crypto';
import { CompletePlan } from '../planning/types';

// ============================================================================
// Types
// ============================================================================

export interface Comment {
    /** Unique comment ID */
    id: string;
    /** Author name/email */
    author: string;
    /** Comment text */
    text: string;
    /** When the comment was created */
    createdAt: Date;
    /** When the comment was last updated */
    updatedAt: Date;
    /** Whether the comment is resolved */
    resolved: boolean;
    /** Who resolved it */
    resolvedBy?: string;
    /** When it was resolved */
    resolvedAt?: Date;
    /** Field path this comment is attached to */
    fieldPath: string;
    /** Parent comment ID for threading */
    parentId?: string;
}

export interface ChangeRecord {
    /** Unique change ID */
    id: string;
    /** Author name/email */
    author: string;
    /** Timestamp */
    timestamp: Date;
    /** Type of change */
    changeType: 'create' | 'update' | 'delete';
    /** Field that was changed */
    fieldPath: string;
    /** Previous value (for updates/deletes) */
    previousValue?: unknown;
    /** New value (for creates/updates) */
    newValue?: unknown;
    /** Human-readable description */
    description: string;
}

export interface ReviewRequest {
    /** Unique request ID */
    id: string;
    /** Requester name/email */
    requester: string;
    /** Reviewer name/email */
    reviewer: string;
    /** Status */
    status: 'pending' | 'approved' | 'changes_requested' | 'dismissed';
    /** Request message */
    message?: string;
    /** Response message */
    response?: string;
    /** When requested */
    requestedAt: Date;
    /** When responded */
    respondedAt?: Date;
}

export interface CollaborationData {
    /** Comments on the plan */
    comments: Comment[];
    /** Change history */
    changes: ChangeRecord[];
    /** Review requests */
    reviews: ReviewRequest[];
    /** Current user */
    currentUser: string;
}

// ============================================================================
// Comment Management
// ============================================================================

/**
 * Add a new comment to a plan section.
 *
 * **Simple explanation**: Attaches a comment to a specific part of your plan
 * so reviewers can give feedback exactly where it's needed.
 */
export function addComment(
    data: CollaborationData,
    fieldPath: string,
    text: string,
    parentId?: string
): Comment {
    const comment: Comment = {
        id: crypto.randomUUID(),
        author: data.currentUser,
        text,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolved: false,
        fieldPath,
        parentId,
    };

    data.comments.push(comment);
    return comment;
}

/**
 * Resolve a comment (mark as addressed).
 */
export function resolveComment(data: CollaborationData, commentId: string): boolean {
    const comment = data.comments.find(c => c.id === commentId);
    if (!comment) return false;

    comment.resolved = true;
    comment.resolvedBy = data.currentUser;
    comment.resolvedAt = new Date();
    return true;
}

/**
 * Unresolve a comment (reopen).
 */
export function unresolveComment(data: CollaborationData, commentId: string): boolean {
    const comment = data.comments.find(c => c.id === commentId);
    if (!comment) return false;

    comment.resolved = false;
    comment.resolvedBy = undefined;
    comment.resolvedAt = undefined;
    return true;
}

/**
 * Delete a comment.
 */
export function deleteComment(data: CollaborationData, commentId: string): boolean {
    const index = data.comments.findIndex(c => c.id === commentId);
    if (index === -1) return false;

    data.comments.splice(index, 1);
    // Also delete replies
    data.comments = data.comments.filter(c => c.parentId !== commentId);
    return true;
}

/**
 * Get comments for a specific field.
 */
export function getCommentsForField(data: CollaborationData, fieldPath: string): Comment[] {
    return data.comments.filter(c => c.fieldPath === fieldPath);
}

/**
 * Get all unresolved comments.
 */
export function getUnresolvedComments(data: CollaborationData): Comment[] {
    return data.comments.filter(c => !c.resolved && !c.parentId);
}

/**
 * Get comment thread (parent + replies).
 */
export function getCommentThread(data: CollaborationData, commentId: string): Comment[] {
    const parent = data.comments.find(c => c.id === commentId && !c.parentId);
    if (!parent) return [];

    const replies = data.comments
        .filter(c => c.parentId === commentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return [parent, ...replies];
}

// ============================================================================
// Change Tracking
// ============================================================================

/**
 * Record a change to the plan.
 *
 * **Simple explanation**: Keeps track of every edit so you can see who
 * changed what and when. Like version history in Google Docs.
 */
export function recordChange(
    data: CollaborationData,
    changeType: ChangeRecord['changeType'],
    fieldPath: string,
    previousValue: unknown,
    newValue: unknown,
    description: string
): ChangeRecord {
    const change: ChangeRecord = {
        id: crypto.randomUUID(),
        author: data.currentUser,
        timestamp: new Date(),
        changeType,
        fieldPath,
        previousValue,
        newValue,
        description,
    };

    data.changes.push(change);

    // Keep only last 1000 changes
    if (data.changes.length > 1000) {
        data.changes = data.changes.slice(-1000);
    }

    return change;
}

/**
 * Get recent changes.
 */
export function getRecentChanges(data: CollaborationData, limit: number = 20): ChangeRecord[] {
    return data.changes
        .slice()
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
}

/**
 * Get changes by author.
 */
export function getChangesByAuthor(data: CollaborationData, author: string): ChangeRecord[] {
    return data.changes.filter(c => c.author === author);
}

/**
 * Get changes for a field.
 */
export function getChangesForField(data: CollaborationData, fieldPath: string): ChangeRecord[] {
    return data.changes.filter(c => c.fieldPath.startsWith(fieldPath));
}

// ============================================================================
// Review Workflow
// ============================================================================

/**
 * Request a review from another user.
 */
export function requestReview(
    data: CollaborationData,
    reviewer: string,
    message?: string
): ReviewRequest {
    const request: ReviewRequest = {
        id: crypto.randomUUID(),
        requester: data.currentUser,
        reviewer,
        status: 'pending',
        message,
        requestedAt: new Date(),
    };

    data.reviews.push(request);
    return request;
}

/**
 * Respond to a review request.
 */
export function respondToReview(
    data: CollaborationData,
    reviewId: string,
    status: 'approved' | 'changes_requested' | 'dismissed',
    response?: string
): boolean {
    const review = data.reviews.find(r => r.id === reviewId);
    if (!review) return false;

    review.status = status;
    review.response = response;
    review.respondedAt = new Date();
    return true;
}

/**
 * Get pending reviews for current user.
 */
export function getPendingReviews(data: CollaborationData): ReviewRequest[] {
    return data.reviews.filter(
        r => r.reviewer === data.currentUser && r.status === 'pending'
    );
}

// ============================================================================
// UI Components
// ============================================================================

/**
 * Renders a comment thread.
 */
export function renderCommentThread(thread: Comment[]): string {
    if (thread.length === 0) return '';

    const parent = thread[0];
    const replies = thread.slice(1);

    return `
    <div class="comment-thread ${parent.resolved ? 'resolved' : ''}" data-comment-id="${parent.id}">
      <div class="comment parent">
        <div class="comment-header">
          <span class="comment-author">${escapeHtml(parent.author)}</span>
          <span class="comment-date">${formatRelativeTime(parent.createdAt)}</span>
        </div>
        <div class="comment-body">${escapeHtml(parent.text)}</div>
        <div class="comment-actions">
          ${parent.resolved
            ? `<button class="btn-small" onclick="unresolveComment('${parent.id}')">Reopen</button>`
            : `
              <button class="btn-small" onclick="replyToComment('${parent.id}')">Reply</button>
              <button class="btn-small" onclick="resolveComment('${parent.id}')">Resolve</button>
            `
        }
          <button class="btn-small btn-danger" onclick="deleteComment('${parent.id}')">Delete</button>
        </div>
        ${parent.resolved ? `
          <div class="comment-resolved">
            ✓ Resolved by ${escapeHtml(parent.resolvedBy || 'unknown')} ${formatRelativeTime(parent.resolvedAt!)}
          </div>
        ` : ''}
      </div>
      
      ${replies.length > 0 ? `
        <div class="comment-replies">
          ${replies.map(reply => `
            <div class="comment reply">
              <div class="comment-header">
                <span class="comment-author">${escapeHtml(reply.author)}</span>
                <span class="comment-date">${formatRelativeTime(reply.createdAt)}</span>
              </div>
              <div class="comment-body">${escapeHtml(reply.text)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="comment-reply-form hidden" id="reply-form-${parent.id}">
        <textarea placeholder="Write a reply..." id="reply-text-${parent.id}"></textarea>
        <button class="btn-small btn-primary" onclick="submitReply('${parent.id}')">Reply</button>
      </div>
    </div>
  `;
}

/**
 * Renders inline comment indicator for a field.
 */
export function renderCommentIndicator(fieldPath: string, commentCount: number): string {
    if (commentCount === 0) {
        return `<button class="comment-indicator add" onclick="addCommentTo('${fieldPath}')" title="Add comment">💬</button>`;
    }

    return `
    <button class="comment-indicator has-comments" onclick="showCommentsFor('${fieldPath}')" title="${commentCount} comment(s)">
      💬 ${commentCount}
    </button>
  `;
}

/**
 * Renders change history panel.
 */
export function renderChangeHistory(changes: ChangeRecord[]): string {
    if (changes.length === 0) {
        return `<div class="change-history-empty">No changes recorded yet</div>`;
    }

    return `
    <div class="change-history">
      ${changes.map(change => `
        <div class="change-item ${change.changeType}">
          <div class="change-icon">${getChangeIcon(change.changeType)}</div>
          <div class="change-content">
            <div class="change-description">${escapeHtml(change.description)}</div>
            <div class="change-meta">
              <span class="change-author">${escapeHtml(change.author)}</span>
              <span class="change-time">${formatRelativeTime(change.timestamp)}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Renders review request panel.
 */
export function renderReviewPanel(reviews: ReviewRequest[]): string {
    const pending = reviews.filter(r => r.status === 'pending');

    return `
    <div class="review-panel">
      <h4>Reviews</h4>
      
      ${pending.length > 0 ? `
        <div class="pending-reviews">
          ${pending.map(review => `
            <div class="review-request pending">
              <div class="review-header">
                <span class="review-requester">${escapeHtml(review.requester)}</span>
                requested review
                <span class="review-date">${formatRelativeTime(review.requestedAt)}</span>
              </div>
              ${review.message ? `<div class="review-message">"${escapeHtml(review.message)}"</div>` : ''}
              <div class="review-actions">
                <button class="btn-small btn-primary" onclick="approveReview('${review.id}')">Approve</button>
                <button class="btn-small" onclick="requestChanges('${review.id}')">Request Changes</button>
                <button class="btn-small" onclick="dismissReview('${review.id}')">Dismiss</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<div class="no-reviews">No pending reviews</div>'}
      
      <button class="btn-secondary" onclick="openRequestReview()">Request Review</button>
    </div>
  `;
}

/**
 * Get CSS styles for collaboration features.
 */
export function getCollaborationStyles(): string {
    return `
    /* Comment Thread */
    .comment-thread {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .comment-thread.resolved {
      opacity: 0.7;
    }

    .comment {
      padding: 8px 0;
    }

    .comment.reply {
      padding-left: 24px;
      border-left: 2px solid var(--vscode-input-border);
      margin-left: 12px;
    }

    .comment-header {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 12px;
    }

    .comment-author {
      font-weight: 600;
    }

    .comment-date {
      color: var(--vscode-descriptionForeground);
    }

    .comment-body {
      font-size: 13px;
      line-height: 1.4;
    }

    .comment-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .comment-resolved {
      font-size: 11px;
      color: var(--vscode-testing-iconPassed);
      margin-top: 8px;
    }

    .comment-replies {
      margin-top: 12px;
    }

    .comment-reply-form {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-input-border);
    }

    .comment-reply-form textarea {
      width: 100%;
      min-height: 60px;
      margin-bottom: 8px;
      padding: 8px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      color: var(--vscode-editor-foreground);
      border-radius: 4px;
      resize: vertical;
    }

    /* Comment Indicator */
    .comment-indicator {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .comment-indicator:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }

    .comment-indicator.has-comments {
      color: var(--vscode-activityBarBadge-background);
      font-weight: 600;
    }

    /* Change History */
    .change-history {
      max-height: 300px;
      overflow-y: auto;
    }

    .change-history-empty {
      color: var(--vscode-descriptionForeground);
      padding: 20px;
      text-align: center;
    }

    .change-item {
      display: flex;
      gap: 10px;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-input-border);
    }

    .change-icon {
      font-size: 14px;
    }

    .change-content {
      flex: 1;
    }

    .change-description {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .change-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 8px;
    }

    /* Review Panel */
    .review-panel {
      padding: 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
    }

    .review-panel h4 {
      margin: 0 0 12px;
    }

    .review-request {
      padding: 12px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .review-request.pending {
      border-left: 3px solid var(--vscode-activityBarBadge-background);
    }

    .review-header {
      font-size: 13px;
      margin-bottom: 6px;
    }

    .review-requester {
      font-weight: 600;
    }

    .review-message {
      font-size: 12px;
      font-style: italic;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .review-actions {
      display: flex;
      gap: 6px;
    }

    .no-reviews {
      color: var(--vscode-descriptionForeground);
      padding: 12px;
      text-align: center;
    }
  `;
}

/**
 * Get JavaScript for collaboration features.
 */
export function getCollaborationScript(): string {
    return `
    function addCommentTo(fieldPath) {
      const text = prompt('Enter your comment:');
      if (text) {
        vscode.postMessage({ command: 'addComment', fieldPath, text });
      }
    }

    function showCommentsFor(fieldPath) {
      vscode.postMessage({ command: 'showComments', fieldPath });
    }

    function replyToComment(commentId) {
      const form = document.getElementById('reply-form-' + commentId);
      form.classList.toggle('hidden');
    }

    function submitReply(commentId) {
      const textarea = document.getElementById('reply-text-' + commentId);
      const text = textarea.value.trim();
      if (text) {
        vscode.postMessage({ command: 'replyToComment', commentId, text });
        textarea.value = '';
        document.getElementById('reply-form-' + commentId).classList.add('hidden');
      }
    }

    function resolveComment(commentId) {
      vscode.postMessage({ command: 'resolveComment', commentId });
    }

    function unresolveComment(commentId) {
      vscode.postMessage({ command: 'unresolveComment', commentId });
    }

    function deleteComment(commentId) {
      if (confirm('Delete this comment?')) {
        vscode.postMessage({ command: 'deleteComment', commentId });
      }
    }

    function approveReview(reviewId) {
      vscode.postMessage({ command: 'respondToReview', reviewId, status: 'approved' });
    }

    function requestChanges(reviewId) {
      const message = prompt('What changes are needed?');
      vscode.postMessage({ command: 'respondToReview', reviewId, status: 'changes_requested', message });
    }

    function dismissReview(reviewId) {
      vscode.postMessage({ command: 'respondToReview', reviewId, status: 'dismissed' });
    }

    function openRequestReview() {
      const reviewer = prompt('Enter reviewer email/name:');
      if (reviewer) {
        const message = prompt('Add a message (optional):');
        vscode.postMessage({ command: 'requestReview', reviewer, message: message || undefined });
      }
    }
  `;
}

// ============================================================================
// Helper Functions
// ============================================================================

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function getChangeIcon(changeType: ChangeRecord['changeType']): string {
    switch (changeType) {
        case 'create': return '➕';
        case 'update': return '✏️';
        case 'delete': return '🗑️';
        default: return '•';
    }
}

/**
 * Create initial collaboration data.
 */
export function createCollaborationData(currentUser: string): CollaborationData {
    return {
        comments: [],
        changes: [],
        reviews: [],
        currentUser,
    };
}
