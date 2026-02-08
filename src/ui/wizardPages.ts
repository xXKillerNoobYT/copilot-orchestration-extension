/**
 * Planning Wizard - Page Components
 *
 * **Simple explanation**: These are the individual pages of the wizard.
 * Each page handles one aspect of planning with its own form, validation, and save logic.
 *
 * @module ui/wizardPages
 */

import { CompletePlan, FeatureBlock, UserStory, DeveloperStory, SuccessCriterion } from '../planning/types';
import { PLAN_CONSTRAINTS } from '../planning/schema';

// ============================================================================
// PAGE 1: PROJECT OVERVIEW
// ============================================================================

export function renderPage1Overview(plan: Partial<CompletePlan>): string {
  const name = plan.overview?.name || '';
  const description = plan.overview?.description || '';
  const goals = plan.overview?.goals || [];

  return `
    <div class="page-content">
      <h2>📋 Project Overview</h2>
      <p class="page-subtitle">Define your project at a high level</p>

      <section class="form-section">
        <h3>Basic Information</h3>
        
        <div class="form-group">
          <label for="projectName">
            Project Name *
            <span class="counter">
              <span id="nameLen">${name.length}</span>/${PLAN_CONSTRAINTS.PROJECT_NAME_MAX}
            </span>
          </label>
          <input
            type="text"
            id="projectName"
            class="form-control"
            value="${escapeHtml(name)}"
            placeholder="e.g., Customer Portal, Mobile App, API Gateway"
            maxlength="${PLAN_CONSTRAINTS.PROJECT_NAME_MAX}"
            onchange="onFieldChange('overview.name', this.value)"
            oninput="updateCounter('nameLen', this.value.length)"
          />
          <div id="nameError" class="form-error"></div>
        </div>

        <div class="form-group">
          <label for="description">
            Description
            <span class="counter">
              <span id="descLen">${description.length}</span>/${PLAN_CONSTRAINTS.DESCRIPTION_MAX}
            </span>
          </label>
          <textarea
            id="description"
            class="form-control"
            placeholder="What is this project about? What problem does it solve?"
            maxlength="${PLAN_CONSTRAINTS.DESCRIPTION_MAX}"
            onchange="onFieldChange('overview.description', this.value)"
            oninput="updateCounter('descLen', this.value.length)"
          >${escapeHtml(description)}</textarea>
          <div class="form-hint">Describe the project in 1-2 sentences</div>
        </div>
      </section>

      <section class="form-section">
        <h3>Goals (max ${PLAN_CONSTRAINTS.MAX_GOALS})</h3>
        <div class="goals-list" id="goalsList">
          ${renderGoalsList(goals)}
        </div>
        <button type="button" class="btn-secondary btn-small" onclick="addGoal()">
          + Add Goal
        </button>
      </section>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage1()">Validate</button>
      </div>
    </div>
  `;
}

