import { ReSummarizeThread, SummarizeMessage, SummarizeThread } from './brain.fallback.prompts';
import { getSubscriptionFactory } from './factories/subscription-factory.registry';
import { AiChatPrompt, StyledEmailAssistantSystemPrompt } from './prompts';
import { resetConnection } from './server-utils';
import { EPrompts, EProviders } from '../types';
import { getPromptName } from '../pipelines';
import { env } from '../env';

export const enableBrainFunction = async (connection: { id: string; providerId: EProviders }) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    await subscriptionFactory.subscribe({ body: { connectionId: connection.id } });
  } catch (error) {
    console.error(`Failed to enable brain function: ${error}`);
    await resetConnection(connection.id);
  }
};

export const disableBrainFunction = async (connection: { id: string; providerId: EProviders }) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    await subscriptionFactory.unsubscribe({
      body: { connectionId: connection.id, providerId: connection.providerId },
    });
  } catch (error) {
    console.error(`Failed to disable brain function: ${error}`);
  }
};

export const getPrompt = async (promptName: string, fallback: string) => {
  const existingPrompt = await env.prompts_storage.get(promptName);
  if (!existingPrompt || existingPrompt === 'undefined') {
    await env.prompts_storage.put(promptName, fallback);
    return fallback;
  }
  return existingPrompt;
};

export const getPrompts = async ({ connectionId }: { connectionId: string }) => {
  const prompts: Record<EPrompts, string> = {
    [EPrompts.SummarizeMessage]: '',
    [EPrompts.ReSummarizeThread]: '',
    [EPrompts.SummarizeThread]: '',
    [EPrompts.Chat]: '',
    [EPrompts.Compose]: '',
    // [EPrompts.ThreadLabels]: '',
  };
  const fallbackPrompts = {
    [EPrompts.SummarizeMessage]: SummarizeMessage,
    [EPrompts.ReSummarizeThread]: ReSummarizeThread,
    [EPrompts.SummarizeThread]: SummarizeThread,
    [EPrompts.Chat]: AiChatPrompt(''),
    [EPrompts.Compose]: StyledEmailAssistantSystemPrompt(),
    // [EPrompts.ThreadLabels]: '',
  };
  for (const promptType of Object.values(EPrompts)) {
    const promptName = getPromptName(connectionId, promptType);
    const prompt = await getPrompt(promptName, fallbackPrompts[promptType]);
    prompts[promptType] = prompt;
  }
  return prompts;
};
