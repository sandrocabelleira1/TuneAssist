'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/validate-map-type-flow.ts';
import '@/ai/flows/find-maps-flow.ts';
import '@/ai/flows/explain-map-flow.ts';
import '@/ai/flows/text-to-speech-flow.ts';
