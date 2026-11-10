import React, { useState } from 'react';
import {
  Edit3,
  Flame,
  Link2,
  Plus,
  Shield,
  Sparkles,
  Sword,
  Trash2,
} from 'lucide-react';
import {
  EntityRelation,
  ITEM_TYPES,
  ORGANIZATION_TYPES,
  POWER_CATEGORIES,
  Project,
  WorldEntity,
} from '../../types/nomen';
import {
  createEntity,
  createEntityRelation,
  deleteEntity,
  deleteEntityRelation,
  recordAiGeneration,
  updateEntity,
} from '../../lib/db/firestore-service';
import { generateEntityBlueprintApi } from '../../lib/ai/client';
import {
  Button,
  ConfirmDeleteModal,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui/primitives';

interface WorldStudiosViewProps {
  project: Project;
  entities: WorldEntity[];
  relations?: EntityRelation[];
  onInspectEntityForAssistant?: (entity: WorldEntity) => void;
}

export const WorldStudiosView: React.FC<WorldStudiosViewProps> = ({
  project,
  entities,
  relations = [],
  onInspectEntityForAssistant,
}) => {
  const [studioTab, setStudioTab] = useState<
    'organizations' | 'items' | 'powers'
  >('organizations');
  const [searchQuery, setSearchQuery] = useState('');

  const characters = entities.filter((e) => e.category === 'character');
  const locations = entities.filter((e) => e.category === 'location');

  // Organization Modal State
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<string>(ORGANIZATION_TYPES[0]);
  const [orgSummary, setOrgSummary] = useState('');
  const [founder, setFounder] = useState('');
  const [leader, setLeader] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [members, setMembers] = useState('');
  const [hierarchy, setHierarchy] = useState('');
  const [orgHistory, setOrgHistory] = useState('');
  const [goals, setGoals] = useState('');
  const [reputation, setReputation] = useState('');
  const [symbols, setSymbols] = useState('');
  const [orgRelations, setOrgRelations] = useState('');

  // Item Modal State
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<string>(ITEM_TYPES[2]);
  const [rarity, setRarity] = useState('Mythic / Singular');
  const [origin, setOrigin] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [powers, setPowers] = useState('');
  const [limitations, setLimitations] = useState('');
  const [currentOwner, setCurrentOwner] = useState('');
  const [itemHistory, setItemHistory] = useState('');

  // Power System Modal State
  const [powerModalOpen, setPowerModalOpen] = useState(false);
  const [editingPowerId, setEditingPowerId] = useState<string | null>(null);
  const [powerName, setPowerName] = useState('');
  const [powerCat, setPowerCat] = useState<string>(POWER_CATEGORIES[0]);
  const [powerSummary, setPowerSummary] = useState('');
  const [systemName, setSystemName] = useState('');
  const [sourceOfPower, setSourceOfPower] = useState('');
  const [rankStructure, setRankStructure] = useState('');
  const [costOrLimitation, setCostOrLimitation] = useState('');
  const [elementsOrBranches, setElementsOrBranches] = useState('');
  const [masteryRequirements, setMasteryRequirements] = useState('');
  const [notablePractitioners, setNotablePractitioners] = useState('');

  // Shared AI Assist, Link Modal & Delete
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorldEntity | null>(null);

  const [linkSourceEntity, setLinkSourceEntity] = useState<WorldEntity | null>(
    null
  );
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('Affiliated with');
  const [relDesc, setRelDesc] = useState('');

  const organizations = entities.filter(
    (e) => e.category === 'organization' || e.category === 'family'
  );
  const items = entities.filter((e) => e.category === 'item');
  const powerEntities = entities.filter((e) => e.category === 'ability');

  // Organization Handlers
  const openCreateOrg = () => {
    setEditingOrgId(null);
    setOrgName('');
    setOrgType(ORGANIZATION_TYPES[0]);
    setOrgSummary('');
    setFounder('');
    setLeader('');
    setHeadquarters('');
    setMembers('');
    setHierarchy('');
    setOrgHistory('');
    setGoals('');
    setReputation('');
    setSymbols('');
    setOrgRelations('');
    setAiPrompt('');
    setOrgModalOpen(true);
  };

  const openEditOrg = (org: WorldEntity) => {
    const a = org.attributes || {};
    setEditingOrgId(org.id);
    setOrgName(org.name);
    setOrgType(org.subCategory || ORGANIZATION_TYPES[0]);
    setOrgSummary(org.summary || '');
    setFounder(a.founder || '');
    setLeader(a.leader || '');
    setHeadquarters(a.headquarters || '');
    setMembers(a.members || '');
    setHierarchy(a.hierarchy || '');
    setOrgHistory(a.history || '');
    setGoals(a.goals || '');
    setReputation(a.reputation || '');
    setSymbols(a.symbols || '');
    setOrgRelations(a.relations || '');
    setOrgModalOpen(true);
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    const category =
      orgType === 'Noble Family' || orgType === 'Royal Dynasty'
        ? 'family'
        : 'organization';
    const attributes = {
      founder,
      leader,
      headquarters,
      members,
      hierarchy,
      history: orgHistory,
      goals,
      reputation,
      symbols,
      relations: orgRelations,
    };
    const subtitle = [orgType, headquarters ? `Seat: ${headquarters}` : '']
      .filter(Boolean)
      .join(' · ');

    if (editingOrgId) {
      await updateEntity(editingOrgId, {
        category,
        subCategory: orgType,
        name: orgName,
        subtitle,
        summary: orgSummary || goals,
        parentId: '',
        attributes,
      });
    } else {
      await createEntity({
        projectId: project.id,
        category,
        subCategory: orgType,
        name: orgName,
        subtitle,
        summary: orgSummary || goals,
        parentId: '',
        attributes,
      });
    }
    setOrgModalOpen(false);
  };

  // Item Handlers
  const openCreateItem = () => {
    setEditingItemId(null);
    setItemName('');
    setItemType(ITEM_TYPES[2]);
    setRarity('Mythic / Singular');
    setOrigin('');
    setItemDescription('');
    setPowers('');
    setLimitations('');
    setCurrentOwner('');
    setItemHistory('');
    setAiPrompt('');
    setItemModalOpen(true);
  };

  const openEditItem = (it: WorldEntity) => {
    const a = it.attributes || {};
    setEditingItemId(it.id);
    setItemName(it.name);
    setItemType(it.subCategory || ITEM_TYPES[0]);
    setRarity(a.rarity || 'Rare');
    setOrigin(a.origin || '');
    setItemDescription(it.summary || '');
    setPowers(a.powers || '');
    setLimitations(a.limitations || '');
    setCurrentOwner(a.currentOwner || '');
    setItemHistory(a.history || '');
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    const attributes = {
      rarity,
      origin,
      powers,
      limitations,
      currentOwner,
      history: itemHistory,
    };
    const subtitle = [
      itemType,
      rarity,
      currentOwner ? `Owner: ${currentOwner}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    if (editingItemId) {
      await updateEntity(editingItemId, {
        category: 'item',
        subCategory: itemType,
        name: itemName,
        subtitle,
        summary: itemDescription,
        parentId: '',
        attributes,
      });
    } else {
      await createEntity({
        projectId: project.id,
        category: 'item',
        subCategory: itemType,
        name: itemName,
        subtitle,
        summary: itemDescription,
        parentId: '',
        attributes,
      });
    }
    setItemModalOpen(false);
  };

  // Power System Handlers
  const openCreatePower = () => {
    setEditingPowerId(null);
    setPowerName('');
    setPowerCat(POWER_CATEGORIES[0]);
    setPowerSummary('');
    setSystemName('');
    setSourceOfPower('');
    setRankStructure('');
    setCostOrLimitation('');
    setElementsOrBranches('');
    setMasteryRequirements('');
    setNotablePractitioners('');
    setAiPrompt('');
    setPowerModalOpen(true);
  };

  const openEditPower = (pw: WorldEntity) => {
    const a = pw.attributes || {};
    setEditingPowerId(pw.id);
    setPowerName(pw.name);
    setPowerCat(pw.subCategory || POWER_CATEGORIES[0]);
    setPowerSummary(pw.summary || '');
    setSystemName(a.systemName || '');
    setSourceOfPower(a.sourceOfPower || '');
    setRankStructure(a.rankStructure || '');
    setCostOrLimitation(a.costOrLimitation || '');
    setElementsOrBranches(a.elementsOrBranches || '');
    setMasteryRequirements(a.masteryRequirements || '');
    setNotablePractitioners(a.notablePractitioners || '');
    setPowerModalOpen(true);
  };

  const handleSavePower = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!powerName.trim()) return;
    const attributes = {
      systemName,
      sourceOfPower,
      rankStructure,
      costOrLimitation,
      elementsOrBranches,
      masteryRequirements,
      notablePractitioners,
    };
    const subtitle = [powerCat, systemName].filter(Boolean).join(' · ');

    if (editingPowerId) {
      await updateEntity(editingPowerId, {
        category: 'ability',
        subCategory: powerCat,
        name: powerName,
        subtitle,
        summary: powerSummary,
        parentId: '',
        attributes,
      });
    } else {
      await createEntity({
        projectId: project.id,
        category: 'ability',
        subCategory: powerCat,
        name: powerName,
        subtitle,
        summary: powerSummary,
        parentId: '',
        attributes,
      });
    }
    setPowerModalOpen(false);
  };

  const handleAiAssist = async (
    category: 'organization' | 'item' | 'ability',
    subCategory: string
  ) => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await generateEntityBlueprintApi({
        category,
        subCategory,
        prompt: aiPrompt,
        projectContext: {
          title: project.title,
          genre: project.genre,
          worldSettings: project.worldSettings,
        },
      });
      const r = res.result;

      if (category === 'organization') {
        setOrgName(r.name || orgName);
        setOrgSummary(r.summary || orgSummary);
        setFounder(r.founder || founder);
        setLeader(r.leader || leader);
        setHeadquarters(r.headquarters || headquarters);
        setMembers(r.members || members);
        setHierarchy(r.hierarchy || hierarchy);
        setOrgHistory(r.history || orgHistory);
        setGoals(r.goals || goals);
        setReputation(r.reputation || reputation);
        setSymbols(r.symbols || symbols);
        setOrgRelations(r.relations || orgRelations);
      } else if (category === 'item') {
        setItemName(r.name || itemName);
        setItemDescription(r.summary || itemDescription);
        setRarity(r.rarity || rarity);
        setOrigin(r.origin || origin);
        setPowers(r.powers || powers);
        setLimitations(r.limitations || limitations);
        setCurrentOwner(r.currentOwner || currentOwner);
        setItemHistory(r.history || itemHistory);
      } else if (category === 'ability') {
        setPowerName(r.name || powerName);
        setPowerSummary(r.summary || powerSummary);
        setSystemName(r.systemName || systemName);
        setSourceOfPower(r.sourceOfPower || sourceOfPower);
        setRankStructure(r.rankStructure || rankStructure);
        setCostOrLimitation(r.costOrLimitation || costOrLimitation);
        setElementsOrBranches(r.elementsOrBranches || elementsOrBranches);
        setMasteryRequirements(r.masteryRequirements || masteryRequirements);
        setNotablePractitioners(r.notablePractitioners || notablePractitioners);
      }

      await recordAiGeneration({
        projectId: project.id,
        generationType: `${subCategory} Studio`,
        category: subCategory,
        promptSummary: aiPrompt,
        resultsSummary: r.name || 'Generated Blueprint',
        modelUsed: res.modelUsed,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const openLinkModalForEntity = (
    entity: WorldEntity,
    defaultRelationType: string
  ) => {
    const firstOther = entities.find((e) => e.id !== entity.id);
    setLinkSourceEntity(entity);
    setRelTargetId(firstOther?.id || '');
    setRelType(defaultRelationType);
    setRelDesc('');
  };

  const handleSaveRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkSourceEntity || !relTargetId) return;
    const target = entities.find((ent) => ent.id === relTargetId);
    if (!target) return;

    await createEntityRelation({
      projectId: project.id,
      sourceEntityId: linkSourceEntity.id,
      sourceEntityName: linkSourceEntity.name,
      targetEntityId: target.id,
      targetEntityName: target.name,
      relationType: relType,
      description: relDesc,
    });
    setLinkSourceEntity(null);
  };

  const renderEntityRelations = (entity: WorldEntity) => {
    const entityRels = relations.filter(
      (r) => r.sourceEntityId === entity.id || r.targetEntityId === entity.id
    );
    if (entityRels.length === 0) return null;

    return (
      <div className="pt-3 border-t border-[#1A2030] space-y-1.5">
        <p className="text-[11px] font-semibold text-[#9D97B8]">
          Connected Canon Entities ({entityRels.length})
        </p>
        <div className="space-y-1">
          {entityRels.map((rel) => (
            <div
              key={rel.id}
              className="flex items-center justify-between gap-2 text-xs bg-[#0D1018] px-2.5 py-1.5 rounded border border-[#1E2436]"
            >
              <span className="text-[#D0CCE0] truncate">
                <strong className="text-[#F3F1FA]">
                  {rel.sourceEntityName}
                </strong>{' '}
                <span className="text-[#C4B5FD]">→ {rel.relationType} →</span>{' '}
                <strong className="text-[#F3F1FA]">
                  {rel.targetEntityName}
                </strong>
              </span>
              <button
                onClick={() => deleteEntityRelation(rel.id)}
                className="text-[#736E8A] hover:text-[#F87171] cursor-pointer shrink-0"
                title="Remove relationship"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Studio Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#F3F1FA] font-serif-display">
            Organizations, Artifacts & Power Systems
          </h1>
          <p className="text-sm text-[#8E89A6] mt-0.5">
            Design noble dynasties, guilds, mythic relics, and custom magic or cultivation hierarchies.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#111520] border border-[#1E2436] rounded-lg self-start">
          <button
            onClick={() => setStudioTab('organizations')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              studioTab === 'organizations'
                ? 'bg-[#7C6CC4] text-[#F8F7FC]'
                : 'text-[#8E89A6] hover:text-[#ECEAF2]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Organizations ({organizations.length})
          </button>
          <button
            onClick={() => setStudioTab('items')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              studioTab === 'items'
                ? 'bg-[#7C6CC4] text-[#F8F7FC]'
                : 'text-[#8E89A6] hover:text-[#ECEAF2]'
            }`}
          >
            <Sword className="w-3.5 h-3.5" />
            Items & Artifacts ({items.length})
          </button>
          <button
            onClick={() => setStudioTab('powers')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
              studioTab === 'powers'
                ? 'bg-[#7C6CC4] text-[#F8F7FC]'
                : 'text-[#8E89A6] hover:text-[#ECEAF2]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Power Systems ({powerEntities.length})
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111520] p-4 border border-[#1E2436] rounded-xl">
        <div className="flex-1 max-w-md">
          <Input
            placeholder={`Search ${studioTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {studioTab === 'organizations' && (
          <Button variant="primary" size="sm" onClick={openCreateOrg}>
            <Plus className="w-4 h-4" />
            New Organization / House
          </Button>
        )}
        {studioTab === 'items' && (
          <Button variant="primary" size="sm" onClick={openCreateItem}>
            <Plus className="w-4 h-4" />
            New Item / Artifact
          </Button>
        )}
        {studioTab === 'powers' && (
          <Button variant="primary" size="sm" onClick={openCreatePower}>
            <Plus className="w-4 h-4" />
            New Power System / Ability
          </Button>
        )}
      </div>

      {/* TAB 1: ORGANIZATIONS */}
      {studioTab === 'organizations' && (
        <div>
          {organizations.length === 0 ? (
            <EmptyState
              title="No Organizations or Noble Families"
              description="Create noble houses, royal dynasties, guilds, military orders, or secret societies."
              actionLabel="Create Organization"
              onAction={openCreateOrg}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {organizations
                .filter(
                  (o) =>
                    !searchQuery.trim() ||
                    o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    o.subCategory
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase())
                )
                .map((org) => (
                  <div
                    key={org.id}
                    className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-[#8E89A6]">
                        <span>{org.subCategory}</span>
                        {org.attributes?.headquarters && (
                          <span>HQ: {org.attributes.headquarters}</span>
                        )}
                      </div>
                      <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display">
                        {org.name}
                      </h2>
                      <p className="text-xs text-[#D0CCE0] leading-relaxed">
                        {org.summary}
                      </p>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#1A2030] text-xs">
                        <div>
                          <span className="text-[#736E8A]">Founder:</span>{' '}
                          <span className="text-[#E4E1EE]">
                            {org.attributes?.founder || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#736E8A]">Current Leader:</span>{' '}
                          <span className="text-[#E4E1EE]">
                            {org.attributes?.leader || '—'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[#736E8A]">Hierarchy:</span>{' '}
                          <span className="text-[#C5C1D6]">
                            {org.attributes?.hierarchy || '—'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[#736E8A]">
                            Symbols & Heraldry:
                          </span>{' '}
                          <span className="text-[#C5C1D6]">
                            {org.attributes?.symbols || '—'}
                          </span>
                        </div>
                      </div>

                      {renderEntityRelations(org)}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#1A2030]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openLinkModalForEntity(org, 'Commanded / Led by')
                        }
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link Entity
                      </Button>
                      {onInspectEntityForAssistant && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectEntityForAssistant(org)}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
                          Ask AI
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditOrg(org)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(org)}
                        className="text-[#F87171]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ITEMS & ARTIFACTS */}
      {studioTab === 'items' && (
        <div>
          {items.length === 0 ? (
            <EmptyState
              title="No Items or Artifacts Forged"
              description="Catalog legendary weapons, ancient relics, grimoires, potions, and magical regalia."
              actionLabel="Create Item / Artifact"
              onAction={openCreateItem}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {items
                .filter(
                  (i) =>
                    !searchQuery.trim() ||
                    i.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((it) => (
                  <div
                    key={it.id}
                    className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
                        <span>{it.subCategory}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#C4B5FD]">
                          {it.attributes?.rarity || 'Artifact'}
                        </span>
                        {it.attributes?.currentOwner && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Wielder: {it.attributes.currentOwner}</span>
                          </>
                        )}
                      </div>
                      <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display">
                        {it.name}
                      </h2>
                      <p className="text-xs text-[#D0CCE0] leading-relaxed">
                        {it.summary}
                      </p>

                      <div className="space-y-1.5 pt-3 border-t border-[#1A2030] text-xs">
                        <p>
                          <span className="text-[#736E8A]">
                            Powers & Effects:
                          </span>{' '}
                          <span className="text-[#E4E1EE]">
                            {it.attributes?.powers || '—'}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#736E8A]">
                            Limitations & Toll:
                          </span>{' '}
                          <span className="text-[#C5C1D6]">
                            {it.attributes?.limitations || '—'}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#736E8A]">
                            Origin & Provenance:
                          </span>{' '}
                          <span className="text-[#C5C1D6]">
                            {it.attributes?.origin || '—'}
                          </span>
                        </p>
                      </div>

                      {renderEntityRelations(it)}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#1A2030]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openLinkModalForEntity(it, 'Wielded / Guarded by')
                        }
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link Entity
                      </Button>
                      {onInspectEntityForAssistant && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectEntityForAssistant(it)}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
                          Ask AI
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditItem(it)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(it)}
                        className="text-[#F87171]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: POWER SYSTEMS */}
      {studioTab === 'powers' && (
        <div>
          {powerEntities.length === 0 ? (
            <EmptyState
              title="No Power Systems or Abilities Defined"
              description="Design custom magic systems, cultivation realms, elemental arts, or combat techniques with bespoke progression ranks."
              actionLabel="Create Power System"
              onAction={openCreatePower}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {powerEntities
                .filter(
                  (p) =>
                    !searchQuery.trim() ||
                    p.name.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((pw) => (
                  <div
                    key={pw.id}
                    className="p-6 bg-[#111520] border border-[#1E2436] rounded-xl space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-[#8E89A6]">
                        <span>{pw.subCategory}</span>
                        {pw.attributes?.systemName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{pw.attributes.systemName}</span>
                          </>
                        )}
                      </div>
                      <h2 className="text-2xl font-semibold text-[#F3F1FA] font-serif-display">
                        {pw.name}
                      </h2>
                      <p className="text-xs text-[#D0CCE0] leading-relaxed">
                        {pw.summary}
                      </p>

                      <div className="space-y-1.5 pt-3 border-t border-[#1A2030] text-xs">
                        <p>
                          <span className="text-[#736E8A]">
                            Source of Power:
                          </span>{' '}
                          <span className="text-[#E4E1EE]">
                            {pw.attributes?.sourceOfPower || '—'}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#736E8A]">
                            Custom Rank / Tier Structure:
                          </span>{' '}
                          <span className="text-[#C4B5FD]">
                            {pw.attributes?.rankStructure ||
                              'Unranked / Bespoke'}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#736E8A]">
                            Branches / Elements:
                          </span>{' '}
                          <span className="text-[#C5C1D6]">
                            {pw.attributes?.elementsOrBranches || '—'}
                          </span>
                        </p>
                        <p>
                          <span className="text-[#736E8A]">
                            Cost & Hard Limitations:
                          </span>{' '}
                          <span className="text-[#C5C1D6]">
                            {pw.attributes?.costOrLimitation || '—'}
                          </span>
                        </p>
                        {pw.attributes?.masteryRequirements && (
                          <p>
                            <span className="text-[#736E8A]">
                              Mastery Requirements:
                            </span>{' '}
                            <span className="text-[#C5C1D6]">
                              {pw.attributes.masteryRequirements}
                            </span>
                          </p>
                        )}
                        {pw.attributes?.notablePractitioners && (
                          <p>
                            <span className="text-[#736E8A]">
                              Notable Practitioners:
                            </span>{' '}
                            <span className="text-[#E4E1EE]">
                              {pw.attributes.notablePractitioners}
                            </span>
                          </p>
                        )}
                      </div>

                      {renderEntityRelations(pw)}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[#1A2030]">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openLinkModalForEntity(pw, 'Practiced / Mastered by')
                        }
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Link Entity
                      </Button>
                      {onInspectEntityForAssistant && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectEntityForAssistant(pw)}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#C4B5FD]" />
                          Ask AI
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditPower(pw)}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(pw)}
                        className="text-[#F87171]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Organization Modal */}
      <Modal
        open={orgModalOpen}
        onClose={() => setOrgModalOpen(false)}
        title={
          editingOrgId
            ? 'Edit Organization'
            : 'Create Organization / Dynasty'
        }
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveOrg} className="space-y-4">
          <div className="p-3 bg-[#0D1018] border border-[#23293B] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Architect: e.g., 'A guild of blind astrological cartographers'..."
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAiAssist('organization', orgType)}
              disabled={aiLoading}
            >
              {aiLoading ? 'Drafting...' : 'Draft with AI'}
            </Button>
          </div>

          {(characters.length > 0 || locations.length > 0) && (
            <div className="p-3 bg-[#0D1018] border border-[#1E2436] rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3">
              {characters.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[#9D97B8] mb-1">
                    Quick-Fill Leader from Character Studio
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setLeader(e.target.value);
                    }}
                  >
                    <option value="">-- Choose Character --</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({c.subCategory})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {locations.length > 0 && (
                <div>
                  <label className="block text-[11px] text-[#9D97B8] mb-1">
                    Quick-Fill Headquarters from World Builder
                  </label>
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setHeadquarters(e.target.value);
                    }}
                  >
                    <option value="">-- Choose Location --</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name} ({l.subCategory})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Organization Name" required />
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel label="Organization Type" />
              <Select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
              >
                {ORGANIZATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel label="Founder" />
              <Input
                value={founder}
                onChange={(e) => setFounder(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Current Leader" />
              <Input
                value={leader}
                onChange={(e) => setLeader(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Headquarters / Seat" />
              <Input
                value={headquarters}
                onChange={(e) => setHeadquarters(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Symbols & Crest" />
              <Input
                value={symbols}
                onChange={(e) => setSymbols(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Summary & Core Mandate" />
            <Textarea
              rows={2}
              value={orgSummary}
              onChange={(e) => setOrgSummary(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Hierarchy & Ranks" />
              <Input
                value={hierarchy}
                onChange={(e) => setHierarchy(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Notable Members" />
              <Input
                value={members}
                onChange={(e) => setMembers(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Goals & Ambitions" />
              <Textarea
                rows={2}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Public Reputation" />
              <Textarea
                rows={2}
                value={reputation}
                onChange={(e) => setReputation(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="History" />
              <Textarea
                rows={2}
                value={orgHistory}
                onChange={(e) => setOrgHistory(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Diplomatic Relations" />
              <Textarea
                rows={2}
                value={orgRelations}
                onChange={(e) => setOrgRelations(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOrgModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Organization
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={
          editingItemId ? 'Edit Item / Artifact' : 'Create Item / Artifact'
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="p-3 bg-[#0D1018] border border-[#23293B] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Architect: e.g., 'A star-iron blade that drinks spoken oaths'..."
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAiAssist('item', itemType)}
              disabled={aiLoading}
            >
              {aiLoading ? 'Drafting...' : 'Draft with AI'}
            </Button>
          </div>

          {characters.length > 0 && (
            <div className="p-3 bg-[#0D1018] border border-[#1E2436] rounded-lg">
              <label className="block text-[11px] text-[#9D97B8] mb-1">
                Quick-Fill Current Wielder / Owner from Character Studio
              </label>
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value) setCurrentOwner(e.target.value);
                }}
              >
                <option value="">-- Choose Character --</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.subCategory})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel label="Item Name" required />
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel label="Item Type" />
              <Select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel label="Rarity" />
              <Input
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Origin / Creator" />
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Current Owner" />
              <Input
                value={currentOwner}
                onChange={(e) => setCurrentOwner(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Appearance & Description" />
            <Textarea
              rows={2}
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Powers & Capabilities" />
              <Textarea
                rows={2}
                value={powers}
                onChange={(e) => setPowers(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Limitations, Curses & Costs" />
              <Textarea
                rows={2}
                value={limitations}
                onChange={(e) => setLimitations(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel label="History & Provenance" />
            <Textarea
              rows={2}
              value={itemHistory}
              onChange={(e) => setItemHistory(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setItemModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Artifact
            </Button>
          </div>
        </form>
      </Modal>

      {/* Power System Modal */}
      <Modal
        open={powerModalOpen}
        onClose={() => setPowerModalOpen(false)}
        title={
          editingPowerId
            ? 'Edit Power System / Ability'
            : 'Create Power System / Ability'
        }
        subtitle="Define custom magic systems, cultivation tiers, or bespoke abilities without rigid templates."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSavePower} className="space-y-4">
          <div className="p-3 bg-[#0D1018] border border-[#23293B] rounded-lg flex flex-col sm:flex-row gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="AI Architect: e.g., 'Acoustic star-metal magic divided into five harmonic chords'..."
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleAiAssist('ability', powerCat)}
              disabled={aiLoading}
            >
              {aiLoading ? 'Drafting...' : 'Draft with AI'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Name" required />
              <Input
                value={powerName}
                onChange={(e) => setPowerName(e.target.value)}
                required
              />
            </div>
            <div>
              <FieldLabel label="Category" />
              <Select
                value={powerCat}
                onChange={(e) => setPowerCat(e.target.value)}
              >
                {POWER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel label="Overview & Mechanics" />
            <Textarea
              rows={2}
              value={powerSummary}
              onChange={(e) => setPowerSummary(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Parent Magic / Cultivation System Name" />
              <Input
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="e.g., The Five Chords of Astral Resonance"
              />
            </div>
            <div>
              <FieldLabel label="Source of Power" />
              <Input
                value={sourceOfPower}
                onChange={(e) => setSourceOfPower(e.target.value)}
                placeholder="e.g., Fallen star-iron veins"
              />
            </div>
          </div>

          <div>
            <FieldLabel
              label="Custom Rank / Progression Structure"
              hint="Freeform — define any hierarchy or leave unranked"
            />
            <Input
              value={rankStructure}
              onChange={(e) => setRankStructure(e.target.value)}
              placeholder="e.g., Listener -> Cantor -> Resonant -> Sovereign -> Eclipse"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Elements, Branches, or Schools" />
              <Textarea
                rows={2}
                value={elementsOrBranches}
                onChange={(e) => setElementsOrBranches(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Cost, Drawbacks & Hard Limitations" />
              <Textarea
                rows={2}
                value={costOrLimitation}
                onChange={(e) => setCostOrLimitation(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel label="Mastery Requirements & Training" />
              <Input
                value={masteryRequirements}
                onChange={(e) => setMasteryRequirements(e.target.value)}
                placeholder="e.g., Years of silence in the Pale Vault"
              />
            </div>
            <div>
              <FieldLabel label="Notable Practitioners" />
              <Input
                value={notablePractitioners}
                onChange={(e) => setNotablePractitioners(e.target.value)}
                placeholder="e.g., Caelum Vaelor, Arch-Cantor Seraphine"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#1E2436]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPowerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Power Entry
            </Button>
          </div>
        </form>
      </Modal>

      {/* Shared Link Entity Modal */}
      <Modal
        open={Boolean(linkSourceEntity)}
        onClose={() => setLinkSourceEntity(null)}
        title={`Link ${linkSourceEntity?.name || 'Entity'} to Canon`}
        subtitle="Connect this organization, artifact, or power system to a character, location, or faction."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveRelation} className="space-y-4">
          <div>
            <FieldLabel label="Target Entity in Project" required />
            <Select
              value={relTargetId}
              onChange={(e) => setRelTargetId(e.target.value)}
              required
            >
              <option value="">-- Select Entity --</option>
              {entities
                .filter((e) => e.id !== linkSourceEntity?.id)
                .map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    [{ent.subCategory || ent.category}] {ent.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <FieldLabel label="Relationship Type" required />
            <Input
              value={relType}
              onChange={(e) => setRelType(e.target.value)}
              placeholder="e.g., Wielded by, Headquartered in, Mastered by..."
              required
            />
          </div>
          <div>
            <FieldLabel label="Context / Description" />
            <Textarea
              rows={2}
              value={relDesc}
              onChange={(e) => setRelDesc(e.target.value)}
              placeholder="Optional note on this relationship..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1E2436]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLinkSourceEntity(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Relationship
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteEntity(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete Entry"
        description={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />
    </div>
  );
};
