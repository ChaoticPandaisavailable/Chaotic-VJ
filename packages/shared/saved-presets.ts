import { z } from 'zod';
import { configSchema } from './config.ts';

export const presetInput=z.object({name:z.string().trim().min(1).max(60),config:configSchema});
export const savedPresetSchema=presetInput.extend({id:z.string().uuid(),updatedAt:z.number().finite()});
export type SavedPreset=z.infer<typeof savedPresetSchema>;
