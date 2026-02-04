// ./conversationWebview.Test.ts
import { ConversationWebviewPanel } from '../../src/ui/conversationWebview.ts';

/** @aiContributed-2026-02-03 */
describe('ConversationWebviewPanel', () => {
    /** @aiContributed-2026-02-03 */
    describe('renderMessage', () => {
        let instance: ConversationWebviewPanel;

        beforeEach(() => {
            instance = new ConversationWebviewPanel(
                {} as Record<string, unknown>, 
                'testChatId', 
                {} as Record<string, unknown>, 
                []
            );
        });

        /** @aiContributed-2026-02-03 */
        it('should render a message with escaped content for "user" role', () => {
            const message = {
                role: 'user',
                content: '<script>alert("XSS")</script>'
            };
            const result = instance.renderMessage(message);
            expect(result).toContain('<div class="message user">');
            expect(result).toContain('<div class="message-bubble">&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</div>');
        });

        /** @aiContributed-2026-02-03 */
        it('should render a message with escaped content for "assistant" role', () => {
            const message = {
                role: 'assistant',
                content: 'Hello & welcome!'
            };
            const result = instance.renderMessage(message);
            expect(result).toContain('<div class="message assistant">');
            expect(result).toContain('<div class="message-bubble">Hello &amp; welcome!</div>');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle empty content gracefully', () => {
            const message = {
                role: 'user',
                content: ''
            };
            const result = instance.renderMessage(message);
            expect(result).toContain('<div class="message user">');
            expect(result).toContain('<div class="message-bubble"></div>');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined content gracefully', () => {
            const message = {
                role: 'assistant',
                content: undefined
            };
            const result = instance.renderMessage(message);
            expect(result).toContain('<div class="message assistant">');
            expect(result).toContain('<div class="message-bubble"></div>');
        });

        /** @aiContributed-2026-02-03 */
        it('should throw an error for invalid role', () => {
            const message = {
                role: 'invalid',
                content: 'Test'
            };
            expect(() => instance.renderMessage(message)).toThrow();
        });
    });
});