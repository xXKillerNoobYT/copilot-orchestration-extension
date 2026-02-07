/**
 * Planning Wizard Webview - HTML Template & Message Handlers
 *
 * This file generates the complete HTML for the webview and handles
 * all message passing between the extension (extension.ts) and the webview UI.
 *
 * **Simple explanation**: This is the "view" layer that communicates with
 * the "controller" (extension.ts). Controls come here with messages,
 * and this sends back updates.
 */

import * as vscode from 'vscode';
import { CompletePlan, WizardState } from '../planning/types';
import * as Pages from './wizardPages';

export function generateWizardHTML(
    wizardState: WizardState,
    nonce: string
): string {
    const pageMap = ['overview', 'features', 'linking', 'userStories', 'devStories', 'criteria', 'review'];
    const pageIndex = pageMap.indexOf(wizardState.currentPage as string);
    const pageNum = pageIndex + 1;
    const totalPages = 7;

    // Select which page to render
    let pageContent = '';
    switch (pageIndex) {
        case 0:
            pageContent = Pages.renderPage1Overview(wizardState.plan);
            break;
        case 1:
            pageContent = Pages.renderPage2Features(wizardState.plan);
            break;
        case 2:
            pageContent = Pages.renderPage3Linking(wizardState.plan);
            break;
        case 3:
            pageContent = Pages.renderPage4UserStories(wizardState.plan);
            break;
        case 4:
            pageContent = Pages.renderPage5DevStories(wizardState.plan);
            break;
        case 5:
            pageContent = Pages.renderPage6SuccessCriteria(wizardState.plan);
            break;
        case 6:
            pageContent = renderPage7Review(wizardState);
            break;
        default:
            pageContent = '<p>Unknown page</p>';
    }

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Planning Wizard</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        padding: 20px;
        overflow-x: hidden;
      }

      .wizard-container {
        max-width: 800px;
        margin: 0 auto;
      }

      .wizard-header {
        margin-bottom: 30px;
      }

      .progress-bar {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
      }

      .progress-step {
        flex: 1;
        height: 4px;
        background: var(--vscode-activityBar-inactiveForeground);
        border-radius: 2px;
        transition: background 0.2s;
      }

      .progress-step.active,
      .progress-step.completed {
        background: var(--vscode-activityBarBadge-background);
      }

      .page-indicator {
        display: flex;
        justify-content: space-between;
        margin-top: 10px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }

      .page-indicator strong {
        color: var(--vscode-editor-foreground);
      }

      /* Page Content */
      .page-content {
        animation: fadeIn 0.3s ease-in;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .page-content h2 {
        font-size: 24px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .page-content h3 {
        font-size: 16px;
        margin: 20px 0 12px;
        font-weight: 600;
      }

      .page-subtitle {
        color: var(--vscode-descriptionForeground);
        margin-bottom: 20px;
        font-size: 13px;
      }

      /* Form Styles */
      .form-section {
        margin-bottom: 24px;
        padding: 16px;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group:last-child {
        margin-bottom: 0;
      }

      .form-group label {
        display: flex;
        justify-content: space-between;
        margin-bottom: 6px;
        font-weight: 500;
        font-size: 13px;
      }

      .form-control {
        width: 100%;
        padding: 8px 12px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-input-border);
        color: var(--vscode-editor-foreground);
        border-radius: 4px;
        font-size: 13px;
        font-family: inherit;
      }

      .form-control:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
        box-shadow: 0 0 0 1px var(--vscode-focusBorder);
      }

      textarea.form-control {
        min-height: 80px;
        resize: vertical;
      }

      .form-hint {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
      }

      .form-error {
        color: var(--vscode-errorForeground);
        font-size: 12px;
        margin-top: 4px;
      }

      .counter {
        font-weight: normal;
        color: var(--vscode-descriptionForeground);
      }

      /* Card Styles */
      .feature-card,
      .story-card,
      .criteria-card {
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
      }

      .feature-card .feature-header {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      .feature-card .feature-title {
        flex: 1;
      }

      .feature-card .feature-name {
        width: 100%;
        padding: 6px 8px;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        color: var(--vscode-editor-foreground);
        border-radius: 4px;
        font-weight: 600;
      }

      .feature-card .feature-description {
        width: 100%;
        min-height: 60px;
        padding: 8px;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        color: var(--vscode-editor-foreground);
        border-radius: 4px;
        margin-bottom: 8px;
        resize: vertical;
      }

      .feature-card .feature-details {
        margin-bottom: 8px;
      }

      .feature-card label {
        font-size: 12px;
        font-weight: 500;
        color: var(--vscode-descriptionForeground);
      }

      /* Goals List */
      .goals-list {
        margin-bottom: 12px;
      }

      .goal-item {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
      }

      .goal-number {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: var(--vscode-activityBarBadge-background);
        color: white;
        border-radius: 50%;
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .goal-input {
        flex: 1;
        padding: 6px 8px;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-input-border);
        color: var(--vscode-editor-foreground);
        border-radius: 4px;
        font-size: 13px;
      }

      /* Priority Select */
      .priority-select {
        padding: 6px 8px;
        background: var(--vscode-dropdown-background);
        border: 1px solid var(--vscode-dropdown-border);
        color: var(--vscode-dropdown-foreground);
        border-radius: 4px;
        font-size: 12px;
      }

      /* Button Styles */
      .form-actions {
        display: flex;
        gap: 8px;
        justify-content: space-between;
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid var(--vscode-input-border);
      }

      .btn-group {
        display: flex;
        gap: 8px;
      }

      button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-primary {
        background: var(--vscode-activityBarBadge-background);
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        opacity: 0.85;
        transform: translateY(-1px);
      }

      .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }

      .btn-secondary:hover:not(:disabled) {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .btn-icon {
        padding: 4px 8px;
        background: transparent;
        color: var(--vscode-descriptionForeground);
        font-size: 16px;
      }

      .btn-icon:hover {
        color: var(--vscode-editor-foreground);
      }

      .btn-danger {
        background: var(--vscode-statusBar-debuggingBackground);
        color: white;
      }

      .btn-danger:hover:not(:disabled) {
        opacity: 0.85;
      }

      .btn-small {
        padding: 4px 12px;
        font-size: 12px;
      }

      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Checkbox Lists */
      .checkbox-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .checkbox-label input {
        cursor: pointer;
      }

      /* SMART Guide */
      .smart-guide {
        display: grid;
        gap: 8px;
        margin-bottom: 20px;
      }

      .smart-item {
        padding: 8px 12px;
        background: var(--vscode-input-background);
        border-left: 3px solid var(--vscode-activityBarBadge-background);
        border-radius: 4px;
        font-size: 12px;
      }

      .smart-checklist {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 12px 0;
      }

      /* Empty State */
      .empty-state {
        text-align: center;
        padding: 30px 20px;
        color: var(--vscode-descriptionForeground);
        font-size: 14px;
      }

      /* Review Page */
      .review-section {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 16px;
      }

      .review-item {
        margin-bottom: 12px;
      }

      .review-label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 4px;
      }

      .review-value {
        font-size: 13px;
        color: var(--vscode-editor-foreground);
        padding: 8px;
        background: var(--vscode-editor-background);
        border-radius: 4px;
      }

      .review-list {
        list-style: none;
        padding-left: 0;
      }

      .review-list li {
        padding: 4px 0;
        font-size: 13px;
      }

      .export-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        margin: 16px 0;
      }

      .export-btn {
        padding: 8px;
        text-align: center;
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .export-btn:hover {
        border-color: var(--vscode-activityBarBadge-background);
        background: var(--vscode-editor-background);
      }
    </style>
  </head>
  <body>
    <div class="wizard-container">
      <!-- Header with Progress -->
      <div class="wizard-header">
        <div class="progress-bar">
          ${Array.from({ length: totalPages }, (_, i) => {
        const isCompleted = i < pageIndex;
        const isActive = i === pageIndex;
        return `<div class="progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}"></div>`;
    }).join('')}
        </div>
        <div class="page-indicator">
          <span>Step <strong>${pageNum}</strong> of <strong>${totalPages}</strong></span>
          <span id="validationStatus"></span>
        </div>
      </div>

      <!-- Page Content -->
      <div id="pageContent">${pageContent}</div>

      <!-- Navigation Buttons -->
      <div class="form-actions">
        <button
          type="button"
          class="btn-secondary"
          onclick="previousPage()"
          ${pageNum === 1 ? 'disabled' : ''}
        >
          ← Previous
        </button>
        <div class="btn-group">
          <button
            type="button"
            class="btn-secondary"
            id="saveBtn"
            onclick="saveDraft()"
          >
            💾 Save Draft
          </button>
          <button
            type="button"
            class="btn-primary"
            onclick="nextPage()"
            ${pageNum === totalPages ? 'style="display:none"' : ''}
          >
            Next →
          </button>
          <button
            type="button"
            class="btn-primary"
            id="finishBtn"
            onclick="finishPlan()"
            ${pageNum === totalPages ? '' : 'style="display:none"'}
          >
            ✓ Finish
          </button>
        </div>
      </div>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      let wizardState = ${JSON.stringify(wizardState)};

      // ========================================================================
      // Page Navigation
      // ========================================================================

      async function nextPage() {
        const isValid = await validateCurrentPage();
        if (!isValid) {
          showError('Please fix validation errors before continuing');
          return;
        }

        // Save current page first
        await saveDraft();

        vscode.postMessage({
          command: 'pageChanged',
          pageIndex: Math.min(wizardState.currentPageIndex + 1, 6),
        });
      }

      function previousPage() {
        vscode.postMessage({
          command: 'pageChanged',
          pageIndex: Math.max(wizardState.currentPageIndex - 1, 0),
        });
      }

      // ========================================================================
      // Data Updates
      // ========================================================================

      function onFieldChange(fieldPath, value) {
        const parts = fieldPath.split('.');
        let target = wizardState.plan;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
      }

      function updateCounter(elementId, length) {
        const el = document.getElementById(elementId);
        if (el) {
          el.textContent = length;
        }
      }

      function addGoal() {
        if (!wizardState.plan.overview) {
          wizardState.plan.overview = {};
        }
        if (!wizardState.plan.overview.goals) {
          wizardState.plan.overview.goals = [];
        }
        wizardState.plan.overview.goals.push('');
        refreshPage();
      }

      function removeGoal(index) {
        wizardState.plan.overview.goals.splice(index, 1);
        refreshPage();
      }

      function updateGoal(index, value) {
        wizardState.plan.overview.goals[index] = value;
      }

      // ========================================================================
      // Validation & Save
      // ========================================================================

      async function validateCurrentPage() {
        // Validation logic will be in separate handlers per page
        return true; // Placeholder
      }

      async function saveDraft() {
        vscode.postMessage({
          command: 'saveDraft',
          planData: wizardState.plan,
        });
      }

      async function finishPlan() {
        const isValid = await validateCurrentPage();
        if (!isValid) {
          showError('Please fix validation errors');
          return;
        }

        vscode.postMessage({
          command: 'finishPlan',
          planData: wizardState.plan,
        });
      }

      // ========================================================================
      // UI Helpers
      // ========================================================================

      function refreshPage() {
        vscode.postMessage({
          command: 'refreshPage',
          pageIndex: wizardState.currentPageIndex,
        });
      }

      function showError(message) {
        const errorEl = document.getElementById('validationStatus');
        if (errorEl) {
          errorEl.textContent = '❌ ' + message;
          errorEl.style.color = 'var(--vscode-errorForeground)';
          setTimeout(() => {
            errorEl.textContent = '';
          }, 5000);
        }
      }

      function showSuccess(message) {
        const errorEl = document.getElementById('validationStatus');
        if (errorEl) {
          errorEl.textContent = '✓ ' + message;
          errorEl.style.color = 'var(--vscode-testing-iconPassed)';
          setTimeout(() => {
            errorEl.textContent = '';
          }, 3000);
        }
      }

      // ========================================================================
      // Message Handlers
      // ========================================================================

      window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.command) {
          case 'draftSaved':
            showSuccess('Draft saved');
            break;
          case 'planCompleted':
            showSuccess('Plan created successfully!');
            break;
          case 'error':
            showError(message.message);
            break;
        }
      });
    </script>
  </body>
