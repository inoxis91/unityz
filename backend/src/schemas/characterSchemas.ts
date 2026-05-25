import { z } from 'zod';

export const importCharactersSchema = z.object({
  body: z.object({
    characters: z.array(z.object({
      name: z.string().min(1),
      realm: z.string().min(1),
      class: z.string().min(1),
      level: z.number().int(),
    })),
  }),
});

export const updateRolesSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    isTank: z.boolean(),
    isHeal: z.boolean(),
    isDPS: z.boolean(),
  }),
});

export const setMainSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
