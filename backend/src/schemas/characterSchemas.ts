import { z } from 'zod';

export const importCharactersSchema = z.object({
  body: z.object({
    characters: z.array(z.object({
      name: z.string().min(1),
      realm: z.string().min(1),
      class: z.string().min(1),
      level: z.number().int(),
      guild: z.object({
        id: z.number().int(),
        name: z.string().min(1),
        realm: z.string().min(1)
      }).nullable().optional()
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

const wclMetric = z.enum(['dps', 'hps']).default('dps');

export const wclRaidPerformanceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    difficulty: z.coerce.number().int().refine((d) => [3, 4, 5].includes(d), 'Difficulté invalide').optional(),
    metric: wclMetric,
    // Nom de spécialisation WCL tel que renvoyé par l'API (ex. « Retribution », « BeastMastery »).
    spec: z.string().regex(/^[A-Za-z]{2,24}$/, 'Spécialisation invalide').optional(),
  }),
});

export const wclMythicPlusPerformanceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    metric: wclMetric,
  }),
});
