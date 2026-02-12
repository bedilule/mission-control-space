import { useState, useEffect, useRef, useMemo } from 'react';
import type { Planet } from '../types';
import type { PlayerInfo } from './LandedPlanetModal';

interface TaskSearchModalProps {
  planets: Planet[];
  playerInfo: Record<string, PlayerInfo>;
  onSelect: (planet: Planet) => void;
  onClose: () => void;
}

const USERS_LIST = [
  { id: 'quentin', name: 'Quentin', color: '#ffa500' },
  { id: 'alex', name: 'Alex', color: '#5490ff' },
  { id: 'armel', name: 'Armel', color: '#4ade80' },
  { id: 'milya', name: 'Milya', color: '#ff6b9d' },
  { id: 'hugues', name: 'Hugues', color: '#8b5cf6' },
];

const USERS_MAP: Record<string, string> = Object.fromEntries(USERS_LIST.map(u => [u.id, u.name]));

const TYPE_OPTIONS = [
  { value: 'task', label: 'Task', icon: '/notion-task.png' },
  { value: 'bug', label: 'Bug', icon: '/notion-bug.png' },
  { value: 'feature', label: 'Feature', icon: '/notion-enhancement.png' },
  { value: 'biz', label: 'Biz', icon: '/notion-biz.png' },
];

const TYPE_ICONS: Record<string, string> = {
  bug: '/notion-bug.png',
  feature: '/notion-enhancement.png',
  enhancement: '/notion-enhancement.png',
  task: '/notion-task.png',
  biz: '/notion-biz.png',
};

const PRIORITY_OPTIONS = [
  { value: 'critical', label: 'Critical', icon: '🧨', color: '#ef4444' },
  { value: 'high', label: 'High', icon: '🔥', color: '#f97316' },
  { value: 'medium', label: 'Medium', icon: '⚡', color: '#eab308' },
  { value: 'low', label: 'Low', icon: '📋', color: '#6b7280' },
];

// Parse priority from raw value that may have emoji prefix like "🔥 High"
function parsePriority(raw: string | null | undefined): string {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

const PRIORITY_COLOR_MAP: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map(p => [p.value, p.color]));

const chipBase: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.5)',
  transition: 'all 0.15s',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
  fontFamily: "'Space Grotesk', sans-serif",
};

