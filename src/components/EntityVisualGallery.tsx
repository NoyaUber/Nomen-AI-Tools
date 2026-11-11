import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Edit3,
  Eye,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  CHARACTER_VISUAL_ROLES,
  ITEM_VISUAL_ROLES,
  LOCATION_VISUAL_ROLES,
  ORGANIZATION_EMBLEM_ROLES,
  POWER_VISUAL_ROLES,
  Project,
  VisualAsset,
  WorldEntity,
} from '../types/nomen';
import {
  createVisualAsset,
  deleteVisualAsset,
  setPrimaryVisualAsset,
  updateVisualAsset,
} from '../lib/db/firestore-service';
import {
  generateImagePromptApi,
  generateVisualConceptApi,
  uploadVisualAssetFileApi,
} from '../lib/ai/client';
import { auth } from '../lib/firebase';

interface EntityVisualGalleryProps {
  project: Project;
  entity: WorldEntity;
  assets: VisualAsset[];
  defaultCategory: AssetCategory;
  customVisualNotes?: string;
  onSaveCustomVisualNotes?: (notes: string) => Promise<void>;
}

function getSubRolesForEntity(category: WorldEntity['category']): readonly string[] {
  switch (category) {
    case 'character':
      return CHARACTER_VISUAL_ROLES;
    case 'location':
      return LOCATION_VISUAL_ROLES;
    case 'organization':
      return ORGANIZATION_EMBLEM_ROLES;
    case 'item':
      return ITEM_VISUAL_ROLES;
    case 'ability':
      return POWER_VISUAL_ROLES;
    default:
      return ['Main Visual', 'Concept Art', 'Additional Gallery Image'];
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function readFileAsDataUrlAndDimensions(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.naturalWidth || 800,
          height: img.naturalHeight || 1000,
        });
      };
      img.onerror = () => {
        resolve({ dataUrl, width: 800, height: 1000 });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const EntityVisualGallery: React.FC<EntityVisualGalleryProps> = ({
  project,
  entity,
  assets,
  defaultCategory,
  customVisualNotes = '',
  onSaveCustomVisualNotes,
}) => {
  const entityAssets = assets.filter((a) => a.entityId === entity.id);
  const primaryAsset =
    entityAssets.find((a) => a.isPrimary) || entityAssets[0] || null;

  const availableRoles = getSubRolesForEntity(entity.category);

  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>(availableRoles[0] || 'Main Visual');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory>(defaultCategory);
  const [description, setDescription] = useState('');
  const [makePrimary, setMakePrimary] = useState(entityAssets.length === 0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Replace existing asset file state
  const [replacingAsset, setReplacingAsset] = useState<VisualAsset | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  // Edit description/role state
  const [editingAsset, setEditingAsset] = useState<VisualAsset | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editRole, setEditRole] = useState('');

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Lightbox preview modal
  const [lightboxAsset, setLightboxAsset] = useState<VisualAsset | null>(null);

  // Custom visual notes editor
  const [notesDraft, setNotesDraft] = useState(customVisualNotes);
  const [savingNotes, setSavingNotes] = useState(false);

  // AI Image Prompt & Concept Plate Assistant
  const [showPromptAssistant, setShowPromptAssistant] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<{
    mainPrompt: string;
    negativePrompt: string;
    artDirectionNotes: string;
    lightingAndPalette: string;
    compositionNotes: string;
  } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Reviewable Concept Plate before saving
  const [conceptLoading, setConceptLoading] = useState(false);
  const [conceptPreview, setConceptPreview] = useState<{
    storagePath: string;
    publicUrl: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    notice?: string;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Unsupported file format. Please upload JPEG, PNG, WebP, or SVG.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setErrorMsg('Image exceeds the 6 MB maximum size limit.');
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setErrorMsg('You must be signed in to upload visual assets.');
      return;
    }

    setUploading(true);
    setUploadProgress(20);
    try {
      const { dataUrl, width, height } = await readFileAsDataUrlAndDimensions(file);
      setUploadProgress(55);

      const uploaded = await uploadVisualAssetFileApi({
        ownerId: uid,
        projectId: project.id,
        fileName: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/svg+xml',
        base64Data: dataUrl,
      });
      setUploadProgress(85);

      await createVisualAsset({
        projectId: project.id,
        entityId: entity.id,
        entityType: entity.category,
        entityName: entity.name,
        assetCategory: selectedCategory,
        subRole: selectedRole,
        fileName: file.name,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        width,
        height,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        description: description.trim() || `${selectedRole} for ${entity.name}`,
        isPrimary: entityAssets.length === 0 ? true : makePrimary,
      });

      setUploadProgress(100);
      setDescription('');
      setShowUploadPanel(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 400);
      e.target.value = '';
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingAsset) return;
    setErrorMsg(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Unsupported file format. Please upload JPEG, PNG, WebP, or SVG.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setUploading(true);
    try {
      const { dataUrl, width, height } = await readFileAsDataUrlAndDimensions(file);
      const uploaded = await uploadVisualAssetFileApi({
        ownerId: uid,
        projectId: project.id,
        fileName: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/svg+xml',
        base64Data: dataUrl,
      });

      await updateVisualAsset(replacingAsset.id, {
        fileName: file.name,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        width,
        height,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
      });
      setReplacingAsset(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to replace image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleGeneratePrompt = async () => {
    setPromptLoading(true);
    setErrorMsg(null);
    try {
      const res = await generateImagePromptApi({
        assetCategory: defaultCategory,
        entityName: entity.name,
        entityType: `${entity.category} (${entity.subCategory})`,
        attributes: {
          subtitle: entity.subtitle,
          summary: entity.summary,
          ...entity.attributes,
        },
        artStyle: 'Dark Editorial Fantasy painterly concept art, museum-grade detail',
        lightingMood: 'Chiaroscuro candlelit gold and obsidian shadow',
        aspectRatio: entity.category === 'character' ? '2:3' : '16:9',
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      setGeneratedPrompt(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to synthesize image prompt');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleGenerateConceptPreview = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !generatedPrompt) return;
    setConceptLoading(true);
    setErrorMsg(null);
    try {
      const preview = await generateVisualConceptApi({
        ownerId: uid,
        projectId: project.id,
        prompt: generatedPrompt.mainPrompt,
        assetCategory: defaultCategory,
        entityName: entity.name,
        aspectRatio: entity.category === 'character' ? '2:3' : '16:9',
      });
      setConceptPreview(preview);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Concept plate preview failed');
    } finally {
      setConceptLoading(false);
    }
  };

  const handleSaveReviewedConcept = async () => {
    if (!conceptPreview) return;
    setUploading(true);
    try {
      await createVisualAsset({
        projectId: project.id,
        entityId: entity.id,
        entityType: entity.category,
        entityName: entity.name,
        assetCategory: defaultCategory,
        subRole: availableRoles[0] || 'Main Visual',
        fileName: `${entity.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Concept_Plate.svg`,
        mimeType: conceptPreview.mimeType,
        fileSize: conceptPreview.fileSize,
        width: conceptPreview.width,
        height: conceptPreview.height,
        storagePath: conceptPreview.storagePath,
        publicUrl: conceptPreview.publicUrl,
        description: generatedPrompt?.mainPrompt.slice(0, 500) || `Concept plate for ${entity.name}`,
        isPrimary: entityAssets.length === 0,
      });
      setConceptPreview(null);
      setShowPromptAssistant(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save concept plate');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-stone-900/70 border border-stone-800/90 rounded-lg p-4 space-y-4">
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleReplaceFile}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-200">
            Visual Profile & Reference Gallery ({entityAssets.length})
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPromptAssistant(!showPromptAssistant);
              if (!generatedPrompt && !promptLoading) {
                handleGeneratePrompt();
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Visual Prompt
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole(availableRoles[0] || 'Main Visual');
              setMakePrimary(entityAssets.length === 0);
              setShowUploadPanel(!showUploadPanel);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Image
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded bg-red-950/60 border border-red-800/70 text-xs text-red-200 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Panel */}
      {showUploadPanel && (
        <div className="p-3.5 rounded-lg bg-stone-950/90 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
              Attach New Visual to {entity.name}
            </span>
            <button
              type="button"
              onClick={() => setShowUploadPanel(false)}
              className="text-stone-400 hover:text-stone-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-stone-400 mb-1">Visual Reference Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-xs text-stone-100"
              >
                {availableRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-stone-400 mb-1">Asset Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as AssetCategory)}
                className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-xs text-stone-100"
              >
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-stone-400 mb-1">
              Visual Description / Art Notes
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`e.g. ${selectedRole} showing attire, scars, or architectural details...`}
              className="w-full bg-stone-900 border border-stone-700 rounded px-2.5 py-1.5 text-xs text-stone-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={makePrimary}
                onChange={(e) => setMakePrimary(e.target.checked)}
                className="rounded border-stone-700 bg-stone-900 text-amber-500"
              />
              Set as Main Portrait / Primary Image
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs cursor-pointer transition-colors">
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading ({uploadProgress}%)...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Choose Image (JPG, PNG, WebP, SVG)
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* AI Image Prompt Assistant Panel */}
      {showPromptAssistant && (
        <div className="p-3.5 rounded-lg bg-stone-950/90 border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                AI Visual Prompt Assistant — {entity.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPromptAssistant(false)}
              className="text-stone-400 hover:text-stone-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {promptLoading ? (
            <div className="py-6 flex items-center justify-center gap-2 text-xs text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              Synthesizing visual art direction from {entity.name}&apos;s canonical attributes...
            </div>
          ) : generatedPrompt ? (
            <div className="space-y-2.5 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-stone-400">
                    Editable Main Visual Prompt
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGeneratePrompt}
                      className="text-[11px] text-stone-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedPrompt.mainPrompt);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 1800);
                      }}
                      className="text-[11px] text-amber-300 hover:text-amber-200 flex items-center gap-1"
                    >
                      {copiedPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={generatedPrompt.mainPrompt}
                  onChange={(e) =>
                    setGeneratedPrompt({ ...generatedPrompt, mainPrompt: e.target.value })
                  }
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-stone-100 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-stone-900/70 border border-stone-800">
                  <span className="text-stone-400 block font-medium">Lighting & Palette:</span>
                  <span className="text-stone-300">{generatedPrompt.lightingAndPalette}</span>
                </div>
                <div className="p-2 rounded bg-stone-900/70 border border-stone-800">
                  <span className="text-stone-400 block font-medium">Art Direction & Framing:</span>
                  <span className="text-stone-300">{generatedPrompt.artDirectionNotes}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-stone-400">
                  Use this prompt in your external art workflow or preview an Editorial Concept Plate:
                </span>
                <button
                  type="button"
                  onClick={handleGenerateConceptPreview}
                  disabled={conceptLoading}
                  className="px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-medium text-xs flex items-center gap-1.5"
                >
                  {conceptLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                  Preview Concept Plate (.SVG)
                </button>
              </div>

              {conceptPreview && (
                <div className="mt-2 p-3 rounded bg-stone-900 border border-amber-500/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300">
                      Review Concept Plate Before Saving
                    </span>
                    <button
                      type="button"
                      onClick={() => setConceptPreview(null)}
                      className="text-stone-400 hover:text-stone-200 text-xs"
                    >
                      Discard
                    </button>
                  </div>
                  {conceptPreview.notice && (
                    <p className="text-[11px] text-stone-400">{conceptPreview.notice}</p>
                  )}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <img
                      src={conceptPreview.publicUrl}
                      alt={entity.name}
                      className="w-28 h-36 object-cover rounded border border-stone-700 bg-stone-950"
                    />
                    <div className="space-y-2 flex-1">
                      <p className="text-xs text-stone-300">
                        Approve this vector concept plate to attach it to <strong>{entity.name}</strong>, or upload your own high-resolution PNG/JPG/WebP illustration at any time.
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveReviewedConcept}
                        disabled={uploading}
                        className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
                      >
                        Save to {entity.name} Gallery
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Main Portrait + Gallery Grid */}
      {entityAssets.length === 0 ? (
        <div className="py-6 text-center border border-dashed border-stone-800 rounded-lg">
          <ImageIcon className="w-7 h-7 text-stone-600 mx-auto mb-1.5" />
          <p className="text-xs text-stone-400">
            No visual references attached to <strong>{entity.name}</strong> yet.
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Upload a main portrait, full-body illustration, emblem, or reference sheet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Primary Visual Showcase */}
          {primaryAsset && (
            <div className="md:col-span-5 bg-stone-950/80 border border-amber-500/30 rounded-lg overflow-hidden flex flex-col">
              <div className="relative group aspect-[3/4] max-h-72 w-full bg-stone-950 flex items-center justify-center overflow-hidden">
                <img
                  src={primaryAsset.publicUrl}
                  alt={primaryAsset.fileName}
                  className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                  onClick={() => setLightboxAsset(primaryAsset)}
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-stone-950/90 border border-amber-500/50 text-[10px] font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {primaryAsset.subRole || 'Main Visual'}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxAsset(primaryAsset)}
                  className="absolute bottom-2 right-2 p-1.5 rounded bg-stone-950/80 text-stone-200 hover:text-amber-300 border border-stone-700"
                  title="Full-screen preview"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-stone-200 truncate">
                    {primaryAsset.fileName}
                  </div>
                  <p className="text-[11px] text-stone-400 line-clamp-2 mt-0.5">
                    {primaryAsset.description || 'Primary canonical illustration.'}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-stone-800/80 text-[11px]">
                  <span className="text-stone-500">
                    {primaryAsset.width}×{primaryAsset.height} · {formatBytes(primaryAsset.fileSize)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingAsset(primaryAsset);
                        replaceInputRef.current?.click();
                      }}
                      className="text-stone-400 hover:text-amber-300"
                      title="Replace image file"
                    >
                      Replace
                    </button>
                    <span className="text-stone-700">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAsset(primaryAsset);
                        setEditDesc(primaryAsset.description);
                        setEditRole(primaryAsset.subRole);
                      }}
                      className="text-stone-400 hover:text-stone-200"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Secondary Gallery Grid */}
          <div className="md:col-span-7 space-y-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
              All Attached Visuals & Reference Sheets ({entityAssets.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {entityAssets.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border overflow-hidden bg-stone-950/70 flex flex-col ${
                    item.isPrimary ? 'border-amber-500/50' : 'border-stone-800'
                  }`}
                >
                  <div className="relative h-28 bg-stone-950 overflow-hidden group">
                    <img
                      src={item.publicUrl}
                      alt={item.fileName}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightboxAsset(item)}
                    />
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-stone-950/85 text-[9px] text-stone-200 border border-stone-700/80 truncate max-w-[90%]">
                      {item.subRole}
                    </span>
                  </div>
                  <div className="p-2 space-y-1 flex-1 flex flex-col justify-between">
                    <p className="text-[10px] text-stone-300 line-clamp-2">
                      {item.description || item.fileName}
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-stone-800/70 text-[10px]">
                      {!item.isPrimary ? (
                        <button
                          type="button"
                          onClick={() => setPrimaryVisualAsset(project.id, item)}
                          className="text-amber-400 hover:text-amber-300 font-medium"
                        >
                          Set Main
                        </button>
                      ) : (
                        <span className="text-amber-400 font-semibold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-400" /> Main
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAsset(item);
                            setEditDesc(item.description);
                            setEditRole(item.subRole);
                          }}
                          className="text-stone-400 hover:text-stone-200"
                          title="Edit role & description"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {confirmDeleteId === item.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteVisualAsset(item);
                              setConfirmDeleteId(null);
                            }}
                            className="text-red-400 font-semibold"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-stone-500 hover:text-red-400"
                            title="Delete image"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Asset Metadata Modal */}
      {editingAsset && (
        <div className="p-3 rounded bg-stone-950 border border-stone-700 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-200">
              Edit Visual Details — {editingAsset.fileName}
            </span>
            <button
              type="button"
              onClick={() => setEditingAsset(null)}
              className="text-stone-400 hover:text-stone-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-stone-400 mb-1">Reference Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100"
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-stone-400 mb-1">Description</label>
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                await updateVisualAsset(editingAsset.id, {
                  subRole: editRole,
                  description: editDesc,
                });
                setEditingAsset(null);
              }}
              className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Custom Visual Notes (For Characters & Entities) */}
      {onSaveCustomVisualNotes && (
        <div className="pt-2 border-t border-stone-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-stone-400">
              Custom Visual & Art Direction Notes (Scars, Posture, Color Palette, Heraldry)
            </label>
            <button
              type="button"
              disabled={savingNotes || notesDraft === customVisualNotes}
              onClick={async () => {
                setSavingNotes(true);
                try {
                  await onSaveCustomVisualNotes(notesDraft);
                } finally {
                  setSavingNotes(false);
                }
              }}
              className="text-[11px] px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-amber-300"
            >
              {savingNotes ? 'Saving...' : 'Save Visual Notes'}
            </button>
          </div>
          <textarea
            rows={2}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Record recurring visual motifs, color palette swatches, wardrobe notes, or artist references..."
            className="w-full bg-stone-950/70 border border-stone-800 rounded px-2.5 py-1.5 text-xs text-stone-200"
          />
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxAsset(null)}
        >
          <div
            className="max-w-3xl w-full bg-stone-950 border border-stone-800 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
              <div>
                <h4 className="text-sm font-semibold text-stone-100">
                  {lightboxAsset.fileName}{' '}
                  <span className="text-amber-400 text-xs font-normal">
                    ({lightboxAsset.subRole})
                  </span>
                </h4>
                <p className="text-xs text-stone-400">{lightboxAsset.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxAsset(null)}
                className="p-1 text-stone-400 hover:text-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-stone-900/60 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={lightboxAsset.publicUrl}
                alt={lightboxAsset.fileName}
                className="max-h-[68vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
