/**
 * POST /apps/chat
 *
 * Simple Anthropic chat endpoint for the App Builder interview pipeline.
 * Uses APP_BUILDER_SYSTEM_PROMPT (or a caller-supplied systemPrompt).
 *
 * Body:
 *   {
 *     messages: Array<{ role: 'user' | 'assistant'; content: string }>,
 *     systemPrompt?: string,
 *     phase?: 'phase1a' | 'phase1b' | 'review' | 'complete'
 *   }
 * Response: { text: string }
 */

import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { APP_BUILDER_SYSTEM_PROMPT } from '../lib/app-builder/ava-prompt';

const router = Router();

const client = new Anthropic({
  authToken: process.env.ANTHROPIC_AUTH_TOKEN,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    messages?: ChatMessage[];
    systemPrompt?: string;
    phase?: string;
  };

  const { messages, systemPrompt } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'messages array is required and must not be empty',
    });
  }

  // Validate message shapes
  const validMessages = messages.filter(
    (m) =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.trim().length > 0
  );

  if (validMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages found' });
  }

  // Merge consecutive same-role messages (Anthropic requirement)
  const cleanedMessages: ChatMessage[] = [];
  for (const m of validMessages) {
    const last = cleanedMessages[cleanedMessages.length - 1];
    if (last && last.role === m.role) {
      last.content += '\n' + m.content;
    } else {
      cleanedMessages.push({ role: m.role, content: m.content });
    }
  }

  // Ensure first message is from user
  while (cleanedMessages.length > 0 && cleanedMessages[0].role !== 'user') {
    cleanedMessages.shift();
  }
  if (cleanedMessages.length === 0) {
    return res.status(400).json({ error: 'No user messages found' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt ?? APP_BUILDER_SYSTEM_PROMPT,
      messages: cleanedMessages,
    });

    const text =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('') ?? '';

    return res.status(200).json({ text });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[apps/chat] Anthropic API error:', error.message);
    return res.status(500).json({ error: 'AI call failed', details: error.message });
  }
});

export default router;
