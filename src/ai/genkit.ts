'use server';
/**
 * @fileoverview This file initializes the Genkit AI singleton.
 *
 * It is important to only have one instance of the Genkit AI object,
 * so this file is the only place where `genkit()` is called.
 *
 * Other files that need to use Genkit (e.g. to define flows or prompts)
 * should import the `ai` object from this file.
 */

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const ai = genkit({
  plugins: [googleAI()],
});
