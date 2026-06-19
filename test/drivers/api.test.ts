import { ApiDriver } from '../../src/drivers/api';
import { WakeResult } from '../../src/types';

jest.mock('node-fetch', () => {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
      model: 'test-model',
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    })
  });
});

describe('ApiDriver', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'http://mock-api.com';

  it('should call the API and return a WakeResult', async () => {
    const driver = new ApiDriver(mockApiKey, mockBaseUrl);
    const issueContext = 'Test issue context';
    const result = await driver.wake(issueContext);

    expect(result.content).toBe('Test response');
    expect(result.model).toBe('test-model');
    expect(result.tokens.prompt).toBe(10);
    expect(result.tokens.completion).toBe(20);
  });
});
