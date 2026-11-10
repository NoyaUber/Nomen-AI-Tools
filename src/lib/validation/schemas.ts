import { z } from 'zod';

export const ProjectInputSchema = z.object({
  title: z.string().trim().min(1, 'Project title is required').max(160, 'Max 160 characters'),
  description: z.string().trim().max(4000, 'Max 4000 characters').default(''),
  genre: z.string().trim().min(1, 'Genre is required').max(100, 'Max 100 characters'),
  worldSettings: z.string().trim().max(6000, 'Max 6000 characters').default(''),
  language: z.string().trim().min(1, 'Language is required').max(60, 'Max 60 characters'),
  status: z.enum(['active', 'archived']).default('active'),
});

export const NamingRequestSchema = z.object({
  category: z.string().min(1).max(80),
  count: z.number().int().min(2).max(8).default(4),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
  parameters: z.record(z.string(), z.string()),
  activeRules: z
    .array(
      z.object({
        title: z.string(),
        cultureOrGroup: z.string(),
        phoneticPattern: z.string(),
        prefixSuffixRule: z.string(),
        structureRule: z.string(),
        examples: z.string(),
      })
    )
    .optional(),
});

export const NamingCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  pronunciation: z.string().max(200),
  interpretation: z.string().max(2000),
  inspiration: z.string().max(2000),
  suitability: z.string().max(2000),
  titleOrVariation: z.string().max(500),
});

export const NamingResponseSchema = z.object({
  candidates: z.array(NamingCandidateSchema).min(1),
  etymologyNote: z.string(),
});

export const CharacterGenerationRequestSchema = z.object({
  prompt: z.string().min(3, 'Provide a brief concept or role for the character').max(2000),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
      language: z.string().optional(),
    })
    .optional(),
  activeRules: z.array(z.string()).optional(),
});

export const CharacterGenerationResponseSchema = z.object({
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  aliases: z.string(),
  gender: z.string(),
  age: z.string(),
  species: z.string(),
  race: z.string(),
  socialStatus: z.string(),
  nobleTitle: z.string(),
  storyRole: z.string(),
  personality: z.string(),
  appearance: z.string(),
  background: z.string(),
  origin: z.string(),
  motivation: z.string(),
  goals: z.string(),
  fears: z.string(),
  strengths: z.string(),
  weaknesses: z.string(),
  abilities: z.string(),
  relationships: z.string(),
  characterDevelopment: z.string(),
  additionalNotes: z.string(),
});

export const EntityGenerationRequestSchema = z.object({
  category: z.enum(['location', 'organization', 'item', 'ability', 'lore']),
  subCategory: z.string(),
  prompt: z.string().min(2).max(2000),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
    })
    .optional(),
});

export const AssistantRequestSchema = z.object({
  question: z.string().trim().min(2, 'Enter a question or prompt').max(4000),
  contextScope: z.enum(['current_entity', 'selected_entities', 'entire_project', 'none']),
  contextPayload: z.string().max(30000).default(''),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .max(12)
    .optional(),
});

export const ConsistencyRequestSchema = z.object({
  projectTitle: z.string(),
  worldSettings: z.string(),
  entities: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      subCategory: z.string(),
      name: z.string(),
      subtitle: z.string(),
      summary: z.string(),
      parentId: z.string().optional(),
      attributes: z.record(z.string(), z.string()).optional(),
    })
  ),
  relations: z.array(
    z.object({
      sourceEntityName: z.string(),
      targetEntityName: z.string(),
      relationType: z.string(),
      description: z.string(),
    })
  ),
  loreEntries: z.array(
    z.object({
      title: z.string(),
      category: z.string(),
      era: z.string(),
      summary: z.string(),
    })
  ),
  timelineEvents: z.array(
    z.object({
      title: z.string(),
      dateLabel: z.string(),
      sortOrder: z.number(),
      era: z.string(),
      locationName: z.string(),
      participants: z.string(),
      description: z.string(),
    })
  ),
});

export const ConsistencyFindingSchema = z.object({
  type: z.enum([
    'confirmed_conflict',
    'potential_inconsistency',
    'missing_information',
    'creative_possibility',
  ]),
  title: z.string(),
  involvedEntities: z.array(z.string()),
  explanation: z.string(),
  recommendation: z.string(),
});

export const ConsistencyResponseSchema = z.object({
  findings: z.array(ConsistencyFindingSchema),
  summary: z.string(),
});
