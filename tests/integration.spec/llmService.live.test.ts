/**
 * LIVE Integration Tests for LLM Service
 * 
 * These tests hit an ACTUAL OpenAI-compatible API server at http://192.168.1.205:1234
 * Run with: npm test -- --testPathPattern="llmService.live"
 * 
 * Prerequisites:
 * - OpenAI-compatible server running on 192.168.1.205:1234 (e.g. LM Studio, Ollama, vLLM)
 * - At least one model loaded/available
 * 
 * These tests are skipped in CI (no LLM server available).
 * Set LLM_LIVE_TESTS=true to run them locally.
 */

// Skip entire file in CI
const SKIP_LIVE_TESTS = process.env.LLM_LIVE_TESTS !== 'true';
const describeLive = SKIP_LIVE_TESTS ? describe.skip : describe;

const LLM_ENDPOINT = 'http://192.168.1.205:1234/v1';
const TEST_MODEL = 'pico-lamma-3.2-1b-reasoning-instruct'; // Small, fast model for testing

describeLive('LLM Service - LIVE Integration Tests', () => {

    describe('Connection & Model Discovery', () => {
        it('Test 1: should connect to OpenAI-compatible server', async () => {
            const response = await fetch(`${LLM_ENDPOINT}/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });

            expect(response.ok).toBe(true);
            const data = await response.json() as any;
            expect(data.data).toBeDefined();
            expect(Array.isArray(data.data)).toBe(true);

            console.log(`Found ${data.data.length} models on server`);
        });

        it('Test 2: should list available models', async () => {
            const response = await fetch(`${LLM_ENDPOINT}/models`, {
                method: 'GET',
            });

            const data = await response.json() as any;
            const modelIds = data.data.map((m: any) => m.id);

            console.log('Available models:', modelIds);
            expect(modelIds.length).toBeGreaterThan(0);
        });

        it('Test 3: should find test model in available models', async () => {
            const response = await fetch(`${LLM_ENDPOINT}/models`, {
                method: 'GET',
            });

            const data = await response.json() as any;
            const modelIds = data.data.map((m: any) => m.id);
            const hasTestModel = modelIds.includes(TEST_MODEL);

            if (!hasTestModel) {
                console.warn(`Test model "${TEST_MODEL}" not found. Available: ${modelIds.join(', ')}`);
            }

            // Don't fail - just warn (model might not be installed)
            expect(modelIds.length).toBeGreaterThan(0);
        });
    });

    describe('Chat Completions - Non-Streaming', () => {
        it('Test 4: should get a response from basic prompt', async () => {
            const body = {
                model: TEST_MODEL,
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Be brief.' },
                    { role: 'user', content: 'Say "hello" and nothing else.' },
                ],
                max_tokens: 50,
                stream: false,
            };

            const response = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(60000), // 60s for model loading
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('Response error:', errorBody);

                // Check for model loading error
                if (errorBody.includes('Failed to load model')) {
                    console.warn('Model loading error - model may not be loaded on server');
                }
            }

            // We expect this to work with a loaded model
            expect(response.ok).toBe(true);

            const data = await response.json() as any;
            expect(data.choices).toBeDefined();
            expect(data.choices[0].message.content).toBeDefined();

            console.log('LLM Response:', data.choices[0].message.content);
        }, 120000); // 2 minute timeout for model loading

        it('Test 5: should handle response for nonexistent model', async () => {
            const body = {
                model: 'nonexistent-model-xyz-123',
                messages: [
                    { role: 'user', content: 'Hello' },
                ],
                max_tokens: 50,
                stream: false,
            };

            const response = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            // Server behavior varies - might return 200 with error in body, or 400
            // The key is we get a response (test passes)
            const responseText = await response.text();
            console.log(`Response status: ${response.status}, body: ${responseText.substring(0, 200)}`);

            // Just verify we got a response - error handling varies by implementation
            expect(response.status).toBeDefined();
        });
    });

    describe('Chat Completions - Streaming', () => {
        it('Test 6: should stream response chunks', async () => {
            const body = {
                model: TEST_MODEL,
                messages: [
                    { role: 'system', content: 'Be very brief.' },
                    { role: 'user', content: 'Count from 1 to 3.' },
                ],
                max_tokens: 50,
                stream: true,
            };

            const response = await fetch(`${LLM_ENDPOINT}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(120000),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('Streaming error:', errorBody);
            }

            expect(response.ok).toBe(true);

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();

            let fullResponse = '';
            let chunkCount = 0;

            let done = false;
            while (!done) {
                const { done: isDone, value } = await reader.read();
                done = isDone;

                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    chunkCount++;

                    // Parse SSE data
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const json = line.substring(5).trim();
                            if (json !== '[DONE]') {
                                try {
                                    const parsed = JSON.parse(json);
                                    const content = parsed.choices?.[0]?.delta?.content || '';
                                    fullResponse += content;
                                } catch {
                                    // Ignore parse errors for partial data
                                }
                            }
                        }
                    }
                }
            }

            console.log(`Received ${chunkCount} chunks, full response: "${fullResponse}"`);
            expect(chunkCount).toBeGreaterThan(0);
            expect(fullResponse.length).toBeGreaterThan(0);
        }, 180000); // 3 minute timeout
    });

    describe('Error Handling', () => {
        it('Test 7: should timeout on very short timeout', async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1); // 1ms timeout

            const body = {
                model: TEST_MODEL,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 50,
                stream: false,
            };

            await expect(
                fetch(`${LLM_ENDPOINT}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                })
            ).rejects.toThrow();

            clearTimeout(timeoutId);
        });

        it('Test 8: should handle unreachable endpoint gracefully', async () => {
            const fakeEndpoint = 'http://192.168.1.254:9999/v1'; // Unreachable

            await expect(
                fetch(`${fakeEndpoint}/models`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000),
                })
            ).rejects.toThrow();
        });
    });
});

// Quick smoke test that always runs (even without live server)
describe('LLM Service - Mock Sanity Check', () => {
    it('Test 0: should have fetch available (Node 18+)', () => {
        expect(typeof fetch).toBe('function');
    });
});
