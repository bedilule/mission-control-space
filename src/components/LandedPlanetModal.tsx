import { useState, useEffect, useRef, useCallback } from 'react';
import type { Planet } from '../types';
import type { EditTaskUpdates } from './EditTaskModal';

export interface PlayerInfo {
  color: string;
  shipImage: string;
}

interface LandedPlanetModalProps {
  planet: Planet;
  currentUser: string;
  destroyCanonEquipped: boolean;
  playerInfo: Record<string, PlayerInfo>;
  mode?: 'landed' | 'featured';
  onComplete: (planet: Planet) => void;
  onClaim: (planet: Planet) => void;
  onSend: (planet: Planet, newOwner: string) => void;
  onOpenNotion: (url: string) => void;
  onDelete: (planet: Planet) => void;
  onTakeOff: () => void;
  onUpdate: (updates: EditTaskUpdates) => void;
  onFeatureToggle?: (planet: Planet) => void;
}

const TEAM_MEMBERS = [
  { id: 'quentin', name: 'Quentin' },
  { id: 'alex', name: 'Alex' },
  { id: 'armel', name: 'Armel' },
  { id: 'milya', name: 'Milya' },
  { id: 'hugues', name: 'Hugues' },
  { id: '', name: 'Unassigned' },
];

const TASK_TYPES = [
  { value: 'task', label: 'Task', image: '/notion-task.png' },
  { value: 'bug', label: 'Bug', image: '/notion-bug.png' },
  { value: 'feature', label: 'Feature', image: '/notion-enhancement.png' },
];

const PRIORITIES: { value: string; label: string; points: number }[] = [
  { value: 'critical', label: 'Critical', points: 120 },
  { value: 'high', label: 'High', points: 80 },
  { value: 'medium', label: 'Medium', points: 50 },
  { value: 'low', label: 'Low', points: 30 },
];

function parsePriority(raw: string | null | undefined): string {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

function parseTaskType(raw: string | null | undefined): string {
  if (!raw) return 'task';
  const lower = raw.toLowerCase();
  if (lower.includes('bug')) return 'bug';
  if (lower.includes('feature') || lower.includes('enhancement')) return 'feature';
  return 'task';
}

function getTaskTypeImage(taskType: string): string {
  const found = TASK_TYPES.find(t => t.value === taskType);
  return found?.image || '/notion-task.png';
}

function formatDateDDMMYY(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  } catch {
    return dateStr;
  }
}

type EditingField = 'name' | 'description' | null;

