'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/motorcycle-manual-flow.ts';
import '@/ai/flows/generate-manual-content-flow.ts';
import '@/ai/flows/validate-map-type-flow.ts';
