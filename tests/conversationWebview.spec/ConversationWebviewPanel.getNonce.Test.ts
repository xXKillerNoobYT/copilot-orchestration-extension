// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview.ts';

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
    /** @aiContributed-2026-02-03 */
    describe('getNonce', () => {
        /** @aiContributed-2026-02-03 */
        it('should generate a 32-character string containing only alphanumeric characters', () => {
            const mockArgs = { someProperty: 'value' } as unknown as ConstructorParameters<typeof ConversationWebviewPanel>[0];
            const instance = new ConversationWebviewPanel(mockArgs, '', {} as Record<string, unknown>); // Mock constructor arguments
            const nonce = (instance as unknown as { getNonce: () => string }).getNonce();

            expect(nonce).toHaveLength(32);
            expect(/^[A-Za-z0-9]+$/.test(nonce)).toBe(true);
        });

        /** @aiContributed-2026-02-03 */
        it('should generate a different string on each call', () => {
            const mockArgs = { someProperty: 'value' } as unknown as ConstructorParameters<typeof ConversationWebviewPanel>[0];
            const instance = new ConversationWebviewPanel(mockArgs, '', {} as Record<string, unknown>); // Mock constructor arguments
            const nonce1 = (instance as unknown as { getNonce: () => string }).getNonce();
            const nonce2 = (instance as unknown as { getNonce: () => string }).getNonce();

            expect(nonce1).not.toEqual(nonce2);
        });
    });
});