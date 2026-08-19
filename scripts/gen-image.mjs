#!/usr/bin/env node
// Minimal Gemini image generator — no Python needed.
// Usage: node scripts/gen-image.mjs "<prompt>" <output-path> [--ratio 16:9] [--model gemini-3-pro-image-preview]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY not found in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const prompt = args[0];
const outputPath = args[1];
if (!prompt || !outputPath) {
  console.error('Usage: node gen-image.mjs "<prompt>" <output-path> [--ratio 16:9] [--model name]');
  process.exit(1);
}
const ratioIdx = args.indexOf('--ratio');
const ratio = ratioIdx !== -1 ? args[ratioIdx + 1] : '1:1';
const modelIdx = args.indexOf('--model');
const model = modelIdx !== -1 ? args[modelIdx + 1] : 'gemini-3-pro-image-preview';

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE', 'TEXT'],
    imageConfig: { aspectRatio: ratio },
  },
};

console.log(`Generating with ${model} (${ratio})...`);
console.log(`Prompt: ${prompt.slice(0, 140)}...`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const json = await res.json();

if (json.error) {
  console.error('Error:', JSON.stringify(json.error, null, 2));
  process.exit(1);
}

const parts = json.candidates?.[0]?.content?.parts || [];
const imagePart = parts.find(p => p.inlineData?.data);

if (!imagePart) {
  console.error('No image returned.');
  console.error(JSON.stringify(json, null, 2).slice(0, 800));
  process.exit(1);
}

writeFileSync(outputPath, Buffer.from(imagePart.inlineData.data, 'base64'));
console.log(`Saved: ${outputPath}`);