export function TaskSearchModal({ planets, playerInfo, onSelect, onClose }: TaskSearchModalProps) {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let results = planets;

    // Text search
    if (q) {
      results = results.filter(p => p.name.toLowerCase().includes(q));
    }

    // Type filter
    if (filterType) {
      results = results.filter(p => {
        const t = p.taskType || 'task';
        if (filterType === 'feature') return t === 'feature' || t === 'enhancement';
        return t === filterType;
      });
    }

    // Priority filter (raw values may have emoji prefix like "🔥 High")
    if (filterPriority) {
      results = results.filter(p => parsePriority(p.priority) === filterPriority);
    }

    // User filter
    if (filterUser) {
      results = results.filter(p => p.ownerId === filterUser);
    }

    // Incomplete first, then newest first by creation date
    results = [...results].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dateA = a.createdAt || '';
      const dateB = b.createdAt || '';
      return dateB.localeCompare(dateA); // newest first
    });
    return results.slice(0, 30);
  }, [planets, query, filterType, filterPriority, filterUser]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, filterType, filterPriority, filterUser]);

  // Scroll highlighted item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const item = container.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlightIndex]) {
      e.preventDefault();
      onSelect(filtered[highlightIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const toggleFilter = <T,>(current: T | null, value: T, setter: (v: T | null) => void) => {
    setter(current === value ? null : value);
  };

  const hasFilters = filterType || filterPriority || filterUser;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '12vh',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        width: 560, maxHeight: '70vh',
        background: '#12121e',
        border: '1px solid rgba(0,200,255,0.25)',
        borderRadius: 12,
        boxShadow: '0 0 40px rgba(0,200,255,0.1), 0 20px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Space Grotesk', sans-serif",
      }} onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00c8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#e0e0e0', fontSize: 15,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          {hasFilters && (
            <span
              onClick={() => { setFilterType(null); setFilterPriority(null); setFilterUser(null); }}
              style={{
                fontSize: 11, color: '#00c8ff', cursor: 'pointer',
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(0,200,255,0.1)',
              }}
            >Clear</span>
          )}
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.3)',
            padding: '2px 6px', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
          }}>ESC</span>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Type filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', width: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Type</span>
            {TYPE_OPTIONS.map(t => {
              const active = filterType === t.value;
              return (
                <span
                  key={t.value}
                  onClick={() => toggleFilter(filterType, t.value, setFilterType)}
                  style={{
                    ...chipBase,
                    ...(active ? {
                      background: 'rgba(0,200,255,0.15)',
                      borderColor: 'rgba(0,200,255,0.4)',
                      color: '#00c8ff',
                    } : {}),
                  }}
                >
                  <img src={t.icon} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                  {t.label}
                </span>
              );
            })}
          </div>

          {/* Priority filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', width: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Priority</span>
            {PRIORITY_OPTIONS.map(p => {
              const active = filterPriority === p.value;
              return (
                <span
                  key={p.value}
                  onClick={() => toggleFilter(filterPriority, p.value, setFilterPriority)}
                  style={{
                    ...chipBase,
                    ...(active ? {
                      background: `${p.color}20`,
                      borderColor: `${p.color}60`,
                      color: p.color,
                    } : {}),
                  }}
                >
                  <span style={{ fontSize: 12 }}>{p.icon}</span>
                  {p.label}
                </span>
              );
            })}
          </div>

          {/* User filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', width: 48, flexShrink: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Player</span>
            {USERS_LIST.map(u => {
              const active = filterUser === u.id;
              const ship = playerInfo[u.id]?.shipImage;
              return (
                <span
                  key={u.id}
                  onClick={() => toggleFilter(filterUser, u.id, setFilterUser)}
                  style={{
                    ...chipBase,
                    ...(active ? {
                      background: `${u.color}20`,
                      borderColor: `${u.color}60`,
                      color: u.color,
                    } : {}),
                  }}
                >
                  {ship && <img src={ship} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />}
                  {u.name}
                </span>
              );
            })}
          </div>
        </div>

        {/* Count */}
        <div style={{
          padding: '6px 16px',
          fontSize: 11, color: 'rgba(255,255,255,0.25)',
        }}>
          {filtered.length}{filtered.length === 30 ? '+' : ''} results
        </div>

        {/* Results */}
        <div ref={listRef} className="task-search-list" style={{
          overflowY: 'auto', flex: 1,
          scrollbarWidth: 'none', msOverflowStyle: 'none',
        }}>
          <style>{`.task-search-list::-webkit-scrollbar { display: none; }`}</style>
          {filtered.length === 0 ? (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'rgba(255,255,255,0.3)', fontSize: 13,
            }}>No tasks found</div>
          ) : (
            filtered.map((planet, i) => {
              const owner = planet.ownerId;
              const ownerName = owner ? USERS_MAP[owner] || owner : null;
              const ownerColor = owner ? playerInfo[owner]?.color || '#888' : null;
              const typeIcon = TYPE_ICONS[planet.taskType || 'task'] || TYPE_ICONS.task;
              const priorityColor = PRIORITY_COLOR_MAP[parsePriority(planet.priority)] || null;
              const ownerShip = owner ? playerInfo[owner]?.shipImage : null;

              return (
                <div
                  key={planet.id}
                  onClick={() => onSelect(planet)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: i === highlightIndex ? 'rgba(0,200,255,0.08)' : 'transparent',
                    opacity: planet.completed ? 0.4 : 1,
                    transition: 'background 0.1s',
                  }}
                >
                  <img src={typeIcon} alt="" style={{
                    width: 22, height: 22, objectFit: 'contain',
                    filter: planet.completed ? 'grayscale(1)' : 'none',
                  }} />

                  <span style={{
                    flex: 1, fontSize: 13, color: '#e0e0e0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: planet.completed ? 'line-through' : 'none',
                  }}>{planet.name}</span>

                  {priorityColor && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: priorityColor, flexShrink: 0,
                    }} />
                  )}

                  {ownerName && (
                    <span style={{
                      fontSize: 11, color: ownerColor || '#888',
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {ownerShip && <img src={ownerShip} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                      {ownerName}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
