#!/usr/bin/env tsx
/**
 * Update the agent prototype seed file with the current system prompt
 * This script reads the conversational_with_tools prompt and updates the seed SQL file
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CONVERSATIONAL_WITH_TOOLS_PROMPT } from '../src/system_prompts/conversational_with_tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const seedFilePath = join(__dirname, '..', 'db', 'seed_agent_prototypes.sql');

// Escape single quotes for SQL
const escapedPrompt = CONVERSATIONAL_WITH_TOOLS_PROMPT.replace(/'/g, "''");

// Read the seed file
let seedContent = readFileSync(seedFilePath, 'utf-8');

// Replace the placeholder with the actual prompt
seedContent = seedContent.replace(/PLACEHOLDER_SYSTEM_PROMPT/g, escapedPrompt);

// Write back to the seed file
writeFileSync(seedFilePath, seedContent, 'utf-8');

console.log('Updated seed file with conversational_with_tools system prompt');
