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
      customAiInstructions: z.string().optional(),
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
  count: z.number().int().min(1).max(3).optional().default(1),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
      language: z.string().optional(),
      customAiInstructions: z.string().optional(),
      relevantCanonSummary: z.string().optional(),
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
  count: z.number().int().min(1).max(3).optional().default(1),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
      customAiInstructions: z.string().optional(),
      relevantCanonSummary: z.string().optional(),
    })
    .optional(),
});

export const AssistantRequestSchema = z.object({
  question: z.string().trim().min(2, 'Enter a question or prompt').max(4000),
  contextScope: z.enum(['current_entity', 'selected_entities', 'entire_project', 'none']),
  contextPayload: z.string().max(40000).default(''),
  customAiInstructions: z.string().max(6000).optional(),
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
  customAiInstructions: z.string().optional(),
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
  severity: z.enum(['critical', 'warning', 'information']).optional().default('warning'),
  title: z.string(),
  involvedEntities: z.array(z.string()),
  explanation: z.string(),
  evidence: z.string().optional().default(''),
  recommendation: z.string(),
});

export const ConsistencyResponseSchema = z.object({
  findings: z.array(ConsistencyFindingSchema),
  summary: z.string(),
});

export const NomenProjectExportSchema = z.object({
  schemaVersion: z.string().optional().default('1.0.0'),
  studio: z.string().optional(),
  exportedAt: z.string().optional(),
  project: z.object({
    title: z.string().min(1),
    description: z.string().optional().default(''),
    genre: z.string().optional().default('Dark Editorial Fantasy'),
    worldSettings: z.string().optional().default(''),
    language: z.string().optional().default('English'),
  }),
  entities: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        category: z.string().optional().default('character'),
        subCategory: z.string().optional().default('Character'),
        name: z.string().optional().default('Unnamed Entity'),
        subtitle: z.string().optional().default(''),
        summary: z.string().optional().default(''),
        parentId: z.string().optional().default(''),
        attributes: z.record(z.string(), z.string()).optional().default({}),
      })
    )
    .optional()
    .default([]),
  relations: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        sourceEntityId: z.string().optional().default(''),
        sourceEntityName: z.string().optional().default(''),
        targetEntityId: z.string().optional().default(''),
        targetEntityName: z.string().optional().default(''),
        relationType: z.string().optional().default('Connected to'),
        description: z.string().optional().default(''),
      })
    )
    .optional()
    .default([]),
  loreEntries: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        title: z.string().optional().default('Untitled Chronicle'),
        category: z.string().optional().default('World History'),
        era: z.string().optional().default(''),
        summary: z.string().optional().default(''),
        content: z.string().optional().default(''),
      })
    )
    .optional()
    .default([]),
  timelineEvents: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        title: z.string().optional().default('Untitled Event'),
        dateLabel: z.string().optional().default('Year 1'),
        sortOrder: z.number().optional().default(0),
        era: z.string().optional().default(''),
        category: z.string().optional().default('Historical Event'),
        locationName: z.string().optional().default(''),
        participants: z.string().optional().default(''),
        description: z.string().optional().default(''),
      })
    )
    .optional()
    .default([]),
  namingRules: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        title: z.string().optional().default('Unnamed Convention'),
        category: z.string().optional().default('Character names'),
        cultureOrGroup: z.string().optional().default(''),
        phoneticPattern: z.string().optional().default(''),
        prefixSuffixRule: z.string().optional().default(''),
        structureRule: z.string().optional().default(''),
        morphologyNotes: z.string().optional().default(''),
        examples: z.string().optional().default(''),
        isActive: z.boolean().optional().default(true),
      })
    )
    .optional()
    .default([]),
  favorites: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        name: z.string().optional().default('Favorite'),
        pronunciation: z.string().optional().default(''),
        category: z.string().optional().default('Character names'),
        interpretation: z.string().optional().default(''),
        inspiration: z.string().optional().default(''),
        suitability: z.string().optional().default(''),
        titleOrVariation: z.string().optional().default(''),
      })
    )
    .optional()
    .default([]),
  aiSettings: z
    .object({
      customInstructions: z.string().optional().default(''),
      instructions: z.string().optional().default(''),
      isEnabled: z.boolean().optional().default(true),
    })
    .optional(),
  customAiInstructions: z
    .object({
      instructions: z.string().optional().default(''),
      customInstructions: z.string().optional().default(''),
      isEnabled: z.boolean().optional().default(true),
    })
    .optional(),
  visualAssets: z
    .array(
      z.object({
        id: z.string().optional().default(''),
        entityId: z.string().optional().default(''),
        entityName: z.string().optional().default(''),
        assetName: z.string().optional().default('Visual Asset'),
        assetCategory: z.string().optional().default('visual_reference'),
        subRole: z.string().optional().default(''),
        storagePath: z.string().optional().default(''),
        publicUrl: z.string().optional().default(''),
        mimeType: z.string().optional().default('image/svg+xml'),
        fileSize: z.number().optional().default(0),
        width: z.number().optional().default(800),
        height: z.number().optional().default(600),
        description: z.string().optional().default(''),
        isPrimary: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
});

export const AssetUploadRequestSchema = z.object({
  ownerId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  projectId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  assetId: z.string().max(128).optional().default(''),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  base64Data: z.string().min(10).max(9_000_000),
  title: z.string().max(200).optional().default(''),
  category: z.string().max(80).optional().default('general_reference'),
});

export const ImagePromptRequestSchema = z.object({
  assetCategory: z.string().min(1).max(80).default('character_portrait'),
  entityName: z.string().min(1).max(240),
  entityType: z.string().max(80).optional().default('Entity'),
  attributes: z.record(z.string(), z.string()).optional().default({}),
  artStyle: z.string().max(300).optional().default('Dark Editorial Fantasy Painting'),
  lightingMood: z.string().max(300).optional().default('Chiaroscuro candlelit gold and obsidian shadow'),
  aspectRatio: z.string().max(40).optional().default('3:4'),
  projectContext: z
    .object({
      title: z.string().optional(),
      genre: z.string().optional(),
      worldSettings: z.string().optional(),
      customAiInstructions: z.string().optional(),
    })
    .optional(),
});

export const ImagePromptResponseSchema = z.object({
  mainPrompt: z.string(),
  negativePrompt: z.string(),
  artDirectionNotes: z.string(),
  lightingAndPalette: z.string(),
  compositionNotes: z.string(),
});

export const ImageGenerateRequestSchema = z.object({
  ownerId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  projectId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  prompt: z.string().min(5).max(4000),
  assetCategory: z.string().max(80).optional().default('general_reference'),
  entityName: z.string().max(240).optional().default('Visual Concept Plate'),
  aspectRatio: z.string().max(40).optional().default('3:4'),
});