function renderGoalsList(goals: string[]): string {
  return goals
    .map(
      (goal, i) => `
        <div class="goal-item">
          <div class="goal-number">${i + 1}</div>
          <input
            type="text"
            class="goal-input"
            value="${escapeHtml(goal)}"
            placeholder="e.g., Improve user retention by 25%"
            maxlength="${PLAN_CONSTRAINTS.GOAL_MAX}"
            onchange="updateGoal(${i}, this.value)"
          />
          <button type="button" class="btn-icon" onclick="removeGoal(${i})">✕</button>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// PAGE 2: FEATURE BLOCKS
// ============================================================================

export function renderPage2Features(plan: Partial<CompletePlan>): string {
  const features = plan.featureBlocks || [];

  return `
    <div class="page-content">
      <h2>🎯 Feature Blocks</h2>
      <p class="page-subtitle">Break your project into major features</p>

      <div class="features-list" id="featuresList">
        ${features.length > 0 ? renderFeaturesList(features) : '<p class="empty-state">No features added yet</p>'}
      </div>

      <button type="button" class="btn-primary" onclick="addFeature()">
        + Add Feature Block
      </button>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage2()">Validate</button>
      </div>
    </div>
  `;
}

function renderFeaturesList(features: FeatureBlock[]): string {
  return features
    .map(
      (feature) => `
        <div class="feature-card" data-id="${feature.id}">
          <div class="feature-header">
            <div class="feature-title">
              <input
                type="text"
                class="feature-name"
                value="${escapeHtml(feature.name)}"
                placeholder="Feature name"
                maxlength="${PLAN_CONSTRAINTS.FEATURE_NAME_MAX}"
                onchange="updateFeature('${feature.id}', 'name', this.value)"
              />
            </div>
            <select
              class="priority-select"
              value="${feature.priority}"
              onchange="updateFeature('${feature.id}', 'priority', this.value)"
            >
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <button type="button" class="btn-icon btn-danger" onclick="removeFeature('${feature.id}')">✕</button>
          </div>

          <textarea
            class="feature-description"
            placeholder="What does this feature do?"
            maxlength="500"
            onchange="updateFeature('${feature.id}', 'description', this.value)"
          >${escapeHtml(feature.description)}</textarea>

          <div class="feature-details">
            <label>Purpose:</label>
            <input
              type="text"
              class="feature-purpose"
              placeholder="Why is this feature important?"
              value="${escapeHtml(feature.purpose)}"
              onchange="updateFeature('${feature.id}', 'purpose', this.value)"
            />
          </div>

          <div class="feature-details">
            <label>Acceptance Criteria:</label>
            <div class="criteria-list">
              ${renderCriteria(feature.acceptanceCriteria, feature.id)}
            </div>
            <button type="button" class="btn-small btn-secondary" onclick="addCriteria('${feature.id}')">
              + Add Criterion
            </button>
          </div>
        </div>
      `
    )
    .join('');
}

function renderCriteria(criteria: string[], featureId: string): string {
  return criteria
    .map(
      (c, i) => `
        <div class="criteria-item">
          <input
            type="text"
            value="${escapeHtml(c)}"
            placeholder="e.g., User can login with email"
            onchange="updateCriteria('${featureId}', ${i}, this.value)"
          />
          <button type="button" class="btn-icon" onclick="removeCriteria('${featureId}', ${i})">✕</button>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// PAGE 3: BLOCK LINKING & DEPENDENCIES
// ============================================================================

export function renderPage3Linking(plan: Partial<CompletePlan>): string {
  const features = plan.featureBlocks || [];

  return `
    <div class="page-content">
      <h2>🔗 Block Dependencies</h2>
      <p class="page-subtitle">Define how features depend on each other</p>

      <section class="form-section">
        <h3>Feature Dependencies</h3>
        <p class="form-hint">
          Connect features to show which ones block, require, or trigger others
        </p>

        <div class="dependencies-list">
          ${features.length > 1
      ? renderDependencyPairs(features, plan.blockLinks || [])
      : '<p class="empty-state">Add at least 2 features to create dependencies</p>'
    }
        </div>
      </section>

      <section class="form-section">
        <h3>Conditional Logic</h3>
        <p class="form-hint">
          Define what happens when features complete (e.g., "When Feature A completes, Feature B starts")
        </p>

        <div class="conditionals-list">
          ${renderConditionals(features, plan.conditionalLogic || [])}
        </div>
        <button type="button" class="btn-secondary btn-small" onclick="addConditional()">
          + Add Conditional
        </button>
      </section>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage3()">Validate</button>
      </div>
    </div>
  `;
}

function renderDependencyPairs(
  features: FeatureBlock[],
  links: any[]
): string {
  return features
    .flatMap((f1, i) =>
      features.slice(i + 1).map((f2) => ({
        id: f1.id,
        name: f1.name,
        targetId: f2.id,
        targetName: f2.name,
      }))
    )
    .map(
      (pair) => `
        <div class="dependency-pair">
          <span class="dep-label">${escapeHtml(pair.name)}</span>
          <select onchange="updateDependency('${pair.id}', '${pair.targetId}', this.value)">
            <option value="">-- No dependency --</option>
            <option value="requires">${escapeHtml(pair.name)} requires ${escapeHtml(pair.targetName)}</option>
            <option value="suggests">${escapeHtml(pair.name)} suggests ${escapeHtml(pair.targetName)}</option>
            <option value="blocks">${escapeHtml(pair.name)} blocks ${escapeHtml(pair.targetName)}</option>
            <option value="triggers">${escapeHtml(pair.name)} triggers ${escapeHtml(pair.targetName)}</option>
          </select>
        </div>
      `
    )
    .join('');
}

function renderConditionals(features: FeatureBlock[], conditionals: any[]): string {
  return features
    .map(
      (feature, i) => `
        <div class="conditional-item" data-feature="${feature.id}">
          <div class="conditional-form">
            <span>When</span>
            <strong>${escapeHtml(feature.name)}</strong>
            <select onchange="updateConditionalTrigger('${feature.id}', this.value)">
              <option value="complete">completes</option>
              <option value="started">starts</option>
              <option value="blocked">is blocked</option>
              <option value="failed">fails</option>
            </select>
            <span>, then</span>
            <select onchange="updateConditionalAction('${feature.id}', this.value)">
              <option value="starts">another feature starts</option>
              <option value="pauses">another feature pauses</option>
              <option value="requires_review">another feature requires review</option>
            </select>
          </div>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// PAGE 4: USER STORIES
// ============================================================================

export function renderPage4UserStories(plan: Partial<CompletePlan>): string {
  const stories = plan.userStories || [];
  const features = plan.featureBlocks || [];

  return `
    <div class="page-content">
      <h2>👥 User Stories</h2>
      <p class="page-subtitle">Describe requirements from the user's perspective</p>

      <section class="form-section">
        <h3>User Story Template</h3>
        <p class="form-hint">
          As a <strong>[user type]</strong>, I want to <strong>[action]</strong>, so that <strong>[benefit]</strong>
        </p>

        <div class="stories-list">
          ${stories.length > 0 ? renderUserStoriesList(stories, features) : '<p class="empty-state">No user stories yet</p>'}
        </div>

        <button type="button" class="btn-primary" onclick="addUserStory()">
          + Add User Story
        </button>
      </section>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage4()">Validate</button>
      </div>
    </div>
  `;
}

function renderUserStoriesList(stories: UserStory[], features: FeatureBlock[]): string {
  return stories
    .map(
      (story) => `
        <div class="story-card" data-id="${story.id}">
          <div class="story-form">
            <div class="form-group">
              <label>User Type:</label>
              <input
                type="text"
                placeholder="e.g., customer, admin, developer"
                value="${escapeHtml(story.userType)}"
                onchange="updateUserStory('${story.id}', 'userType', this.value)"
              />
            </div>

            <div class="form-group">
              <label>Action (what they want to do):</label>
              <input
                type="text"
                placeholder="e.g., login with email"
                value="${escapeHtml(story.action)}"
                onchange="updateUserStory('${story.id}', 'action', this.value)"
              />
            </div>

            <div class="form-group">
              <label>Benefit (why they want this):</label>
              <input
                type="text"
                placeholder="e.g., save time by not entering password"
                value="${escapeHtml(story.benefit)}"
                onchange="updateUserStory('${story.id}', 'benefit', this.value)"
              />
            </div>

            <div class="form-group">
              <label>Related Features:</label>
              <div class="checkbox-list">
                ${renderFeatureCheckboxes(story.relatedBlockIds, features, story.id)}
              </div>
            </div>

            <div class="form-group">
              <label>Acceptance Criteria:</label>
              <div class="criteria-list" id="story-criteria-${story.id}">
                ${(story.acceptanceCriteria || []).map((c, i) => `
                  <div class="criterion-item">
                    <input type="text" value="${escapeHtml(c)}" 
                      onchange="updateStoryAcceptanceCriteria('${story.id}', ${i}, this.value)"/>
                    <button onclick="removeStoryCriterion('${story.id}', ${i})">×</button>
                  </div>
                `).join('')}
              </div>
              <button onclick="addStoryCriterion('${story.id}')">+ Add Criterion</button>
            </div>

            <div class="form-group">
              <label>Priority:</label>
              <select onchange="updateUserStory('${story.id}', 'priority', this.value)">
                <option value="low" ${story.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${story.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${story.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="critical" ${story.priority === 'critical' ? 'selected' : ''}>Critical</option>
              </select>
            </div>

            <button type="button" class="btn-danger btn-small" onclick="removeUserStory('${story.id}')">
              Remove Story
            </button>
          </div>
        </div>
      `
    )
    .join('');
}

function renderFeatureCheckboxes(
  selectedIds: string[],
  features: FeatureBlock[],
  storyId: string
): string {
  return features
    .map(
      (f) => `
        <label class="checkbox-label">
          <input
            type="checkbox"
            ${selectedIds.includes(f.id) ? 'checked' : ''}
            onchange="updateStoryFeatureLink('${storyId}', '${f.id}', this.checked)"
          />
          ${escapeHtml(f.name)}
        </label>
      `
    )
    .join('');
}

// ============================================================================
// PAGE 5: DEVELOPER STORIES
// ============================================================================

export function renderPage5DevStories(plan: Partial<CompletePlan>): string {
  const devStories = plan.developerStories || [];
  const features = plan.featureBlocks || [];

  return `
    <div class="page-content">
      <h2>👨‍💻 Developer Stories</h2>
      <p class="page-subtitle">Technical requirements from developer perspective</p>

      <div class="stories-list">
        ${devStories.length > 0 ? renderDevStoriesList(devStories, features) : '<p class="empty-state">No developer stories yet</p>'}
      </div>

      <button type="button" class="btn-primary" onclick="addDevStory()">
        + Add Developer Story
      </button>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage5()">Validate</button>
      </div>
    </div>
  `;
}

function renderDevStoriesList(stories: DeveloperStory[], features: FeatureBlock[]): string {
  return stories
    .map(
      (story) => `
        <div class="story-card dev-story" data-id="${story.id}">
          <div class="story-form">
            <div class="form-group">
              <label>Technical Action:</label>
              <input
                type="text"
                placeholder="e.g., implement OAuth2 authentication"
                value="${escapeHtml(story.action)}"
                onchange="updateDevStory('${story.id}', 'action', this.value)"
              />
            </div>

            <div class="form-group">
              <label>Benefit:</label>
              <input
                type="text"
                placeholder="e.g., secure user authentication"
                value="${escapeHtml(story.benefit)}"
                onchange="updateDevStory('${story.id}', 'benefit', this.value)"
              />
            </div>

            <div class="form-group">
              <label>Estimated Hours:</label>
              <input
                type="number"
                min="0"
                max="160"
                placeholder="8"
                value="${story.estimatedHours}"
                onchange="updateDevStory('${story.id}', 'estimatedHours', parseInt(this.value))"
              />
            </div>

            <div class="form-group">
              <label>Technical Requirements:</label>
              <textarea
                placeholder="Node + Express + PostgreSQL..."
                onchange="updateDevStory('${story.id}', 'technicalRequirements', this.value)"
              >${escapeHtml(story.technicalRequirements?.join(', ') || '')}</textarea>
            </div>

            <div class="form-group">
              <label>API Endpoints Required:</label>
              <textarea
                placeholder="POST /api/auth/login, GET /api/users/:id..."
                onchange="updateDevStory('${story.id}', 'apiNotes', this.value)"
              >${escapeHtml(story.apiNotes)}</textarea>
            </div>

            <div class="form-group">
              <label>Database Schema Notes:</label>
              <textarea
                placeholder="Tables: users, tokens, sessions..."
                onchange="updateDevStory('${story.id}', 'databaseNotes', this.value)"
              >${escapeHtml(story.databaseNotes)}</textarea>
            </div>

            <div class="form-group">
              <label>Related Features:</label>
              <div class="checkbox-list">
                ${features.map(f => `
                  <label class="checkbox-label">
                    <input type="checkbox" 
                      ${(story.relatedBlockIds || []).includes(f.id) ? 'checked' : ''}
                      onchange="updateDevStoryBlockLink('${story.id}', '${f.id}', this.checked)"/>
                    ${escapeHtml(f.name)}
                  </label>
                `).join('')}
              </div>
            </div>

            <button type="button" class="btn-danger btn-small" onclick="removeDevStory('${story.id}')">
              Remove Story
            </button>
          </div>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// PAGE 6: SUCCESS CRITERIA (SMART)
// ============================================================================

export function renderPage6SuccessCriteria(plan: Partial<CompletePlan>): string {
  const criteria = plan.successCriteria || [];
  const features = plan.featureBlocks || [];
  const stories = plan.userStories || [];

  return `
    <div class="page-content">
      <h2>✅ Success Criteria</h2>
      <p class="page-subtitle">Define measurable success using SMART framework</p>

      <section class="form-section">
        <h3>SMART Criteria Guide</h3>
        <div class="smart-guide">
          <div class="smart-item">
            <strong>S - Specific:</strong> Clear and well-defined goal
          </div>
          <div class="smart-item">
            <strong>M - Measurable:</strong> Quantifiable with metrics
          </div>
          <div class="smart-item">
            <strong>A - Achievable:</strong> Realistic within constraints
          </div>
          <div class="smart-item">
            <strong>R - Relevant:</strong> Aligned with project goals
          </div>
          <div class="smart-item">
            <strong>T - Time-bound:</strong> Has a deadline
          </div>
        </div>
      </section>

      <div class="criteria-list">
        ${criteria.length > 0 ? renderSuccessCriteriaList(criteria, features, stories) : '<p class="empty-state">No criteria added yet</p>'}
      </div>

      <button type="button" class="btn-primary" onclick="addSuccessCriteria()">
        + Add Success Criterion
      </button>

      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="validatePage6()">Validate</button>
      </div>
    </div>
  `;
}

function renderSuccessCriteriaList(criteria: SuccessCriterion[], features: FeatureBlock[], stories: UserStory[]): string {
  return criteria
    .map(
      (c) => `
        <div class="criteria-card" data-id="${c.id}">
          <div class="criteria-form">
            <textarea
              placeholder="e.g., 95% of users can complete signup in under 2 minutes by end of Q2"
              onchange="updateSuccessCriteria('${c.id}', 'description', this.value)"
            >${escapeHtml(c.description)}</textarea>

            <div class="smart-checklist">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  ${c.smartAttributes.specific ? 'checked' : ''}
                  onchange="updateSmartAttribute('${c.id}', 'specific', this.checked)"
                />
                Specific
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  ${c.smartAttributes.measurable ? 'checked' : ''}
                  onchange="updateSmartAttribute('${c.id}', 'measurable', this.checked)"
                />
                Measurable
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  ${c.smartAttributes.achievable ? 'checked' : ''}
                  onchange="updateSmartAttribute('${c.id}', 'achievable', this.checked)"
                />
                Achievable
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  ${c.smartAttributes.relevant ? 'checked' : ''}
                  onchange="updateSmartAttribute('${c.id}', 'relevant', this.checked)"
                />
                Relevant
              </label>
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  ${c.smartAttributes.timeBound ? 'checked' : ''}
                  onchange="updateSmartAttribute('${c.id}', 'timeBound', this.checked)"
                />
                Time-bound
              </label>
            </div>

            <div class="form-group">
              <label>Related Features:</label>
              <div class="checkbox-list">
                ${features.map(f => `
                  <label class="checkbox-label">
                    <input type="checkbox"
                      ${(c.relatedFeatureIds || []).includes(f.id) ? 'checked' : ''}
                      onchange="updateCriterionFeatureLink('${c.id}', '${f.id}', this.checked)"/>
                    ${escapeHtml(f.name)}
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label>Related User Stories:</label>
              <div class="checkbox-list">
                ${stories.map(s => `
                  <label class="checkbox-label">
                    <input type="checkbox"
                      ${(c.relatedStoryIds || []).includes(s.id) ? 'checked' : ''}
                      onchange="updateCriterionStoryLink('${c.id}', '${s.id}', this.checked)"/>
                    As a ${escapeHtml(s.userType)}, I want to ${escapeHtml(s.action)}
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox"
                  ${c.testable ? 'checked' : ''}
                  onchange="updateSuccessCriteria('${c.id}', 'testable', this.checked)"/>
                Testable (can be verified)
              </label>
            </div>

            <div class="form-group">
              <label>Priority:</label>
              <select onchange="updateSuccessCriteria('${c.id}', 'priority', this.value)">
                <option value="low" ${c.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${c.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${c.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="critical" ${c.priority === 'critical' ? 'selected' : ''}>Critical</option>
              </select>
            </div>

            <button type="button" class="btn-danger btn-small" onclick="removeSuccessCriteria('${c.id}')">
              Remove Criterion
            </button>
          </div>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function escapeHtml(text: string): string {
  // Simple HTML escape function (no DOM dependency)
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
