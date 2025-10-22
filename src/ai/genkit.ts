
'use server';

import { genkit, GenerationCommonConfig } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const safetySettings: GenerationCommonConfig['safetySettings'] = [
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
    }
];

export const ai = genkit({
    plugins: [
        googleAI({
            safetySettings,
        }),
    ],
    logLevel: 'debug',
    enableTracing: true,
});
