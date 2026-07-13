import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

export const CHAT_MODEL = 'claude-sonnet-4-6';

export const anthropicClient = new Anthropic({ apiKey: env.anthropicApiKey });
