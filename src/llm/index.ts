/**
 * @file llm/index.ts
 * @module LLM
 * @description Barrel export for LLM queue, polling, and streaming modules
 * 
 * **Simple explanation**: Like a reception desk that directs you to the right
 * department - this file makes it easy to import anything LLM-related from
 * one place.
 */

// Queue management (MT-010.1, MT-010.2, MT-010.4, MT-010.6, MT-010.8)
export {
    LLMQueue,
    getLLMQueueInstance,
    resetLLMQueueForTests,
    type QueuedRequest,
    type QueueStats,
    type QueueConfig,
    type QueueRequestStatus
} from './queue';

// Token polling (MT-010.3)
export {
    TokenPoller,
    getTokenPollerInstance,
    resetTokenPollerForTests,
    type PollResult,
    type PollingSession,
    type PollingConfig
} from './polling';

// Queue warnings (MT-010.5)
export {
    QueueWarningManager,
    getQueueWarningManager,
    resetQueueWarningForTests,
    type QueueWarningConfig
} from './queueWarning';

// Streaming chunk processing (MT-010.7)
export {
    StreamProcessor,
    getStreamProcessorInstance,
    resetStreamProcessorForTests,
    type StreamChunk,
    type StreamResult,
    type StreamSession,
    type StreamingConfig
} from './streaming';

// LM Studio REST API v1 client (MT-034.1-8)
export {
    LMStudioClient,
    initializeLMStudioClient,
    getLMStudioClient,
    resetLMStudioClientForTests,
    ConversationTracker,
    LMStudioError,
    LMStudioConnectionError,
    LMStudioTimeoutError,
    detectAPIVersion,
    extractMessageContent,
    extractReasoningContent,
    extractToolCalls,
    extractInvalidToolCalls,
    parseResponse,
    parseResponseToText,
    parseSSELine,
    parseSSEChunk,
    DEFAULT_LMSTUDIO_CONFIG,
    type LMStudioConfig,
    type ChatMessage,
    type ChatRequest,
    type ChatResponse,
    type ParsedResponse,
    type ModelInfo,
    type ModelsResponse,
    type ModelLoadConfig,
    type ModelLoadResponse,
    type ToolDefinition,
    type MCPIntegration,
    type ResponseFormat,
    type ReasoningLevel,
    type OutputItem,
    type GenerationStats,
    type StreamEventType,
    type StreamChunk as LMStudioStreamChunk,
    type StreamCallback,
    type ConversationState,
    type APIVersionInfo
} from './lmStudioClient';
