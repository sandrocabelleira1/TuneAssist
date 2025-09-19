'use server';
import {genkit} from 'genkit';
import { firebase } from '@genkit-ai/firebase/plugin';
import {googleAI} from '@genkit-ai/googleai';

// Esta é a sintaxe correta para inicializar o Genkit v1.x.
// Não inclua `logLevel` aqui; isso é feito em outro lugar se necessário.
export const ai = genkit({
  plugins: [
    firebase(),
    googleAI({
      apiVersion: 'v1beta',
    }),
  ],
});

    