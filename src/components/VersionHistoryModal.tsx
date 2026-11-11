import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  CloudOff,
  Columns,
  Edit3,
  History,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  AutosaveStatus,
  EntityVersion,
  VersionedEntityType,
} from '../types/nomen';
import {
  createEntityVersionSnapshot,
  restoreEntityVersion,
} from '../lib/db/firestore-service';
import {
  Button,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from './ui/primitives';

/**
 * Phase 7.2 — Reusable Autosave Status Indicator
 */
export const AutosaveIndicator: React.FC<{
  status: AutosaveStatus;
  lastSavedAt?: string | null;
}> = ({ status, lastSavedAt }) => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOffline) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#FBBF24] font-mono-tabular">
        <CloudOff className="w-3.5 h-3.5" />
        Offline — changes queued locally
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)] font-mono-tabular">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Saving...
      </span>
    );
  }

  if (status === 'unsaved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#FBBF24] font-mono-tabular">
        <Clock className="w-3.5 h-3.5" />
        Unsaved changes
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#F87171] font-mono-tabular">
        <AlertTriangle className="w-3.5 h-3.5" />
        Save failed — retry with Save button
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#34D399] font-mono-tabular">
        <Check className="w-3.5 h-3.5" />
        Saved{lastSavedAt ? ` · ${lastSavedAt}` : ''}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono-tabular">
      <Save className="w-3.5 h-3.5" />
      Autosave active
    </span>
  );
};

/**
 * Phase 7.1 — Reusable Version History, Side-by-Side Comparison & Safe Restoration Modal
 */
