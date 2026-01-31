export interface ChatMessageMetadata {
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
