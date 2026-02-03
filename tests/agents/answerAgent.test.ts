import AnswerAgent, { Message, ConversationMetadata, createChatId, MAX_HISTORY_EXCHANGES } from '../../src/agents/answerAgent';
import * as llmService from '../../src/services/llmService';
import { logInfo, logError, logWarn } from '../../src/logger';

// Mock the llmService
jest.mock('../../src/services/llmService');
jest.mock('../../src/logger');

const mockCompleteLLM = llmService.completeLLM as jest.MockedFunction<typeof llmService.completeLLM>;

describe('AnswerAgent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createChatId', () => {
        it('should generate unique chat IDs', () => {
            const id1 = createChatId();
            const id2 = createChatId();

            expect(id1).toMatch(/^chat-/);
            expect(id2).toMatch(/^chat-/);
            expect(id1).not.toBe(id2);
        });

        it('should generate chat IDs with expected format', () => {
            const id = createChatId();
            const parts = id.split('-');

            expect(parts.length).toBe(3); // "chat-{timestamp}-{random}"
            expect(parts[0]).toBe('chat');
            expect(parts[1]).toMatch(/^[a-z0-9]+$/); // timestamp in base36
            expect(parts[2]).toMatch(/^[a-z0-9]+$/); // random string
        });
    });

    describe('AnswerAgent.ask() - Single Turn', () => {
        it('should answer a question and return the response', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const question = 'What is TypeScript?';
            const expectedAnswer = 'TypeScript is a typed superset of JavaScript.';

            mockCompleteLLM.mockResolvedValue({
                content: expectedAnswer,
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            });

            // Act
            const answer = await agent.ask(question);

            // Assert
            expect(answer).toBe(expectedAnswer);
            expect(mockCompleteLLM).toHaveBeenCalledTimes(1);

            // Verify messages format
            const callArgs = mockCompleteLLM.mock.calls[0];
            const options = callArgs[1];
            expect(options?.messages).toBeDefined();
            expect(options?.messages?.length).toBe(2); // system + user

            const messages = options?.messages || [];
            expect(messages[0]).toEqual({
                role: 'system',
                content: expect.any(String)
            });
            expect(messages[1]).toEqual({
                role: 'user',
                content: question
            });
        });

        it('should store question and answer in history after first ask', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-1';
            const question = 'What is React?';
            const answer = 'React is a JavaScript library for building UIs.';

            mockCompleteLLM.mockResolvedValue({
                content: answer,
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            });

            // Act
            await agent.ask(question, chatId);

            // Assert - verify history was stored
            const history = agent.getHistory(chatId);
            expect(history).toBeDefined();
            expect(history?.length).toBe(2); // user + assistant
            expect(history?.[0]).toEqual({ role: 'user', content: question });
            expect(history?.[1]).toEqual({ role: 'assistant', content: answer });
        });

        it('should generate new chatId if none provided', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const question = 'Question?';
            const answer = 'Answer.';

            mockCompleteLLM.mockResolvedValue({ content: answer });

            // Act
            const result = await agent.ask(question);

            // Assert
            expect(result).toBe(answer);
            // Verify a chatId was generated and stored (at least one history entry)
            const logInfoCalls = (logInfo as jest.Mock).mock.calls;
            const hasChatId = logInfoCalls.some(call =>
                call[0].includes('chat-') && call[0].includes('question in chat')
            );
            expect(hasChatId).toBeTruthy();
        });
    });

    describe('AnswerAgent.ask() - Multi-Turn', () => {
        it('should include previous Q&A in messages for follow-up', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-2';
            const q1 = 'What is JavaScript?';
            const a1 = 'JavaScript is a programming language.';
            const q2 = 'How is it different from TypeScript?';
            const a2 = 'TypeScript adds static typing to JavaScript.';

            mockCompleteLLM
                .mockResolvedValueOnce({ content: a1 })
                .mockResolvedValueOnce({ content: a2 });

            // Act - First question
            const answer1 = await agent.ask(q1, chatId);
            // Act - Follow-up question
            const answer2 = await agent.ask(q2, chatId);

            // Assert
            expect(answer1).toBe(a1);
            expect(answer2).toBe(a2);

            // Verify second call included history
            const secondCallArgs = mockCompleteLLM.mock.calls[1];
            const secondCallMessages = secondCallArgs[1]?.messages;

            expect(secondCallMessages?.length).toBe(4); // system + Q1 + A1 + Q2
            expect(secondCallMessages?.[1]).toEqual({ role: 'user', content: q1 });
            expect(secondCallMessages?.[2]).toEqual({ role: 'assistant', content: a1 });
            expect(secondCallMessages?.[3]).toEqual({ role: 'user', content: q2 });
        });

        it('should maintain separate histories for different chatIds', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId1 = 'chat-1';
            const chatId2 = 'chat-2';
            const q1a = 'Q1 in chat 1';
            const a1a = 'A1 in chat 1';
            const q1b = 'Q1 in chat 2';
            const a1b = 'A1 in chat 2';

            mockCompleteLLM
                .mockResolvedValueOnce({ content: a1a })
                .mockResolvedValueOnce({ content: a1b });

            // Act
            await agent.ask(q1a, chatId1);
            await agent.ask(q1b, chatId2);

            // Assert - verify separate histories
            const history1 = agent.getHistory(chatId1);
            const history2 = agent.getHistory(chatId2);

            expect(history1).toEqual([
                { role: 'user', content: q1a },
                { role: 'assistant', content: a1a }
            ]);
            expect(history2).toEqual([
                { role: 'user', content: q1b },
                { role: 'assistant', content: a1b }
            ]);
        });

        it('should trim history to MAX_HISTORY_EXCHANGES when exceeded', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-3';
            const answers = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'];

            mockCompleteLLM.mockImplementation(async () => {
                const callCount = mockCompleteLLM.mock.calls.length;
                return { content: answers[callCount - 1] };
            });

            // Act - Ask 9 questions to exceed 5-exchange limit
            for (let i = 1; i <= 9; i++) {
                await agent.ask(`Question ${i}`, chatId);
            }

            // Assert - verify only last 5 exchanges (10 messages) are kept
            const history = agent.getHistory(chatId);

            // After 9 exchanges, history should have only 10 messages (5 exchanges)
            expect(history?.length).toBe(MAX_HISTORY_EXCHANGES * 2);

            // Verify the stored history contains the last exchanges
            // Last exchange should be Q9/A9
            expect(history?.[history.length - 2]).toEqual({
                role: 'user',
                content: 'Question 9'
            });
            expect(history?.[history.length - 1]).toEqual({
                role: 'assistant',
                content: 'A9'
            });

            // First message should be from around Q5 (because we keep last 5)
            // With 9 questions, we should have Q5-Q9 (5 exchanges)
            expect(history?.[0].content).toContain('Question 5');
        });

        it('should pass complete message history to LLM on each turn', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-4';

            mockCompleteLLM
                .mockResolvedValueOnce({ content: 'A1' })
                .mockResolvedValueOnce({ content: 'A2' })
                .mockResolvedValueOnce({ content: 'A3' });

            // Act - Ask 3 questions
            await agent.ask('Q1', chatId);
            await agent.ask('Q2', chatId);
            await agent.ask('Q3', chatId);

            // Assert - verify each call has correct message count
            const firstCallMessages = mockCompleteLLM.mock.calls[0][1]?.messages;
            const secondCallMessages = mockCompleteLLM.mock.calls[1][1]?.messages;
            const thirdCallMessages = mockCompleteLLM.mock.calls[2][1]?.messages;

            expect(firstCallMessages?.length).toBe(2); // system + Q1
            expect(secondCallMessages?.length).toBe(4); // system + Q1 + A1 + Q2
            expect(thirdCallMessages?.length).toBe(6); // system + Q1 + A1 + Q2 + A2 + Q3
        });
    });

    describe('AnswerAgent.getHistory()', () => {
        it('should return undefined for non-existent chatId', async () => {
            // Arrange
            const agent = new AnswerAgent();

            // Act
            const history = agent.getHistory('non-existent');

            // Assert
            expect(history).toBeUndefined();
        });

        it('should return empty array equivalent (via getHistory) for new chatId', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'new-chat';
            const question = 'Q1';

            mockCompleteLLM.mockResolvedValue({ content: 'A1' });

            // Act
            await agent.ask(question, chatId);
            const history = agent.getHistory(chatId);

            // Assert
            expect(history).toBeDefined();
            expect(history?.length).toBe(2); // Q1 + A1
        });
    });

    describe('AnswerAgent.clearHistory()', () => {
        it('should remove history for specified chatId', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-5';

            mockCompleteLLM.mockResolvedValue({ content: 'Answer' });
            await agent.ask('Question', chatId);

            // Verify history exists
            expect(agent.getHistory(chatId)).toBeDefined();

            // Act
            agent.clearHistory(chatId);

            // Assert
            expect(agent.getHistory(chatId)).toBeUndefined();
        });

        it('should not affect other chatIds when clearing one', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId1 = 'chat-1';
            const chatId2 = 'chat-2';

            mockCompleteLLM
                .mockResolvedValueOnce({ content: 'A1' })
                .mockResolvedValueOnce({ content: 'A2' });

            await agent.ask('Q1', chatId1);
            await agent.ask('Q2', chatId2);

            // Act
            agent.clearHistory(chatId1);

            // Assert
            expect(agent.getHistory(chatId1)).toBeUndefined();
            expect(agent.getHistory(chatId2)).toBeDefined();
        });
    });

    describe('AnswerAgent Error Handling', () => {
        it('should handle LLM errors gracefully', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-error';
            const errorMessage = 'LLM service unavailable';

            mockCompleteLLM.mockRejectedValue(new Error(errorMessage));

            // Act & Assert
            await expect(agent.ask('Question', chatId)).rejects.toThrow(errorMessage);

            // History should not be updated on error
            expect(agent.getHistory(chatId)).toBeUndefined();
        });

        it('should log error when LLM fails', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-error-2';
            const errorMessage = 'Network error';

            mockCompleteLLM.mockRejectedValue(new Error(errorMessage));

            // Act
            try {
                await agent.ask('Q', chatId);
            } catch {
                // Expected error
            }

            // Assert
            expect(logError).toHaveBeenCalled();
            const logErrorCall = (logError as jest.Mock).mock.calls[0];
            expect(logErrorCall[0]).toContain('Error');
        });
    });

    describe('Message Format Validation', () => {
        it('should send messages in correct OpenAI format', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-format';

            mockCompleteLLM.mockResolvedValue({ content: 'Answer' });

            // Act
            await agent.ask('Question', chatId);

            // Assert
            const callMessages = mockCompleteLLM.mock.calls[0][1]?.messages;
            expect(Array.isArray(callMessages)).toBe(true);

            callMessages?.forEach((msg: any) => {
                expect(msg).toHaveProperty('role');
                expect(msg).toHaveProperty('content');
                expect(['user', 'assistant', 'system']).toContain(msg.role);
                expect(typeof msg.content).toBe('string');
            });
        });

        it('should always include system prompt as first message', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-system';

            mockCompleteLLM.mockResolvedValue({ content: 'A1' });

            // Act
            await agent.ask('Q', chatId);

            // Assert
            const messages = mockCompleteLLM.mock.calls[0][1]?.messages;
            expect(messages?.[0]?.role).toBe('system');
            expect(messages?.[0]?.content).toContain('Answer agent');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty question string', async () => {
            // Arrange
            const agent = new AnswerAgent();
            mockCompleteLLM.mockResolvedValue({ content: 'Answer' });

            // Act
            const result = await agent.ask('');

            // Assert
            expect(result).toBe('Answer');
            expect(mockCompleteLLM).toHaveBeenCalled();
        });

        it('should handle very long question text', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const longQuestion = 'Q'.repeat(10000);
            mockCompleteLLM.mockResolvedValue({ content: 'Answer' });

            // Act
            const result = await agent.ask(longQuestion);

            // Assert
            expect(result).toBe('Answer');
            const messages = mockCompleteLLM.mock.calls[0][1]?.messages;
            expect(messages?.[messages.length - 1]?.content).toBe(longQuestion);
        });

        it('should handle exactly MAX_HISTORY_EXCHANGES exchanges without trimming', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const chatId = 'test-chat-exact';
            const maxExchanges = MAX_HISTORY_EXCHANGES;

            mockCompleteLLM.mockImplementation(async () => {
                return { content: `Answer ${mockCompleteLLM.mock.calls.length}` };
            });

            // Act - Ask exactly 5 questions
            for (let i = 1; i <= maxExchanges; i++) {
                await agent.ask(`Q${i}`, chatId);
            }

            // Assert - should have all 10 messages (no trimming yet)
            const history = agent.getHistory(chatId);
            expect(history?.length).toBe(maxExchanges * 2); // Q1,A1,Q2,A2...Q5,A5

            // 6th question should trigger trimming
            await agent.ask('Q6', chatId);
            const historyAfter = agent.getHistory(chatId);
            expect(historyAfter?.length).toBe(maxExchanges * 2); // Still 10 (trimmed to last 5)
        });
    });

    describe('Auto-close inactive conversations', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should close conversations inactive for >30 days', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const oldDate = new Date('2025-12-01T00:00:00Z');
            jest.setSystemTime(oldDate);

            mockCompleteLLM.mockResolvedValue({
                content: 'Old answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            await agent.ask('Old question', 'old-chat');

            // Act - Advance time 32 days
            jest.setSystemTime(new Date('2026-01-02T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Assert
            expect(agent.getHistory('old-chat')).toBeUndefined();
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Auto-closed inactive chat old-chat'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('32 days old'));
        });

        it('should NOT close conversations active within 30 days', async () => {
            // Arrange
            const agent = new AnswerAgent();
            const recentDate = new Date('2026-01-20T00:00:00Z');
            jest.setSystemTime(recentDate);

            mockCompleteLLM.mockResolvedValue({
                content: 'Recent answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            await agent.ask('Recent question', 'recent-chat');

            // Act - Advance only 10 days
            jest.setSystemTime(new Date('2026-01-30T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Assert
            const history = agent.getHistory('recent-chat');
            expect(history).toBeDefined();
            expect(history?.length).toBe(2); // user + assistant
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('no inactive conversations found'));
        });

        it('should handle exactly 30 days (boundary condition)', async () => {
            // Arrange
            const agent = new AnswerAgent();
            jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

            mockCompleteLLM.mockResolvedValue({
                content: 'Answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            await agent.ask('Question', 'boundary-chat');

            // Act - Exactly 30 days = 30 * 24 * 60 * 60 * 1000 ms
            jest.setSystemTime(new Date('2026-01-31T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Assert - Should NOT be deleted (>30, not >=30)
            expect(agent.getHistory('boundary-chat')).toBeDefined();
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('no inactive conversations found'));
        });

        it('should handle cleanup with no conversations', async () => {
            // Arrange
            const agent = new AnswerAgent();

            // Act
            await agent.cleanupInactiveConversations();

            // Assert
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('no inactive conversations found'));
        });

        it('should handle multiple chats (old and new)', async () => {
            // Arrange
            const agent = new AnswerAgent();

            // Create old chat
            jest.setSystemTime(new Date('2025-12-01T00:00:00Z'));
            mockCompleteLLM.mockResolvedValue({
                content: 'Old answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });
            await agent.ask('Old Q', 'old-chat');

            // Create new chat
            jest.setSystemTime(new Date('2026-01-20T00:00:00Z'));
            mockCompleteLLM.mockResolvedValue({
                content: 'New answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });
            await agent.ask('New Q', 'new-chat');

            // Act - Set current time to Feb 1 (old = 62 days, new = 12 days)
            jest.setSystemTime(new Date('2026-02-01T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Assert
            expect(agent.getHistory('old-chat')).toBeUndefined(); // 62 days old - deleted
            expect(agent.getHistory('new-chat')).toBeDefined(); // 12 days old - kept
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('removed 1 inactive conversation'));
        });

        it('should handle cleanup errors gracefully', async () => {
            // Arrange
            const agent = new AnswerAgent();
            mockCompleteLLM.mockResolvedValue({
                content: 'Answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            await agent.ask('Question', 'test-chat');

            // Force an error by mocking Map.entries to throw
            const originalEntries = agent['conversationHistory'].entries;
            jest.spyOn(agent['conversationHistory'], 'entries').mockImplementation(() => {
                throw new Error('Map corrupted');
            });

            // Act
            await agent.cleanupInactiveConversations();

            // Assert
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('Map corrupted'));

            // Cleanup
            agent['conversationHistory'].entries = originalEntries;
        });

        it('should update lastActivityAt on each ask', async () => {
            // Arrange
            const agent = new AnswerAgent();
            jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

            mockCompleteLLM.mockResolvedValue({
                content: 'Answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            // First ask
            await agent.ask('Q1', 'test-chat');
            const metadata1 = agent['conversationHistory'].get('test-chat');
            expect(metadata1?.lastActivityAt).toBe('2026-01-01T00:00:00.000Z');

            // Second ask (10 days later)
            jest.setSystemTime(new Date('2026-01-11T00:00:00Z'));
            await agent.ask('Q2', 'test-chat');
            const metadata2 = agent['conversationHistory'].get('test-chat');
            expect(metadata2?.lastActivityAt).toBe('2026-01-11T00:00:00.000Z');

            // createdAt should stay the same
            expect(metadata2?.createdAt).toBe(metadata1?.createdAt);

            // Cleanup at 32 days from original = only 21 days from last activity
            jest.setSystemTime(new Date('2026-02-02T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Should NOT be deleted (21 days since last activity)
            expect(agent.getHistory('test-chat')).toBeDefined();
        });

        it('should log each deleted conversation with details', async () => {
            // Arrange
            const agent = new AnswerAgent();
            jest.setSystemTime(new Date('2025-12-01T00:00:00Z'));

            mockCompleteLLM.mockResolvedValue({
                content: 'Answer',
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
            });

            await agent.ask('Q1', 'chat-1');
            await agent.ask('Q2', 'chat-2');

            // Act - 35 days later
            jest.setSystemTime(new Date('2026-01-05T00:00:00Z'));
            await agent.cleanupInactiveConversations();

            // Assert
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Auto-closed inactive chat chat-1'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('35 days old'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('last active: 2025-12-01'));
            expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('removed 2 inactive conversation'));
        });
    });

    describe('Persistence', () => {
        it('should serialize history into JSON strings', async () => {
            const agent = new AnswerAgent();
            const chatId = 'chat-serialize';
            const question = 'What is Node.js?';
            const answer = 'Node.js is a JavaScript runtime.';

            mockCompleteLLM.mockResolvedValue({
                content: answer,
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            });

            await agent.ask(question, chatId);

            const serialized = agent.serializeHistory();

            expect(serialized[chatId]).toBeDefined();

            const parsed = JSON.parse(serialized[chatId]) as ConversationMetadata;
            expect(parsed.chatId).toBe(chatId);
            expect(parsed.messages).toEqual([
                { role: 'user', content: question },
                { role: 'assistant', content: answer }
            ]);
        });

        it('should deserialize history back into the Map', () => {
            const agent = new AnswerAgent();
            const chatId = 'chat-deserialize';
            const metadata: ConversationMetadata = {
                chatId,
                createdAt: '2026-02-01T00:00:00.000Z',
                lastActivityAt: '2026-02-02T00:00:00.000Z',
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there' }
                ]
            };

            agent.deserializeHistory({
                [chatId]: JSON.stringify(metadata)
            });

            expect(agent.getHistory(chatId)).toEqual(metadata.messages);
        });

        it('should support save/load cycle across instances', async () => {
            const agent = new AnswerAgent();
            const chatId = 'chat-save-load';

            mockCompleteLLM.mockResolvedValue({
                content: 'Answer 1',
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            });

            await agent.ask('Question 1', chatId);
            const serialized = agent.serializeHistory();

            const newAgent = new AnswerAgent();
            newAgent.deserializeHistory(serialized);

            expect(newAgent.getHistory(chatId)).toEqual(agent.getHistory(chatId));
        });

        it('should restore context after reload simulation', async () => {
            const agent = new AnswerAgent();
            const chatId = 'chat-reload';

            mockCompleteLLM
                .mockResolvedValueOnce({
                    content: 'Answer 1',
                    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
                })
                .mockResolvedValueOnce({
                    content: 'Answer 2',
                    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
                });

            await agent.ask('Question 1', chatId);
            await agent.ask('Question 2', chatId);

            const serialized = agent.serializeHistory();
            const newAgent = new AnswerAgent();
            newAgent.deserializeHistory(serialized);

            expect(newAgent.getHistory(chatId)).toEqual(agent.getHistory(chatId));
        });

        it('should warn and skip invalid JSON entries', () => {
            const agent = new AnswerAgent();

            agent.deserializeHistory({
                'bad-chat': '{invalid-json}'
            });

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load history for chat bad-chat')
            );
        });

        it('should truncate oversized histories and warn', () => {
            const agent = new AnswerAgent();
            const chatId = 'chat-large';
            const largeContent = 'a'.repeat(1024 * 1024);

            agent['conversationHistory'].set(chatId, {
                chatId,
                createdAt: '2026-02-01T00:00:00.000Z',
                lastActivityAt: '2026-02-02T00:00:00.000Z',
                messages: [
                    { role: 'user', content: largeContent },
                    { role: 'assistant', content: largeContent }
                ]
            });

            agent.serializeHistory();

            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('History truncated due to size')
            );
        });
    });
});