export function LandedPlanetModal({
  planet,
  currentUser,
  destroyCanonEquipped,
  playerInfo,
  mode = 'landed',
  onComplete,
  onClaim,
  onOpenNotion,
  onDelete,
  onTakeOff,
  onUpdate,
  onFeatureToggle,
}: LandedPlanetModalProps) {
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editName, setEditName] = useState(planet.name || '');
  const [editDescription, setEditDescription] = useState(planet.description || '');
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const isOwn = planet.ownerId === currentUser;
  const isUnassigned = !planet.ownerId || planet.ownerId === '';
  const isCompleted = planet.completed;
  const isFeaturedView = mode === 'featured';
  const isEditable = !isCompleted;

  const priority = parsePriority(planet.priority);
  const taskType = parseTaskType(planet.taskType);
  const priorityInfo = PRIORITIES.find(p => p.value === priority) || PRIORITIES[2];
  const planetImage = getTaskTypeImage(taskType);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setAssignDropdownOpen(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingField === 'name' && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
    if (editingField === 'description' && descInputRef.current) {
      descInputRef.current.focus();
    }
  }, [editingField]);

  // Commit field edits
  const commitName = useCallback(() => {
    setEditingField(null);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== planet.name) {
      onUpdate({ name: trimmed });
    } else {
      setEditName(planet.name || '');
    }
  }, [editName, planet.name, onUpdate]);

  const commitDescription = useCallback(() => {
    setEditingField(null);
    if (editDescription !== (planet.description || '')) {
      onUpdate({ description: editDescription });
    }
  }, [editDescription, planet.description, onUpdate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingField !== null || assignDropdownOpen || typeDropdownOpen) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const key = e.key.toLowerCase();

      if (key === ' ' || key === 'escape') {
        e.preventDefault();
        onTakeOff();
        return;
      }

      if (key === 'f' && onFeatureToggle && isOwn) {
        e.preventDefault();
        onFeatureToggle(planet);
        return;
      }

      if (key === 'c' && !isCompleted && !isFeaturedView) {
        e.preventDefault();
        if (isUnassigned) {
          onClaim(planet);
        } else if (isOwn) {
          onComplete(planet);
        }
        return;
      }

      if (key === 'n') {
        e.preventDefault();
        if (planet.notionUrl) onOpenNotion(planet.notionUrl);
        return;
      }

      if (key === 'x' && !isFeaturedView) {
        e.preventDefault();
        if (!isCompleted || (isCompleted && destroyCanonEquipped)) onDelete(planet);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingField, assignDropdownOpen, typeDropdownOpen, planet, currentUser, isOwn, isUnassigned, isCompleted, isFeaturedView, destroyCanonEquipped, onTakeOff, onComplete, onClaim, onOpenNotion, onDelete, onFeatureToggle]);

  // Actions
  const showComplete = isOwn && !isCompleted && !isFeaturedView;
  const showClaim = isUnassigned && !isCompleted && !isFeaturedView;
  const showNotion = !!planet.notionUrl;
  const showDelete = (!isCompleted || (isCompleted && destroyCanonEquipped)) && !isFeaturedView;

  // Current assigned player info
  const currentAssigned = TEAM_MEMBERS.find(m => m.id === (planet.ownerId || ''));
  const currentAssignedColor = planet.ownerId ? (playerInfo[planet.ownerId]?.color || '#888') : '#555';
  const currentAssignedShip = planet.ownerId ? playerInfo[planet.ownerId]?.shipImage : null;

  // Current type info
  const currentTypeInfo = TASK_TYPES.find(t => t.value === taskType) || TASK_TYPES[0];

  return (
    <div style={styles.overlay}>
      <style>{`
        .landed-modal::-webkit-scrollbar { display: none; }
        .landed-date-input { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
        .landed-modal input { border-radius: 10px; }
        .landed-dropdown-item:hover { background: rgba(255,255,255,0.08) !important; }
      `}</style>
      <div
        className="landed-modal"
        style={{
          ...styles.modal,
          borderColor: planet.color + '44',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header: planet image + status + points */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <img
              src={planetImage}
              alt=""
              style={{
                width: 52,
                height: 52,
                objectFit: 'contain',
                borderRadius: 10,
                filter: `drop-shadow(0 0 8px ${planet.color}66)`,
              }}
            />
            <div>
              <div style={styles.statusBadge}>
                <span style={{
                  ...styles.statusDot,
                  background: isCompleted ? '#4ade80' : (isFeaturedView ? '#ffd700' : planet.color),
                  boxShadow: `0 0 8px ${isCompleted ? '#4ade80' : (isFeaturedView ? '#ffd700' : planet.color)}66`,
                }} />
                <span style={{ ...styles.statusLabel, color: isCompleted ? '#4ade80' : (isFeaturedView ? '#ffd700' : planet.color) }}>
                  {isCompleted ? 'COMPLETED' : (isFeaturedView ? 'FEATURED' : 'LANDED')}
                </span>
              </div>
            </div>
          </div>
          <div style={styles.pointsCorner}>
            {planet.points || priorityInfo.points} pts
          </div>
        </div>

        {/* Title */}
        <div style={styles.section}>
          <label style={styles.label}>Title</label>
          {editingField === 'name' && isEditable ? (
            <input
              ref={nameInputRef}
              style={styles.input}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setEditName(planet.name || ''); setEditingField(null); }
              }}
            />
          ) : (
            <div
              style={{
                ...styles.fieldDisplay,
                cursor: isEditable ? 'pointer' : 'default',
              }}
              onClick={() => { if (isEditable) { setEditName(planet.name || ''); setEditingField('name'); } }}
            >
              <span style={styles.titleText}>{planet.name}</span>
            </div>
          )}
        </div>

        {/* Description */}
        <div style={styles.section}>
          <label style={styles.label}>Description</label>
          {editingField === 'description' && isEditable ? (
            <textarea
              ref={descInputRef}
              style={{ ...styles.input, minHeight: 80, resize: 'vertical' as const }}
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              onBlur={commitDescription}
              onKeyDown={e => {
                if (e.key === 'Escape') { setEditDescription(planet.description || ''); setEditingField(null); }
              }}
            />
          ) : (
            <div
              style={{
                ...styles.fieldDisplay,
                cursor: isEditable ? 'pointer' : 'default',
                color: planet.description ? '#ccc' : '#444',
                minHeight: 40,
              }}
              onClick={() => { if (isEditable) { setEditDescription(planet.description || ''); setEditingField('description'); } }}
            >
              {planet.description || (isEditable ? 'Click to add...' : 'No description')}
            </div>
          )}
        </div>

        {/* Properties row: Type, Priority, Due Date */}
        <div style={styles.propsRow}>
          {/* Type — custom dropdown with task skin icons */}
          <div style={styles.propField} ref={typeDropdownRef}>
            <label style={styles.label}>Type</label>
            <div
              style={{
                ...styles.dropdownTrigger,
                cursor: isEditable ? 'pointer' : 'default',
                opacity: isEditable ? 1 : 0.5,
              }}
              onClick={() => { if (isEditable) setTypeDropdownOpen(!typeDropdownOpen); }}
            >
              <img src={currentTypeInfo.image} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
              <span>{currentTypeInfo.label}</span>
            </div>
            {typeDropdownOpen && (
              <div style={styles.dropdownMenu}>
                {TASK_TYPES.map(t => (
                  <div
                    key={t.value}
                    className="landed-dropdown-item"
                    style={{
                      ...styles.dropdownItem,
                      background: t.value === taskType ? 'rgba(255,255,255,0.06)' : 'transparent',
                    }}
                    onClick={() => {
                      onUpdate({ task_type: t.value as 'bug' | 'feature' | 'task' });
                      setTypeDropdownOpen(false);
                    }}
                  >
                    <img src={t.image} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority — native select (no visual enhancement needed) */}
          <div style={styles.propField}>
            <label style={styles.label}>Priority</label>
            <select
              style={styles.select}
              value={priority}
              disabled={!isEditable}
              onChange={e => onUpdate({ priority: e.target.value as 'low' | 'medium' | 'high' | 'critical' })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Due Date */}
          <div style={styles.propField}>
            <label style={styles.label}>Due Date</label>
            <input
              ref={dateInputRef}
              type="date"
              className="landed-date-input"
              value={planet.targetDate || ''}
              disabled={!isEditable}
              onChange={e => onUpdate({ due_date: e.target.value || null })}
            />
            <div
              style={{
                ...styles.dateDisplay,
                cursor: isEditable ? 'pointer' : 'default',
                color: planet.targetDate ? '#fff' : '#444',
              }}
              onClick={() => { if (isEditable) dateInputRef.current?.showPicker?.(); }}
            >
              {planet.targetDate ? formatDateDDMMYY(planet.targetDate) : 'No date'}
            </div>
          </div>
        </div>

        {/* Assigned To — custom dropdown with colored names + ship previews */}
        <div style={styles.section} ref={assignDropdownRef}>
          <label style={styles.label}>Assigned To</label>
          <div
            style={{
              ...styles.dropdownTrigger,
              cursor: isEditable ? 'pointer' : 'default',
              opacity: isEditable ? 1 : 0.5,
            }}
            onClick={() => { if (isEditable) setAssignDropdownOpen(!assignDropdownOpen); }}
          >
            {currentAssignedShip && (
              <img src={currentAssignedShip} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
            )}
            <span style={{ color: currentAssignedColor }}>
              {currentAssigned?.name || 'Unassigned'}
            </span>
          </div>
          {assignDropdownOpen && (
            <div style={styles.dropdownMenu}>
              {TEAM_MEMBERS.map(m => {
                const info = m.id ? playerInfo[m.id] : null;
                const color = info?.color || '#555';
                const ship = info?.shipImage;
                const isSelected = m.id === (planet.ownerId || '');
                return (
                  <div
                    key={m.id}
                    className="landed-dropdown-item"
                    style={{
                      ...styles.dropdownItem,
                      background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
                    }}
                    onClick={() => {
                      onUpdate({ assigned_to: m.id || null });
                      setAssignDropdownOpen(false);
                    }}
                  >
                    {ship ? (
                      <img src={ship} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                    ) : (
                      <div style={{ width: 22, height: 22 }} />
                    )}
                    <span style={{ color }}>{m.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Actions */}
        <div style={styles.actionsSection}>
          <div style={styles.actionsLeft}>
            {showComplete && (
              <span style={{ ...styles.actionText, color: '#4ade80' }} onClick={() => onComplete(planet)}>
                [ C ] Complete
              </span>
            )}
            {showClaim && (
              <span style={{ ...styles.actionText, color: '#ffd700' }} onClick={() => onClaim(planet)}>
                [ C ] Claim Mission
              </span>
            )}
            {showDelete && (
              <span style={{ ...styles.actionText, color: '#ff4444' }} onClick={() => onDelete(planet)}>
                [ X ] {isCompleted ? 'Detonate Planet' : 'Delete'}
              </span>
            )}
          </div>
          <div style={styles.actionsRight}>
            {showNotion && (
              <span style={{ ...styles.actionText, color: '#5490ff' }} onClick={() => planet.notionUrl && onOpenNotion(planet.notionUrl)}>
                [ N ] Notion
              </span>
            )}
          </div>
        </div>

        {/* Hint for completed planets without weapon */}
        {isCompleted && !destroyCanonEquipped && (
          <div style={styles.shopHint}>Equip weapons in Shop to destroy</div>
        )}

        {/* Close hint */}
        <div style={styles.takeOffRow}>
          <span style={styles.takeOffText} onClick={onTakeOff}>
            [ ESC ] to close
          </span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#12121e',
    borderRadius: 18,
    padding: '32px 36px 28px',
    width: '94%',
    maxWidth: 600,
    maxHeight: '92vh',
    overflowY: 'auto' as const,
    border: '1px solid',
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusLabel: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '0.7rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
  },
  pointsCorner: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '0.85rem',
    color: '#ffd700',
    fontWeight: 600,
    background: 'rgba(255,215,0,0.08)',
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid rgba(255,215,0,0.15)',
  },

  // Form sections
  section: {
    marginBottom: 20,
    position: 'relative' as const,
  },
  label: {
    display: 'block',
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: '0.7rem',
    color: '#666',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  fieldDisplay: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
    fontSize: '1rem',
    color: '#fff',
    fontFamily: 'Space Grotesk, sans-serif',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
  },
  titleText: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 600,
    fontSize: '1.1rem',
    color: '#fff',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 10,
    color: '#fff',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'Space Grotesk, sans-serif',
    lineHeight: 1.5,
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },
  select: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 10,
    color: '#fff',
    fontSize: '0.95rem',
    fontFamily: 'Space Grotesk, sans-serif',
    cursor: 'pointer',
    outline: 'none',
  },

  // Custom dropdown
  dropdownTrigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 10,
    fontSize: '0.95rem',
    fontFamily: 'Space Grotesk, sans-serif',
    color: '#fff',
  },
  dropdownMenu: {
    marginTop: 4,
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontFamily: 'Space Grotesk, sans-serif',
    color: '#fff',
    transition: 'background 0.15s',
  },

  // Properties row
  propsRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 20,
  },
  propField: {
    flex: 1,
    position: 'relative' as const,
  },

  // Date display
  dateDisplay: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 10,
    fontSize: '0.95rem',
    fontFamily: 'Space Grotesk, sans-serif',
  },

  // Divider
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    margin: '24px 0',
  },

  // Actions
  actionsSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  actionsLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  actionsRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    textAlign: 'right' as const,
  },
  actionText: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
  },

  // Shop hint
  shopHint: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: '0.75rem',
    color: '#555',
    marginTop: 12,
  },

  // Take off
  takeOffRow: {
    textAlign: 'center' as const,
    marginTop: 24,
  },
  takeOffText: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.3)',
    cursor: 'pointer',
  },
};
