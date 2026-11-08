// The mobile app has no API key, so the Anthropic SDK is not bundled; AI search uses keyword matching.
export default class Anthropic {
  constructor() {
    throw new Error('AI is not available in the mobile app');
  }
}
