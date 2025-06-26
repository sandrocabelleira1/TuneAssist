'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-map-corrections.ts';
import '@/ai/flows/motorcycle-manual-flow.ts';
import '@/ai/flows/generate-manual-content-flow.ts';
