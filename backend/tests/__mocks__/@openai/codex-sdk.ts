// Mock implementation of @openai/codex-sdk for testing
// This is a virtual module that gets replaced by jest.mock() in tests

export class Codex {
  constructor(options?: any) {}

  startThread(options: any): any {
    return {};
  }

  resumeThread(threadId: string, options: any): any {
    return {};
  }
}
