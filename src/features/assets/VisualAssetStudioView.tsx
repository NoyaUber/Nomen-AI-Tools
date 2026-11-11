import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Compass,
  Copy,
  Edit3,
  Eye,
  Filter,
  Grid,
  Image as ImageIcon,
  Layers,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ASSET_CATEGORIES,
  AssetCategory,
  MapMarkerPin,
  Project,
  VisualAsset,
  WORLD_MAP_ROLES,
  WorldEntity,
} from '../../types/nomen';
import {
  createVisualAsset,
  deleteVisualAsset,
  setPrimaryVisualAsset,
  updateVisualAsset,
} from '../../lib/db/firestore-service';
import {
  generateImagePromptApi,
  generateVisualConceptApi,
  uploadVisualAssetFileApi,
} from '../../lib/ai/client';
import { auth } from '../../lib/firebase';

interface VisualAssetStudioViewProps {
  project: Project;
  entities: WorldEntity[];
  visualAssets: VisualAsset[];
}

type StudioTab = 'library' | 'maps' | 'covers' | 'prompt_studio';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function readImageFileMetadata(file: File): Promise<{
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
      img.onload = () =>
        resolve({
          dataUrl,
          width: img.naturalWidth || 900,
          height: img.naturalHeight || 900,
        });
      img.onerror = () => resolve({ dataUrl, width: 900, height: 900 });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function parseMapPins(metadataJson?: string): MapMarkerPin[] {
  if (!metadataJson) return [];
  try {
    const parsed = JSON.parse(metadataJson);
    return Array.isArray(parsed?.pins) ? parsed.pins : [];
  } catch {
    return [];
  }
}

interface CoverMetadata {
  coverTitle: string;
  coverSubtitle: string;
  authorName: string;
  showTypographyOverlay: boolean;
}

function parseCoverMetadata(
  metadataJson: string | undefined,
  fallbackTitle: string,
  fallbackSubtitle: string
): CoverMetadata {
  if (metadataJson) {
    try {
      const parsed = JSON.parse(metadataJson);
      return {
        coverTitle: parsed.coverTitle ?? fallbackTitle,
        coverSubtitle: parsed.coverSubtitle ?? fallbackSubtitle,
        authorName:
          parsed.authorName ||
          auth.currentUser?.displayName ||
          'NOMEN Archivist',
        showTypographyOverlay: Boolean(parsed.showTypographyOverlay ?? true),
      };
    } catch {
      // ignore parse error
    }
  }
  return {
    coverTitle: fallbackTitle,
    coverSubtitle: fallbackSubtitle,
    authorName: auth.currentUser?.displayName || 'NOMEN Archivist',
    showTypographyOverlay: true,
  };
}

export const VisualAssetStudioView: React.FC<VisualAssetStudioViewProps> = ({
  project,
  entities,
  visualAssets,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('library');

  // Library Filter & View State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | 'all'>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'primary'>('newest');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>('character_portrait');
  const [uploadRole, setUploadRole] = useState('Main Portrait');
  const [uploadEntityId, setUploadEntityId] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadIsPrimary, setUploadIsPrimary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Replace File State
  const [replacingAsset, setReplacingAsset] = useState<VisualAsset | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Asset Modal State
  const [editingAsset, setEditingAsset] = useState<VisualAsset | null>(null);
  const [editFileName, setEditFileName] = useState('');
  const [editCategory, setEditCategory] = useState<AssetCategory>('general_reference');
  const [editRole, setEditRole] = useState('');
  const [editEntityId, setEditEntityId] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Delete Confirmation & Lightbox
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightboxAsset, setLightboxAsset] = useState<VisualAsset | null>(null);

  // ============================================================================
  // TAB 2: WORLD MAP STUDIO STATE
  // ============================================================================
  const mapAssets = useMemo(
    () => visualAssets.filter((a) => a.assetCategory === 'world_map'),
    [visualAssets]
  );
  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const activeMap = useMemo(
    () => mapAssets.find((m) => m.id === selectedMapId) || mapAssets[0] || null,
    [mapAssets, selectedMapId]
  );
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [mapPan, setMapPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isAddingPinMode, setIsAddingPinMode] = useState(false);
  const [pendingPinCoords, setPendingPinCoords] = useState<{
    xPercent: number;
    yPercent: number;
  } | null>(null);
  const [pinLocationId, setPinLocationId] = useState('');
  const [pinNote, setPinNote] = useState('');
  const [selectedPin, setSelectedPin] = useState<MapMarkerPin | null>(null);
  const [mapUploadRole, setMapUploadRole] = useState<string>(WORLD_MAP_ROLES[0]);
  const [mapUploadLocationId, setMapUploadLocationId] = useState<string>('');
  const [mapUploadDesc, setMapUploadDesc] = useState<string>('');

  const locationEntities = useMemo(
    () => entities.filter((e) => e.category === 'location'),
    [entities]
  );

  // ============================================================================
  // TAB 3: NOVEL COVER STUDIO STATE
  // ============================================================================
  const coverAssets = useMemo(
    () => visualAssets.filter((a) => a.assetCategory === 'novel_cover'),
    [visualAssets]
  );
  const [selectedCoverId, setSelectedCoverId] = useState<string>('');
  const activeCover = useMemo(
    () =>
      coverAssets.find((c) => c.id === selectedCoverId) ||
      coverAssets.find((c) => c.isPrimary) ||
      coverAssets[0] ||
      null,
    [coverAssets, selectedCoverId]
  );

  const activeCoverMeta = useMemo(
    () =>
      parseCoverMetadata(
        activeCover?.metadataJson,
        project.title.split(':')[0] || project.title,
        project.title.includes(':')
          ? project.title.split(':').slice(1).join(':').trim()
          : project.genre
      ),
    [activeCover, project.title, project.genre]
  );

  const [coverTitleDraft, setCoverTitleDraft] = useState('');
  const [coverSubtitleDraft, setCoverSubtitleDraft] = useState('');
  const [coverAuthorDraft, setCoverAuthorDraft] = useState('');
  const [coverOverlayDraft, setCoverOverlayDraft] = useState(true);
  const [coverDescDraft, setCoverDescDraft] = useState('');
  const [coverMetaInitializedId, setCoverMetaInitializedId] = useState<string>('');

  if (activeCover && coverMetaInitializedId !== activeCover.id) {
    setCoverMetaInitializedId(activeCover.id);
    setCoverTitleDraft(activeCoverMeta.coverTitle);
    setCoverSubtitleDraft(activeCoverMeta.coverSubtitle);
    setCoverAuthorDraft(activeCoverMeta.authorName);
    setCoverOverlayDraft(activeCoverMeta.showTypographyOverlay);
    setCoverDescDraft(activeCover.description || '');
  }

  // ============================================================================
  // TAB 4: AI IMAGE PROMPT STUDIO STATE
  // ============================================================================
  const [promptSourceEntityId, setPromptSourceEntityId] = useState<string>('');
  const [promptCategory, setPromptCategory] = useState<AssetCategory>('character_portrait');
  const [promptCustomSubject, setPromptCustomSubject] = useState('');
  const [promptArtStyle, setPromptArtStyle] = useState(
    'Dark Editorial Fantasy painterly concept art, intricate brushwork, museum-grade detail'
  );
  const [promptLighting, setPromptLighting] = useState(
    'Chiaroscuro candlelit gold and deep obsidian shadows'
  );
  const [promptAspectRatio, setPromptAspectRatio] = useState('2:3');
  const [promptGenerating, setPromptGenerating] = useState(false);
  const [synthesizedPrompt, setSynthesizedPrompt] = useState<{
    mainPrompt: string;
    negativePrompt: string;
    artDirectionNotes: string;
    lightingAndPalette: string;
    compositionNotes: string;
    modelUsed: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [conceptGenerating, setConceptGenerating] = useState(false);
  const [reviewedConcept, setReviewedConcept] = useState<{
    storagePath: string;
    publicUrl: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    notice?: string;
  } | null>(null);

  // Filtered & Sorted Assets for Library Tab
  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = visualAssets.filter((asset) => {
      if (categoryFilter !== 'all' && asset.assetCategory !== categoryFilter) return false;
      if (entityFilter !== 'all') {
        if (entityFilter === '__unassigned__') {
          if (asset.entityId) return false;
        } else if (asset.entityId !== entityFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${asset.fileName} ${asset.description} ${asset.entityName} ${asset.subRole} ${asset.assetCategory}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'primary') {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      }
      if (sortBy === 'name') {
        return a.fileName.localeCompare(b.fileName);
      }
      const ta = typeof a.createdAt === 'string' ? Date.parse(a.createdAt) || 0 : 0;
      const tb = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) || 0 : 0;
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });
  }, [visualAssets, categoryFilter, entityFilter, searchQuery, sortBy]);

  // Handlers
  const handleStandardUpload = async (
    file: File,
    opts: {
      category: AssetCategory;
      subRole: string;
      entityId: string;
      description: string;
      isPrimary: boolean;
      metadataJson?: string;
    }
  ) => {
    setStatusError(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setStatusError('Unsupported file format. Please upload JPEG, PNG, WebP, or SVG.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setStatusError('Image exceeds the 6 MB maximum upload size.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setStatusError('You must be signed in to upload visual assets.');
      return;
    }

    setUploading(true);
    setUploadProgress(25);
    try {
      const { dataUrl, width, height } = await readImageFileMetadata(file);
      setUploadProgress(60);

      const uploaded = await uploadVisualAssetFileApi({
        ownerId: uid,
        projectId: project.id,
        fileName: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/svg+xml',
        base64Data: dataUrl,
      });
      setUploadProgress(85);

      const linkedEntity = entities.find((e) => e.id === opts.entityId);

      const newId = await createVisualAsset({
        projectId: project.id,
        entityId: linkedEntity ? linkedEntity.id : '',
        entityType: linkedEntity ? linkedEntity.category : opts.category === 'novel_cover' ? 'project' : '',
        entityName: linkedEntity ? linkedEntity.name : opts.category === 'novel_cover' ? project.title : '',
        assetCategory: opts.category,
        subRole: opts.subRole,
        fileName: file.name,
        mimeType: uploaded.mimeType,
        fileSize: uploaded.fileSize,
        width,
        height,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        description: opts.description || `${opts.subRole} (${file.name})`,
        metadataJson: opts.metadataJson || '',
        isPrimary: opts.isPrimary,
      });

      setUploadProgress(100);
      setShowUploadModal(false);
      setUploadDescription('');
      if (opts.category === 'world_map') setSelectedMapId(newId);
      if (opts.category === 'novel_cover') setSelectedCoverId(newId);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 400);
    }
  };

  const handleReplaceAssetFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingAsset) return;
    setStatusError(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      setStatusError('Unsupported file format. Please upload JPEG, PNG, WebP, or SVG.');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setUploading(true);
    try {
      const { dataUrl, width, height } = await readImageFileMetadata(file);
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
      setStatusError(err instanceof Error ? err.message : 'Failed to replace image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleMapCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingPinMode || !activeMap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = Math.max(2, Math.min(98, Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(1))));
    const yPercent = Math.max(2, Math.min(98, Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(1))));
    setPendingPinCoords({ xPercent, yPercent });
    if (!pinLocationId && locationEntities[0]) {
      setPinLocationId(locationEntities[0].id);
    }
  };

  const handleSaveMapPin = async () => {
    if (!activeMap || !pendingPinCoords || !pinLocationId) return;
    const loc = locationEntities.find((l) => l.id === pinLocationId);
    if (!loc) return;

    const existingPins = parseMapPins(activeMap.metadataJson);
    const newPin: MapMarkerPin = {
      id: `pin_${Date.now()}`,
      locationEntityId: loc.id,
      locationName: loc.name,
      xPercent: pendingPinCoords.xPercent,
      yPercent: pendingPinCoords.yPercent,
      note: pinNote.trim() || loc.subtitle || loc.subCategory,
    };

    const nextPins = [...existingPins, newPin];
    await updateVisualAsset(activeMap.id, {
      metadataJson: JSON.stringify({ pins: nextPins }),
    });
    setPendingPinCoords(null);
    setPinNote('');
    setIsAddingPinMode(false);
    setSelectedPin(newPin);
  };

  const handleRemoveMapPin = async (pinId: string) => {
    if (!activeMap) return;
    const existingPins = parseMapPins(activeMap.metadataJson);
    const nextPins = existingPins.filter((p) => p.id !== pinId);
    await updateVisualAsset(activeMap.id, {
      metadataJson: JSON.stringify({ pins: nextPins }),
    });
    if (selectedPin?.id === pinId) setSelectedPin(null);
  };

  const handleSaveCoverMetadata = async () => {
    if (!activeCover) return;
    setUploading(true);
    try {
      await updateVisualAsset(activeCover.id, {
        description: coverDescDraft,
        metadataJson: JSON.stringify({
          coverTitle: coverTitleDraft,
          coverSubtitle: coverSubtitleDraft,
          authorName: coverAuthorDraft,
          showTypographyOverlay: coverOverlayDraft,
        }),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRunPromptSynthesizer = async () => {
    setPromptGenerating(true);
    setStatusError(null);
    try {
      const linkedEntity = entities.find((e) => e.id === promptSourceEntityId);
      const subjectName = linkedEntity
        ? linkedEntity.name
        : promptCustomSubject.trim() || project.title;

      const attrs: Record<string, string> = linkedEntity
        ? {
            subtitle: linkedEntity.subtitle,
            summary: linkedEntity.summary,
            subCategory: linkedEntity.subCategory,
            ...linkedEntity.attributes,
          }
        : {
            customConcept: promptCustomSubject.trim() || project.description,
          };

      const res = await generateImagePromptApi({
        assetCategory: promptCategory,
        entityName: subjectName,
        entityType: linkedEntity ? `${linkedEntity.category} (${linkedEntity.subCategory})` : promptCategory,
        attributes: attrs,
        artStyle: promptArtStyle,
        lightingMood: promptLighting,
        aspectRatio: promptAspectRatio,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      setSynthesizedPrompt(res);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Failed to synthesize image prompt');
    } finally {
      setPromptGenerating(false);
    }
  };

  const handlePreviewConceptFromStudio = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !synthesizedPrompt) return;
    setConceptGenerating(true);
    setStatusError(null);
    try {
      const linkedEntity = entities.find((e) => e.id === promptSourceEntityId);
      const subjectName = linkedEntity
        ? linkedEntity.name
        : promptCustomSubject.trim() || project.title;

      const preview = await generateVisualConceptApi({
        ownerId: uid,
        projectId: project.id,
        prompt: synthesizedPrompt.mainPrompt,
        assetCategory: promptCategory,
        entityName: subjectName,
        aspectRatio: promptAspectRatio,
      });
      setReviewedConcept(preview);
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Concept plate preview failed');
    } finally {
      setConceptGenerating(false);
    }
  };

  const handleSaveReviewedConceptToLibrary = async () => {
    if (!reviewedConcept) return;
    const linkedEntity = entities.find((e) => e.id === promptSourceEntityId);
    const subjectName = linkedEntity
      ? linkedEntity.name
      : promptCustomSubject.trim() || project.title;

    setUploading(true);
    try {
      await createVisualAsset({
        projectId: project.id,
        entityId: linkedEntity ? linkedEntity.id : '',
        entityType: linkedEntity ? linkedEntity.category : '',
        entityName: linkedEntity ? linkedEntity.name : '',
        assetCategory: promptCategory,
        subRole: 'Concept Art Plate',
        fileName: `${subjectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Concept.svg`,
        mimeType: reviewedConcept.mimeType,
        fileSize: reviewedConcept.fileSize,
        width: reviewedConcept.width,
        height: reviewedConcept.height,
        storagePath: reviewedConcept.storagePath,
        publicUrl: reviewedConcept.publicUrl,
        description: synthesizedPrompt?.mainPrompt.slice(0, 600) || `Concept plate for ${subjectName}`,
        isPrimary: false,
      });
      setReviewedConcept(null);
      setActiveTab('library');
    } finally {
      setUploading(false);
    }
  };

  const activeMapPins = useMemo(() => parseMapPins(activeMap?.metadataJson), [activeMap]);

  return (
    <div className="space-y-6">
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleReplaceAssetFile}
      />

      {/* Studio Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-stone-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/90 mb-1">
            <ImageIcon className="w-3.5 h-3.5" />
            Phase 11 · Visual Worldbuilding & Image Management
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-100">
            Visual Asset Studio
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Centralized gallery for character portraits, location illustrations, organization crests, artifacts, interactive world maps, and novel covers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs transition-colors shadow-lg shadow-amber-950/30"
          >
            <Upload className="w-4 h-4" />
            Upload Visual Asset
          </button>
        </div>
      </div>

      {/* Category Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Total Visual Assets</div>
          <div className="text-xl font-bold text-stone-100 mt-0.5">{visualAssets.length}</div>
        </div>
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Character Visuals</div>
          <div className="text-xl font-bold text-amber-400 mt-0.5">
            {
              visualAssets.filter(
                (a) =>
                  a.assetCategory === 'character_portrait' ||
                  a.assetCategory === 'character_illustration'
              ).length
            }
          </div>
        </div>
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Locations & Realms</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">
            {
              visualAssets.filter(
                (a) =>
                  a.assetCategory === 'location_illustration' ||
                  a.assetCategory === 'kingdom_civilization'
              ).length
            }
          </div>
        </div>
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Emblems & Relics</div>
          <div className="text-xl font-bold text-purple-400 mt-0.5">
            {
              visualAssets.filter(
                (a) =>
                  a.assetCategory === 'organization_emblem' ||
                  a.assetCategory === 'weapon_artifact' ||
                  a.assetCategory === 'armor_equipment'
              ).length
            }
          </div>
        </div>
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Interactive Maps</div>
          <div className="text-xl font-bold text-sky-400 mt-0.5">{mapAssets.length}</div>
        </div>
        <div className="p-3 rounded-lg bg-stone-900/70 border border-stone-800">
          <div className="text-[11px] text-stone-400">Novel Covers</div>
          <div className="text-xl font-bold text-rose-400 mt-0.5">{coverAssets.length}</div>
        </div>
      </div>

      {/* Studio Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'library'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/50 border border-stone-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Central Asset Library ({visualAssets.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('maps')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'maps'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/50 border border-stone-800'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          World Map Studio ({mapAssets.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('covers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'covers'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/50 border border-stone-800'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Novel Cover Studio ({coverAssets.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('prompt_studio')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'prompt_studio'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
              : 'text-stone-400 hover:text-stone-200 bg-stone-900/50 border border-stone-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Image Prompt Assistant
        </button>
      </div>

      {statusError && (
        <div className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-xs text-red-200 flex items-center justify-between">
          <span>{statusError}</span>
          <button
            type="button"
            onClick={() => setStatusError(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: CENTRALIZED ASSET LIBRARY                                     */}
      {/* ==================================================================== */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="p-4 rounded-xl bg-stone-900/70 border border-stone-800 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename, description, role, or entity..."
                className="w-full bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 py-2 text-xs text-stone-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-stone-500" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as AssetCategory | 'all')}
                className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200"
              >
                <option value="all">All 12 Categories</option>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 max-w-[210px]"
            >
              <option value="all">All Associated Entities</option>
              <option value="__unassigned__">Project-Wide / Unassigned</option>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name} ({ent.subCategory})
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200"
            >
              <option value="newest">Newest Upload First</option>
              <option value="oldest">Oldest Upload First</option>
              <option value="primary">Main / Primary First</option>
              <option value="name">Alphabetical (A–Z)</option>
            </select>

            <div className="flex items-center rounded-lg border border-stone-800 bg-stone-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${
                  viewMode === 'grid' ? 'bg-amber-500/20 text-amber-300' : 'text-stone-400'
                }`}
                title="Grid View"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${
                  viewMode === 'list' ? 'bg-amber-500/20 text-amber-300' : 'text-stone-400'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredAssets.length === 0 ? (
            <div className="py-16 text-center bg-stone-900/40 border border-dashed border-stone-800 rounded-xl space-y-3">
              <ImageIcon className="w-10 h-10 text-stone-600 mx-auto" />
              <div>
                <h3 className="text-sm font-semibold text-stone-200">
                  No visual assets match your current filter
                </h3>
                <p className="text-xs text-stone-400 mt-1">
                  Upload portraits, location art, organization emblems, artifacts, or world maps to populate your studio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload First Visual Asset
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAssets.map((asset) => {
                const catMeta = ASSET_CATEGORIES.find((c) => c.id === asset.assetCategory);
                return (
                  <div
                    key={asset.id}
                    className={`rounded-xl bg-stone-900/80 border overflow-hidden flex flex-col transition-all ${
                      asset.isPrimary
                        ? 'border-amber-500/50 shadow-md shadow-amber-950/20'
                        : 'border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    <div className="relative h-52 bg-stone-950 overflow-hidden group">
                      <img
                        src={asset.publicUrl}
                        alt={asset.fileName}
                        className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                        onClick={() => setLightboxAsset(asset)}
                      />
                      <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 rounded bg-stone-950/90 border border-stone-700 text-[10px] font-medium text-stone-200">
                          {catMeta?.label || asset.assetCategory}
                        </span>
                        {asset.isPrimary && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/90 text-stone-950 text-[10px] font-bold flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-stone-950" /> Primary
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightboxAsset(asset)}
                        className="absolute bottom-2 right-2 p-1.5 rounded bg-stone-950/85 border border-stone-700 text-stone-200 hover:text-amber-300"
                        title="Preview Full Size"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-100 truncate">
                            {asset.fileName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-amber-300 shrink-0">
                            {asset.subRole}
                          </span>
                        </div>
                        {asset.entityName && (
                          <div className="text-[11px] text-amber-400/90 font-medium truncate">
                            Linked Entity: {asset.entityName}
                          </div>
                        )}
                        <p className="text-xs text-stone-400 line-clamp-2">
                          {asset.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-stone-500">
                          {asset.width}×{asset.height} · {formatBytes(asset.fileSize)}
                        </span>
                        <div className="flex items-center gap-2">
                          {!asset.isPrimary && asset.entityId && (
                            <button
                              type="button"
                              onClick={() => setPrimaryVisualAsset(project.id, asset)}
                              className="text-amber-400 hover:text-amber-300 font-medium"
                              title="Set as Primary Image for this entity"
                            >
                              Set Main
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setReplacingAsset(asset);
                              replaceFileInputRef.current?.click();
                            }}
                            className="text-stone-400 hover:text-amber-300"
                            title="Replace image file"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAsset(asset);
                              setEditFileName(asset.fileName);
                              setEditCategory(asset.assetCategory);
                              setEditRole(asset.subRole);
                              setEditEntityId(asset.entityId);
                              setEditDescription(asset.description);
                            }}
                            className="text-stone-400 hover:text-stone-200"
                            title="Edit asset details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteId === asset.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteVisualAsset(asset);
                                setConfirmDeleteId(null);
                              }}
                              className="text-red-400 font-bold"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(asset.id)}
                              className="text-stone-500 hover:text-red-400"
                              title="Delete asset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="rounded-xl border border-stone-800 bg-stone-900/70 overflow-hidden divide-y divide-stone-800">
              {filteredAssets.map((asset) => {
                const catMeta = ASSET_CATEGORIES.find((c) => c.id === asset.assetCategory);
                return (
                  <div
                    key={asset.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-900"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={asset.publicUrl}
                        alt={asset.fileName}
                        onClick={() => setLightboxAsset(asset)}
                        className="w-16 h-16 rounded-lg object-cover bg-stone-950 border border-stone-700 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-stone-100 truncate">
                            {asset.fileName}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-stone-800 text-[10px] text-amber-300">
                            {catMeta?.label || asset.assetCategory}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-stone-950 border border-stone-800 text-[10px] text-stone-300">
                            {asset.subRole}
                          </span>
                          {asset.isPrimary && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] text-amber-300 font-semibold">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 line-clamp-1">
                          {asset.description || 'No description'}
                        </p>
                        <div className="text-[11px] text-stone-500 flex items-center gap-3">
                          {asset.entityName && (
                            <span className="text-amber-400/90">Entity: {asset.entityName}</span>
                          )}
                          <span>
                            {asset.width}×{asset.height}px
                          </span>
                          <span>{formatBytes(asset.fileSize)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setLightboxAsset(asset)}
                        className="px-2.5 py-1 rounded border border-stone-700 text-xs text-stone-300 hover:text-amber-300"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingAsset(asset);
                          replaceFileInputRef.current?.click();
                        }}
                        className="px-2.5 py-1 rounded border border-stone-700 text-xs text-stone-300 hover:text-amber-300"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAsset(asset);
                          setEditFileName(asset.fileName);
                          setEditCategory(asset.assetCategory);
                          setEditRole(asset.subRole);
                          setEditEntityId(asset.entityId);
                          setEditDescription(asset.description);
                        }}
                        className="px-2.5 py-1 rounded border border-stone-700 text-xs text-stone-300 hover:text-stone-100"
                      >
                        Edit
                      </button>
                      {confirmDeleteId === asset.id ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteVisualAsset(asset);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 rounded bg-red-600 text-white text-xs font-semibold"
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(asset.id)}
                          className="p-1.5 rounded border border-stone-800 text-stone-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: WORLD MAP STUDIO (Zoom, Pan & Location Markers)               */}
      {/* ==================================================================== */}
      {activeTab === 'maps' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Map Selector & Upload + Marker List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Compass className="w-4 h-4" />
                  Cartographic Archives ({mapAssets.length})
                </h3>
              </div>

              {mapAssets.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {mapAssets.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedMapId(m.id);
                        setMapZoom(1);
                        setMapPan({ x: 0, y: 0 });
                        setSelectedPin(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg border flex items-center gap-3 transition-colors ${
                        activeMap?.id === m.id
                          ? 'bg-amber-500/15 border-amber-500/50 text-stone-100'
                          : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <img
                        src={m.publicUrl}
                        alt={m.fileName}
                        className="w-12 h-10 object-cover rounded border border-stone-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{m.fileName}</div>
                        <div className="text-[10px] text-amber-400">
                          {m.subRole} {m.entityName ? `· ${m.entityName}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Map Upload */}
              <div className="pt-3 border-t border-stone-800 space-y-2.5">
                <div className="text-[11px] font-semibold text-stone-300">
                  Upload New World / Regional Map
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={mapUploadRole}
                    onChange={(e) => setMapUploadRole(e.target.value)}
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200"
                  >
                    {WORLD_MAP_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mapUploadLocationId}
                    onChange={(e) => setMapUploadLocationId(e.target.value)}
                    className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200"
                  >
                    <option value="">Entire World</option>
                    {locationEntities.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.subCategory})
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={mapUploadDesc}
                  onChange={(e) => setMapUploadDesc(e.target.value)}
                  placeholder="Map description, cartographer notes, or scale..."
                  className="w-full bg-stone-950 border border-stone-800 rounded px-2.5 py-1.5 text-xs text-stone-200"
                />
                <label className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs cursor-pointer transition-colors">
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading Map ({uploadProgress}%)...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Select Map Image (JPG, PNG, WebP, SVG)
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleStandardUpload(f, {
                          category: 'world_map',
                          subRole: mapUploadRole,
                          entityId: mapUploadLocationId,
                          description: mapUploadDesc || `${mapUploadRole} of ${project.title}`,
                          isPrimary: mapAssets.length === 0,
                        });
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Interactive Location Markers Panel */}
            {activeMap && (
              <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-200 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    Location Markers ({activeMapPins.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingPinMode(!isAddingPinMode);
                      setPendingPinCoords(null);
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                      isAddingPinMode
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-amber-300 hover:bg-stone-700'
                    }`}
                  >
                    <Plus className="w-3 h-3" />
                    {isAddingPinMode ? 'Click Map to Place Pin' : 'Add Location Pin'}
                  </button>
                </div>

                {pendingPinCoords && (
                  <div className="p-3 rounded-lg bg-stone-950 border border-amber-500/40 space-y-2">
                    <div className="text-[11px] font-semibold text-amber-300">
                      New Pin at ({pendingPinCoords.xPercent}%, {pendingPinCoords.yPercent}%)
                    </div>
                    <select
                      value={pinLocationId}
                      onChange={(e) => setPinLocationId(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-xs text-stone-100"
                    >
                      <option value="">Select Location Entity...</option>
                      {locationEntities.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} ({loc.subCategory})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={pinNote}
                      onChange={(e) => setPinNote(e.target.value)}
                      placeholder="Optional cartographic note..."
                      className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-xs text-stone-100"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingPinCoords(null)}
                        className="px-2.5 py-1 rounded text-xs text-stone-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveMapPin}
                        disabled={!pinLocationId}
                        className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-stone-950 font-semibold text-xs"
                      >
                        Save Pin
                      </button>
                    </div>
                  </div>
                )}

                {activeMapPins.length === 0 ? (
                  <p className="text-xs text-stone-500">
                    No location markers placed on this map yet. Click &ldquo;Add Location Pin&rdquo; and click any point on the map canvas.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {activeMapPins.map((pin) => (
                      <div
                        key={pin.id}
                        onClick={() => setSelectedPin(pin)}
                        className={`p-2 rounded border text-xs flex items-center justify-between cursor-pointer ${
                          selectedPin?.id === pin.id
                            ? 'bg-amber-500/15 border-amber-500/50 text-stone-100'
                            : 'bg-stone-950/60 border-stone-800 text-stone-300 hover:border-stone-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-amber-300 truncate">
                            {pin.locationName}
                          </div>
                          <div className="text-[11px] text-stone-400 truncate">{pin.note}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMapPin(pin.id);
                          }}
                          className="text-stone-500 hover:text-red-400 p-1"
                          title="Remove marker"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Interactive Zoom & Pan Map Viewer */}
          <div className="lg:col-span-8">
            {!activeMap ? (
              <div className="h-96 rounded-xl bg-stone-900/40 border border-dashed border-stone-800 flex flex-col items-center justify-center p-6 text-center">
                <MapIcon className="w-12 h-12 text-stone-600 mb-2" />
                <h3 className="text-sm font-semibold text-stone-200">No World Maps Uploaded Yet</h3>
                <p className="text-xs text-stone-400 max-w-md mt-1">
                  Upload a world map, continent map, regional survey, or kingdom map on the left to inspect it with high-resolution zoom, pan, and location pins.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-stone-900/90 border border-stone-800 overflow-hidden flex flex-col">
                {/* Map Toolbar */}
                <div className="px-4 py-3 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2 bg-stone-950/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-stone-100">{activeMap.fileName}</h3>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                        {activeMap.subRole}
                      </span>
                    </div>
                    <p className="text-xs text-stone-400">{activeMap.description}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                      className="p-1.5 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono text-stone-300 px-2">
                      {Math.round(mapZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      className="p-1.5 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMapZoom(1);
                        setMapPan({ x: 0, y: 0 });
                      }}
                      className="px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-xs text-stone-300 hover:text-stone-100"
                    >
                      Reset View
                    </button>
                    <button
                      type="button"
                      onClick={() => setLightboxAsset(activeMap)}
                      className="p-1.5 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Interactive Viewport */}
                <div
                  className={`relative h-[500px] bg-stone-950 overflow-hidden select-none flex items-center justify-center ${
                    isAddingPinMode
                      ? 'cursor-crosshair'
                      : isDraggingMap
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                  }`}
                  onMouseDown={(e) => {
                    if (isAddingPinMode) return;
                    setIsDraggingMap(true);
                    setDragStart({ x: e.clientX - mapPan.x, y: e.clientY - mapPan.y });
                  }}
                  onMouseMove={(e) => {
                    if (!isDraggingMap) return;
                    setMapPan({
                      x: e.clientX - dragStart.x,
                      y: e.clientY - dragStart.y,
                    });
                  }}
                  onMouseUp={() => setIsDraggingMap(false)}
                  onMouseLeave={() => setIsDraggingMap(false)}
                >
                  <div
                    style={{
                      transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
                      transformOrigin: 'center center',
                    }}
                    className="relative inline-block transition-transform duration-75"
                    onClick={handleMapCanvasClick}
                  >
                    <img
                      src={activeMap.publicUrl}
                      alt={activeMap.fileName}
                      draggable={false}
                      className="max-h-[460px] w-auto object-contain rounded shadow-2xl"
                    />

                    {/* Map Marker Pins */}
                    {activeMapPins.map((pin) => (
                      <button
                        key={pin.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPin(pin);
                        }}
                        style={{
                          left: `${pin.xPercent}%`,
                          top: `${pin.yPercent}%`,
                        }}
                        className="absolute -translate-x-1/2 -translate-y-full group z-10"
                        title={`${pin.locationName}: ${pin.note}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="px-2 py-0.5 rounded bg-stone-950/90 border border-amber-500/70 text-[10px] font-semibold text-amber-300 whitespace-nowrap shadow-lg mb-0.5">
                            {pin.locationName}
                          </span>
                          <MapPin className="w-5 h-5 text-amber-400 fill-amber-500/40 drop-shadow" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Pin Details Footer */}
                {selectedPin && (
                  <div className="px-4 py-3 bg-stone-950 border-t border-stone-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-300">
                        📍 {selectedPin.locationName}
                      </span>
                      <span className="text-xs text-stone-400 ml-2">{selectedPin.note}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPin(null)}
                      className="text-xs text-stone-400 hover:text-stone-200"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: NOVEL COVER STUDIO (Portrait 2:3 Book Cover Preview)          */}
      {/* ==================================================================== */}
      {activeTab === 'covers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Live 2:3 Portrait Book Cover Preview */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full max-w-[340px] aspect-[2/3] rounded-xl overflow-hidden border-2 border-amber-500/40 bg-stone-950 shadow-2xl relative group">
              {activeCover ? (
                <>
                  <img
                    src={activeCover.publicUrl}
                    alt={activeCover.fileName}
                    className="w-full h-full object-cover"
                  />
                  {coverOverlayDraft && (
                    <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/85 flex flex-col justify-between p-6 text-center pointer-events-none">
                      <div className="space-y-1.5 pt-2">
                        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-300/90">
                          {project.genre}
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-stone-100 tracking-wide drop-shadow">
                          {coverTitleDraft || project.title}
                        </h2>
                        {coverSubtitleDraft && (
                          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/90">
                            {coverSubtitleDraft}
                          </p>
                        )}
                      </div>
                      <div className="pb-2">
                        <div className="w-12 h-px bg-amber-400/60 mx-auto mb-2" />
                        <div className="text-xs font-serif tracking-[0.25em] uppercase text-stone-200">
                          {coverAuthorDraft}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <BookOpen className="w-12 h-12 text-stone-700 mb-2" />
                  <p className="text-xs text-stone-400">
                    Upload a custom 2:3 novel cover artwork to preview your book edition.
                  </p>
                </div>
              )}
            </div>
            <span className="text-[11px] text-stone-500 mt-2">
              Standard 2:3 Portrait Book Cover Ratio Preview
            </span>
          </div>

          {/* Right: Cover Typography & Upload Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-xl bg-stone-900/80 border border-stone-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-100">
                  Novel Cover Typography & Metadata
                </h3>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload New Cover Image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleStandardUpload(f, {
                          category: 'novel_cover',
                          subRole: 'Novel Cover',
                          entityId: '',
                          description: coverDescDraft || `Official book cover for ${project.title}`,
                          isPrimary: true,
                          metadataJson: JSON.stringify({
                            coverTitle: coverTitleDraft || project.title,
                            coverSubtitle: coverSubtitleDraft,
                            authorName: coverAuthorDraft || 'Author',
                            showTypographyOverlay: coverOverlayDraft,
                          }),
                        });
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {activeCover && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Cover Title Overlay
                      </label>
                      <input
                        type="text"
                        value={coverTitleDraft}
                        onChange={(e) => setCoverTitleDraft(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Subtitle / Volume Label
                      </label>
                      <input
                        type="text"
                        value={coverSubtitleDraft}
                        onChange={(e) => setCoverSubtitleDraft(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Author / Pen Name
                      </label>
                      <input
                        type="text"
                        value={coverAuthorDraft}
                        onChange={(e) => setCoverAuthorDraft(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-stone-300 pt-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={coverOverlayDraft}
                        onChange={(e) => setCoverOverlayDraft(e.target.checked)}
                        className="rounded border-stone-700 bg-stone-950 text-amber-500"
                      />
                      Display Title & Author Typography Overlay
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] text-stone-400 mb-1">
                      Cover Description & Edition Notes
                    </label>
                    <textarea
                      rows={2}
                      value={coverDescDraft}
                      onChange={(e) => setCoverDescDraft(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-2">
                      {!activeCover.isPrimary && (
                        <button
                          type="button"
                          onClick={() => setPrimaryVisualAsset(project.id, activeCover)}
                          className="px-3 py-1.5 rounded border border-amber-500/40 text-amber-300 text-xs font-medium"
                        >
                          Set as Active Project Cover
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingAsset(activeCover);
                          replaceFileInputRef.current?.click();
                        }}
                        className="px-3 py-1.5 rounded border border-stone-700 text-stone-300 hover:text-amber-300 text-xs"
                      >
                        Replace Cover Image File
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveCoverMetadata}
                      disabled={uploading}
                      className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
                    >
                      Save Cover Settings
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cover Editions Gallery */}
            {coverAssets.length > 1 && (
              <div className="p-4 rounded-xl bg-stone-900/70 border border-stone-800 space-y-2.5">
                <div className="text-xs font-semibold text-stone-300">
                  All Saved Cover Editions ({coverAssets.length})
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {coverAssets.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCoverId(c.id)}
                      className={`p-1.5 rounded-lg border text-left ${
                        activeCover?.id === c.id
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-stone-800 bg-stone-950'
                      }`}
                    >
                      <img
                        src={c.publicUrl}
                        alt={c.fileName}
                        className="w-full aspect-[2/3] object-cover rounded"
                      />
                      <div className="text-[10px] text-stone-300 truncate mt-1">{c.fileName}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: AI IMAGE PROMPT ASSISTANT                                     */}
      {/* ==================================================================== */}
      {activeTab === 'prompt_studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 p-5 rounded-xl bg-stone-900/80 border border-stone-800 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-stone-100">
                Visual Prompt Synthesizer
              </h3>
            </div>
            <p className="text-xs text-stone-400">
              Transform any canonical Character, Location, Artifact, Organization, Power System, or Novel Cover into a structured, art-director-grade visual generation prompt.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-stone-400 mb-1">
                  Target Asset Category
                </label>
                <select
                  value={promptCategory}
                  onChange={(e) => setPromptCategory(e.target.value as AssetCategory)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-100"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-stone-400 mb-1">
                  Source Canonical Entity (Optional)
                </label>
                <select
                  value={promptSourceEntityId}
                  onChange={(e) => setPromptSourceEntityId(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-100"
                >
                  <option value="">-- Custom Subject / Entire Project --</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.subCategory})
                    </option>
                  ))}
                </select>
              </div>

              {!promptSourceEntityId && (
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">
                    Custom Subject / Visual Concept
                  </label>
                  <input
                    type="text"
                    value={promptCustomSubject}
                    onChange={(e) => setPromptCustomSubject(e.target.value)}
                    placeholder="e.g. The Sunken Spire of Eldoria during an astral eclipse..."
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-stone-400 mb-1">
                  Art Style Direction
                </label>
                <input
                  type="text"
                  value={promptArtStyle}
                  onChange={(e) => setPromptArtStyle(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">
                    Lighting & Palette
                  </label>
                  <input
                    type="text"
                    value={promptLighting}
                    onChange={(e) => setPromptLighting(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-2 text-xs text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">
                    Aspect Ratio
                  </label>
                  <select
                    value={promptAspectRatio}
                    onChange={(e) => setPromptAspectRatio(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-2 text-xs text-stone-100"
                  >
                    <option value="2:3">2:3 (Portrait / Cover)</option>
                    <option value="3:4">3:4 (Character / Relic)</option>
                    <option value="1:1">1:1 (Emblem / Crest)</option>
                    <option value="16:9">16:9 (Landscape / Map)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunPromptSynthesizer}
                disabled={promptGenerating}
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center justify-center gap-2"
              >
                {promptGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Synthesizing Visual Prompt...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Structured Visual Prompt
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 p-5 rounded-xl bg-stone-900/80 border border-stone-800 space-y-4">
            {!synthesizedPrompt ? (
              <div className="h-80 flex flex-col items-center justify-center text-center p-6">
                <Sparkles className="w-10 h-10 text-stone-600 mb-2" />
                <h4 className="text-sm font-semibold text-stone-200">
                  Ready to Synthesize Visual Art Direction
                </h4>
                <p className="text-xs text-stone-400 max-w-md mt-1">
                  Select an entity or enter a concept on the left to generate an editable main prompt, negative prompt, lighting & color harmony notes, and framing guidance.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                    Structured Visual Prompt Blueprint
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunPromptSynthesizer}
                      className="text-xs text-stone-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(synthesizedPrompt.mainPrompt);
                        setCopiedField('main');
                        setTimeout(() => setCopiedField(null), 1800);
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1"
                    >
                      {copiedField === 'main' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedField === 'main' ? 'Copied' : 'Copy Main Prompt'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">
                    Editable Main Generation Prompt
                  </label>
                  <textarea
                    rows={4}
                    value={synthesizedPrompt.mainPrompt}
                    onChange={(e) =>
                      setSynthesizedPrompt({ ...synthesizedPrompt, mainPrompt: e.target.value })
                    }
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-100 leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">
                    Editable Negative Prompt
                  </label>
                  <input
                    type="text"
                    value={synthesizedPrompt.negativePrompt}
                    onChange={(e) =>
                      setSynthesizedPrompt({ ...synthesizedPrompt, negativePrompt: e.target.value })
                    }
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-300"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-stone-950 border border-stone-800">
                    <div className="text-[11px] font-semibold text-amber-300 mb-1">
                      Art Direction
                    </div>
                    <p className="text-stone-300 text-[11px]">
                      {synthesizedPrompt.artDirectionNotes}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-950 border border-stone-800">
                    <div className="text-[11px] font-semibold text-amber-300 mb-1">
                      Lighting & Palette
                    </div>
                    <p className="text-stone-300 text-[11px]">
                      {synthesizedPrompt.lightingAndPalette}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-stone-950 border border-stone-800">
                    <div className="text-[11px] font-semibold text-amber-300 mb-1">
                      Composition
                    </div>
                    <p className="text-stone-300 text-[11px]">
                      {synthesizedPrompt.compositionNotes}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-800 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-stone-400">
                    Preview a scalable Editorial Vector Concept Plate (.SVG) before saving:
                  </span>
                  <button
                    type="button"
                    onClick={handlePreviewConceptFromStudio}
                    disabled={conceptGenerating}
                    className="px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold text-xs flex items-center gap-1.5"
                  >
                    {conceptGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    Preview Concept Plate
                  </button>
                </div>

                {reviewedConcept && (
                  <div className="p-4 rounded-xl bg-stone-950 border border-amber-500/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-300">
                        Review Generated Concept Plate Before Saving
                      </span>
                      <button
                        type="button"
                        onClick={() => setReviewedConcept(null)}
                        className="text-xs text-stone-400 hover:text-stone-200"
                      >
                        Discard
                      </button>
                    </div>
                    {reviewedConcept.notice && (
                      <p className="text-[11px] text-stone-400">{reviewedConcept.notice}</p>
                    )}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <img
                        src={reviewedConcept.publicUrl}
                        alt="Concept Preview"
                        className="w-32 h-40 object-cover rounded-lg border border-stone-700"
                      />
                      <div className="space-y-2 flex-1">
                        <p className="text-xs text-stone-300">
                          Approve this concept plate to store it in your project&apos;s Asset Library, or discard it and upload custom raster artwork.
                        </p>
                        <button
                          type="button"
                          onClick={handleSaveReviewedConceptToLibrary}
                          disabled={uploading}
                          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
                        >
                          Approve & Save to Asset Library
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* UPLOAD MODAL                                                         */}
      {/* ==================================================================== */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="max-w-lg w-full bg-stone-950 border border-stone-800 rounded-xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-sm font-semibold text-stone-100">
                Upload Visual Asset to {project.title}
              </h3>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-stone-400 hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Asset Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as AssetCategory)}
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} — {c.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Visual Role / Sub-Type</label>
                  <input
                    type="text"
                    value={uploadRole}
                    onChange={(e) => setUploadRole(e.target.value)}
                    placeholder="e.g. Main Portrait, Kingdom Crest, World Map..."
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Associated Entity</label>
                  <select
                    value={uploadEntityId}
                    onChange={(e) => setUploadEntityId(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100"
                  >
                    <option value="">Project-Wide / Unassigned</option>
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name} ({ent.subCategory})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-stone-400 mb-1">Description / Art Notes</label>
                <textarea
                  rows={2}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Describe the scene, attire, heraldic symbols, or artist notes..."
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadIsPrimary}
                  onChange={(e) => setUploadIsPrimary(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-900 text-amber-500"
                />
                Set as Main Portrait / Primary Visual for this entity or category
              </label>

              <label className="w-full py-6 border-2 border-dashed border-amber-500/40 hover:border-amber-500 rounded-xl bg-stone-900/50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                {uploading ? (
                  <div className="flex items-center gap-2 text-xs text-amber-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validating & Uploading ({uploadProgress}%)...
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-amber-400 mb-1.5" />
                    <span className="text-xs font-semibold text-stone-200">
                      Click to Choose Image File
                    </span>
                    <span className="text-[11px] text-stone-500 mt-0.5">
                      Supports JPEG, PNG, WebP, and SVG (Max 6 MB)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleStandardUpload(f, {
                        category: uploadCategory,
                        subRole: uploadRole || 'Main Visual',
                        entityId: uploadEntityId,
                        description: uploadDescription,
                        isPrimary: uploadIsPrimary,
                      });
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* EDIT ASSET DETAILS MODAL                                             */}
      {/* ==================================================================== */}
      {editingAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setEditingAsset(null)}
        >
          <div
            className="max-w-md w-full bg-stone-950 border border-stone-800 rounded-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-sm font-semibold text-stone-100">Edit Visual Asset Metadata</h3>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="text-stone-400 hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-100"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as AssetCategory)}
                  className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-100"
                >
                  {ASSET_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Visual Role</label>
                <input
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-100"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Associated Entity</label>
                <select
                  value={editEntityId}
                  onChange={(e) => setEditEntityId(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-100"
                >
                  <option value="">Project-Wide / Unassigned</option>
                  {entities.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.subCategory})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAsset(null)}
                  className="px-3 py-1.5 rounded text-xs text-stone-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const linked = entities.find((e) => e.id === editEntityId);
                    await updateVisualAsset(editingAsset.id, {
                      fileName: editFileName,
                      assetCategory: editCategory,
                      subRole: editRole,
                      entityId: linked ? linked.id : '',
                      entityType: linked ? linked.category : '',
                      entityName: linked ? linked.name : '',
                      description: editDescription,
                    });
                    setEditingAsset(null);
                  }}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* FULLSCREEN LIGHTBOX MODAL                                            */}
      {/* ==================================================================== */}
      {lightboxAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxAsset(null)}
        >
          <div
            className="max-w-4xl w-full bg-stone-950 border border-stone-800 rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
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
            <div className="p-4 bg-stone-900/60 flex items-center justify-center max-h-[78vh] overflow-auto">
              <img
                src={lightboxAsset.publicUrl}
                alt={lightboxAsset.fileName}
                className="max-h-[72vh] w-auto object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