</html>`;
}

// Page 7: Review & Export
function renderPage7Review(state: WizardState): string {
    const plan = state.plan;
    return `
    <div class="page-content">
      <h2>📋 Review & Export</h2>
      <p class="page-subtitle">Review your plan and export in your preferred format</p>

      <section class="review-section">
        <h3>Project Overview</h3>
        <div class="review-item">
          <div class="review-label">Name</div>
          <div class="review-value">${plan.overview?.name || 'Not specified'}</div>
        </div>
        <div class="review-item">
          <div class="review-label">Description</div>
          <div class="review-value">${plan.overview?.description || 'Not specified'}</div>
        </div>
        ${(plan.overview?.goals?.length || 0) > 0
            ? `
          <div class="review-item">
            <div class="review-label">Goals</div>
            <ul class="review-list">
              ${plan.overview!.goals!.map((g) => `<li>• ${g}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }
      </section>

      <section class="review-section">
        <h3>Summary</h3>
        <div class="review-item">
          <span>✓ ${plan.featureBlocks?.length || 0} feature blocks</span>
        </div>
        <div class="review-item">
          <span>✓ ${plan.userStories?.length || 0} user stories</span>
        </div>
        <div class="review-item">
          <span>✓ ${plan.developerStories?.length || 0} developer stories</span>
        </div>
        <div class="review-item">
          <span>✓ ${plan.successCriteria?.length || 0} success criteria</span>
        </div>
      </section>

      <section class="form-section">
        <h3>Export Format</h3>
        <p class="form-hint">Choose how you want to export your plan</p>
        <div class="export-options">
          <button class="export-btn" onclick="exportPlan('json')">📄 JSON</button>
          <button class="export-btn" onclick="exportPlan('markdown')">📝 Markdown</button>
          <button class="export-btn" onclick="exportPlan('yaml')">⚙️ YAML</button>
          <button class="export-btn" onclick="exportPlan('pdf')">📑 PDF</button>
        </div>
      </section>
    </div>
  `;
}
