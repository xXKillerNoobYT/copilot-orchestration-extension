/**
 * Orchestrator Team Index
 * 
 * Exports all orchestrator-related modules including handlers,
 * routing, status management, and the orchestration loop.
 * 
 * @module agents/orchestrator
 */

// Handlers
export * from './handlers';

// Routing
export * from './routing';

// Status management
export * from './status';

// Orchestration loop
export * from './loop';
// Queue management
export * from './queue';

// File watching
export * from './fileWatcher';

// Boss notifications
export * from './boss';

// Error recovery
export * from './recovery';

// State persistence
export {
    OrchestratorStateManager,
    getOrchestratorStateManager,
    initializeOrchestratorState,
    resetOrchestratorStateManagerForTests,
    type OrchestratorState,
    type StateCheckpoint
} from './state';

// Deadlock detection
export * from './deadlock';