interface VersionHistoryModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  entityId: string | null;
  entityType: VersionedEntityType;
  entityName: string;
  currentSnapshot?: Record<string, string>;
  versions: EntityVersion[];
  onRestored?: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  open,
  onClose,
  projectId,
  entityId,
  entityType,
  entityName,
  currentSnapshot = {},
  versions,
  onRestored,
}) => {
  const entityVersions = useMemo(() => {
    if (!entityId) return versions;
    return versions
      .filter((v) => v.entityId === entityId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }, [versions, entityId]);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  );
  const [compareTargetId, setCompareTargetId] = useState<string>('current');
  const [confirmRestoreVersion, setConfirmRestoreVersion] =
    useState<EntityVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualLabel, setManualLabel] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (entityVersions.length > 0) {
      setSelectedVersionId(entityVersions[0].id);
    } else {
      setSelectedVersionId(null);
    }
  }, [entityVersions, open]);

  if (!open) return null;

  const selectedVersion =
    entityVersions.find((v) => v.id === selectedVersionId) ||
    entityVersions[0] ||
    null;

  const comparisonSnapshot: Record<string, string> = useMemo(() => {
    if (compareTargetId === 'current') {
      return currentSnapshot;
    }
    const targetVer = entityVersions.find((v) => v.id === compareTargetId);
    return targetVer?.snapshot || currentSnapshot;
  }, [compareTargetId, currentSnapshot, entityVersions]);

  const allDiffKeys = useMemo(() => {
    if (!selectedVersion) return [];
    const keys = new Set<string>([
      ...Object.keys(selectedVersion.snapshot || {}),
      ...Object.keys(comparisonSnapshot || {}),
    ]);
    return Array.from(keys).filter(
      (k) =>
        (selectedVersion.snapshot?.[k] || '').trim() !== '' ||
        (comparisonSnapshot?.[k] || '').trim() !== ''
    );
  }, [selectedVersion, comparisonSnapshot]);

  const handleManualSnapshot = async () => {
    if (!entityId) return;
    setCreatingManual(true);
    try {
      await createEntityVersionSnapshot({
        projectId,
        entityId,
        entityType,
        entityName,
        snapshot: currentSnapshot,
        changeSummary:
          manualLabel.trim() || `Manual author checkpoint of ${entityName}`,
      });
      setManualLabel('');
      setFeedback('Created new version snapshot.');
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setCreatingManual(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!confirmRestoreVersion) return;
    setRestoring(true);
    try {
      // Save a pre-restore safety snapshot of current state if available
      if (entityId && Object.keys(currentSnapshot).length > 0) {
        await createEntityVersionSnapshot({
          projectId,
          entityId,
          entityType,
          entityName,
          snapshot: currentSnapshot,
          changeSummary: `Automatic safety snapshot before restoring v${confirmRestoreVersion.versionNumber}`,
        });
      }

      await restoreEntityVersion(confirmRestoreVersion);
      setFeedback(
        `Restored "${confirmRestoreVersion.entityName}" to Version v${confirmRestoreVersion.versionNumber}.`
      );
      setConfirmRestoreVersion(null);
      if (onRestored) onRestored();
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Version History — ${entityName}`}
      subtitle="Inspect historical snapshots, compare field diffs side-by-side, and restore previous versions with safety checkpoints."
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        {/* Manual Checkpoint Bar */}
        {entityId && Object.keys(currentSnapshot).length > 0 && (
          <div className="p-3.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1">
              <Input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Optional checkpoint note (e.g., 'Before the Eclipse War rewrite')..."
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleManualSnapshot}
              disabled={creatingManual}
            >
              <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {creatingManual ? 'Saving Snapshot...' : 'Save Manual Snapshot'}
            </Button>
          </div>
        )}

        {feedback && (
          <div className="p-3 bg-[#132A20] border border-[#10B981]/40 rounded-lg text-xs text-[#6EE7B7] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {entityVersions.length === 0 ? (
          <div className="p-8 text-center bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2">
            <p className="text-base font-semibold text-[var(--text-primary)] font-serif-display">
              No Version Snapshots Recorded Yet
            </p>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
              NOMEN automatically creates version snapshots whenever you create or update characters, locations, organizations, artifacts, power systems, lore entries, or timeline events.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left 4 Cols: Version Timeline List */}
            <div className="lg:col-span-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] max-h-[440px] overflow-y-auto">
              {entityVersions.map((ver) => {
                const isSelected = selectedVersion?.id === ver.id;
                const formattedDate = ver.createdAt
                  ? new Date(ver.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Just now';

                return (
                  <button
                    key={ver.id}
                    type="button"
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer space-y-1 ${
                      isSelected ? 'bg-[#181E30]' : 'hover:bg-[#141826]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                        Version v{ver.versionNumber}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] font-mono-tabular">
                        {formattedDate}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {ver.changeSummary}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      By {ver.createdByName || 'Author'}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Right 8 Cols: Side-by-Side Comparison & Restore */}
            {selectedVersion && (
              <div className="lg:col-span-8 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="font-mono-tabular text-[var(--accent-primary)] font-semibold">
                        v{selectedVersion.versionNumber}
                      </span>
                      <span>·</span>
                      <span>{selectedVersion.entityName}</span>
                      <span>·</span>
                      <span>By {selectedVersion.createdByName}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {selectedVersion.changeSummary}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={compareTargetId}
                      onChange={(e) => setCompareTargetId(e.target.value)}
                      className="text-xs py-1.5 w-44"
                    >
                      <option value="current">Compare vs. Current</option>
                      {entityVersions
                        .filter((v) => v.id !== selectedVersion.id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            Compare vs. v{v.versionNumber}
                          </option>
                        ))}
                    </Select>

                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmRestoreVersion(selectedVersion)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore v{selectedVersion.versionNumber}
                    </Button>
                  </div>
                </div>

                {/* Confirmation Banner before Restoration */}
                {confirmRestoreVersion && (
                  <div className="p-3.5 bg-[#261922] border border-[#F87171]/50 rounded-lg space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs text-[#FECACA]">
                      <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          Confirm Restoration to Version v
                          {confirmRestoreVersion.versionNumber}?
                        </p>
                        <p className="text-[var(--text-secondary)] mt-0.5">
                          NOMEN will automatically save a backup snapshot of your current state before restoring Version v
                          {confirmRestoreVersion.versionNumber}. No data will be lost.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmRestoreVersion(null)}
                        disabled={restoring}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleConfirmRestore}
                        disabled={restoring}
                      >
                        {restoring ? 'Restoring...' : 'Confirm Restore'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Side-by-Side Diff Table */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2">
                    <span>
                      Selected Snapshot (v{selectedVersion.versionNumber})
                    </span>
                    <span>
                      {compareTargetId === 'current'
                        ? 'Current Active State'
                        : 'Comparison Version'}
                    </span>
                  </div>

                  {allDiffKeys.map((key) => {
                    const leftVal = selectedVersion.snapshot?.[key] || '—';
                    const rightVal =
                      Object.keys(comparisonSnapshot).length > 0
                        ? comparisonSnapshot?.[key] || '—'
                        : '(Inspect in Studio)';
                    const isChanged =
                      Object.keys(comparisonSnapshot).length > 0 &&
                      leftVal !== rightVal;

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          isChanged
                            ? 'bg-[#171C2C] border-[var(--accent-primary)]/50'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                            {key}
                          </span>
                          {isChanged && (
                            <span className="text-[10px] text-[#FBBF24]">
                              Modified
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-2 bg-[var(--bg-canvas)] rounded border border-[var(--border-subtle)] text-[var(--text-primary)] whitespace-pre-wrap break-words">
                            {leftVal}
                          </div>
                          <div className="p-2 bg-[var(--bg-canvas)] rounded border border-[var(--border-subtle)] text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                            {rightVal}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

/**
 * Phase 8.3 — Side-by-Side Multi-Candidate AI Generation Comparison Modal
 */
interface AiComparisonModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  candidates: Record<string, string>[];
  primaryTitleKey: string;
  secondaryKey?: string;
  summaryKey: string;
  displayFields: { key: string; label: string }[];
  onSelectCandidate: (editedCandidate: Record<string, string>) => void;
}

export const AiComparisonModal: React.FC<AiComparisonModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  candidates,
  primaryTitleKey,
  secondaryKey,
  summaryKey,
  displayFields,
  onSelectCandidate,
}) => {
  const [editableCandidates, setEditableCandidates] = useState<
    Record<string, string>[]
  >([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    setEditableCandidates(candidates.map((c) => ({ ...c })));
    setEditingIndex(null);
  }, [candidates, open]);

  if (!open) return null;

  const handleFieldChange = (idx: number, key: string, value: string) => {
    setEditableCandidates((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [key]: value } : item))
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        subtitle ||
        'Compare multiple AI-synthesized variations side-by-side on desktop (stacked on mobile). Edit any candidate inline before applying.'
      }
      maxWidth="max-w-6xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {editableCandidates.map((cand, idx) => {
            const isEditing = editingIndex === idx;
            const heading =
              cand[primaryTitleKey] ||
              cand.name ||
              cand.fullName ||
              cand.title ||
              `Option ${idx + 1}`;
            const subheading = secondaryKey ? cand[secondaryKey] : '';
            const summary = cand[summaryKey] || '';

            return (
              <div
                key={idx}
                className="p-4 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/60 rounded-xl flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                    <span className="text-xs font-mono-tabular font-semibold text-[var(--accent-primary)] flex items-center gap-1.5">
                      <Columns className="w-3.5 h-3.5" />
                      Variation 0{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingIndex(isEditing ? null : idx)
                      }
                      className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      {isEditing ? 'Done Editing' : 'Edit Before Saving'}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      <div>
                        <FieldLabel label="Name / Title" />
                        <Input
                          value={heading}
                          onChange={(e) =>
                            handleFieldChange(
                              idx,
                              primaryTitleKey,
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel label="Summary / Overview" />
                        <Textarea
                          rows={3}
                          value={summary}
                          onChange={(e) =>
                            handleFieldChange(idx, summaryKey, e.target.value)
                          }
                        />
                      </div>
                      {displayFields.map((df) => (
                        <div key={df.key}>
                          <FieldLabel label={df.label} />
                          <Textarea
                            rows={2}
                            value={cand[df.key] || ''}
                            onChange={(e) =>
                              handleFieldChange(idx, df.key, e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div>
                        <h3 className="text-xl font-semibold text-[var(--text-primary)] font-serif-display">
                          {heading}
                        </h3>
                        {subheading && (
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {subheading}
                          </p>
                        )}
                      </div>

                      {summary && (
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {summary}
                        </p>
                      )}

                      <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
                        {displayFields.map((df) =>
                          cand[df.key] ? (
                            <div key={df.key}>
                              <span className="text-[var(--text-muted)]">
                                {df.label}:
                              </span>{' '}
                              <span className="text-[var(--text-secondary)]">
                                {cand[df.key]}
                              </span>
                            </div>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onSelectCandidate(cand);
                    onClose();
                  }}
                  className="w-full"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply Variation 0{idx + 1} to Editor
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
