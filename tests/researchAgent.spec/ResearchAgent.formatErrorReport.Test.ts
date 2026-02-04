// ./researchAgent.Test.ts
import { ResearchAgent } from '../../src/agents/researchAgent.ts';

/** @aiContributed-2026-02-03 */
describe('ResearchAgent', () => {
    /** @aiContributed-2026-02-03 */
    describe('formatErrorReport', () => {
        let researchAgent: ResearchAgent;

        beforeEach(() => {
            researchAgent = new ResearchAgent();
        });

        /** @aiContributed-2026-02-03 */
        it('should format the error report correctly with valid inputs', () => {
            const query = 'Test Query';
            const errorMessage = 'An error occurred';
            const mockDate = new Date('2023-01-01T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

            const result = researchAgent['formatErrorReport'](query, errorMessage);

            expect(result).toBe(`# Research Error

**Query:** Test Query  
**Generated:** Sunday, January 1, 2023 at 12:00 PM

---

## Error Details

Failed to generate research report: An error occurred

The Research Agent encountered an issue while processing your query. This may be due to:
- LLM service unavailability
- Network connectivity issues
- Query processing errors

Please try again later or check the COE logs for more details.

---

*COE Research Agent*
`);
        });

        /** @aiContributed-2026-02-03 */
        it('should handle null query gracefully', () => {
            const query = null;
            const errorMessage = 'An error occurred';
            const mockDate = new Date('2023-01-01T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

            const result = researchAgent['formatErrorReport'](query, errorMessage);

            expect(result).toContain('**Query:** null');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle undefined errorMessage gracefully', () => {
            const query = 'Test Query';
            const errorMessage = undefined;
            const mockDate = new Date('2023-01-01T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

            const result = researchAgent['formatErrorReport'](query, errorMessage);

            expect(result).toContain('Failed to generate research report: undefined');
        });

        /** @aiContributed-2026-02-03 */
        it('should include the correct timestamp in the report', () => {
            const query = 'Test Query';
            const errorMessage = 'An error occurred';
            const mockDate = new Date('2023-01-01T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

            const result = researchAgent['formatErrorReport'](query, errorMessage);

            expect(result).toContain('**Generated:** Sunday, January 1, 2023 at 12:00 PM');
        });

        /** @aiContributed-2026-02-03 */
        it('should handle empty query and errorMessage gracefully', () => {
            const query = '';
            const errorMessage = '';
            const mockDate = new Date('2023-01-01T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as unknown as string);

            const result = researchAgent['formatErrorReport'](query, errorMessage);

            expect(result).toContain('**Query:** ');
            expect(result).toContain('Failed to generate research report: ');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });
    });
});