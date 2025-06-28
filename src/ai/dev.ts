'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/validate-map-type-flow.ts';
import '@/ai/flows/find-maps-flow.ts';
