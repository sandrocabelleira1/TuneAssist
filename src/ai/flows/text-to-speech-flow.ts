'use server';
/**
 * @fileOverview A flow to convert text to speech using Google's TTS model.
 *
 * - generateSpeech - The flow function.
 * - TextToSpeechInput - The input type for the function.
 * - TextToSpeechOutput - The return type for the function.
 */
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import {
  TextToSpeechInputSchema,
  TextToSpeechOutputSchema,
  type TextToSpeechInput,
  type TextToSpeechOutput,
} from '@/ai/schemas';
import wav from 'wav';
import { z } from 'zod';

export type { TextToSpeechInput, TextToSpeechOutput };

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs: Buffer[] = [];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const generateSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeechFlow',
    inputSchema: TextToSpeechInputSchema,
    outputSchema: TextToSpeechOutputSchema,
  },
  async (text) => {
    try {
        const { media } = await ai.generate({
            model: googleAI.model('gemini-2.5-flash-preview-tts'),
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Algenib' }, // A friendly, clear voice
                },
                },
            },
            prompt: text,
        });

        if (!media?.url) {
            throw new Error('No audio media was returned from the AI.');
        }

        const audioBuffer = Buffer.from(
            media.url.substring(media.url.indexOf(',') + 1),
            'base64'
        );
        
        const wavBase64 = await toWav(audioBuffer);

        return {
            media: 'data:audio/wav;base64,' + wavBase64,
        };
    } catch (error) {
        // Re-throw to be caught by the action's error handler
        throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
);

export async function generateSpeech(input: TextToSpeechInput): Promise<TextToSpeechOutput> {
  return generateSpeechFlow(input);
}
