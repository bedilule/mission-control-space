import { useState, useEffect } from 'react';
import type { Planet } from '../types';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: EditTaskUpdates) => void;
  planet: Planet;
}

export interface EditTaskUpdates {
  name?: string;
  description?: string;
  task_type?: 'bug' | 'feature' | 'task' | 'biz';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  due_date?: string | null;
  assigned_to?: string | null;
}

const TEAM_MEMBERS = [
  { id: '', name: 'Unassigned' },
  { id: 'quentin', name: 'Quentin' },
  { id: 'armel', name: 'Armel' },
  { id: 'alex', name: 'Alex' },
  { id: 'milya', name: 'Milya' },
  { id: 'hugues', name: 'Hugues' },
];

// Parse priority from planet.priority which may have emoji prefix like "🔥 High"
function parsePriority(raw: string | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  if (!raw) return 'medium';
  const lower = raw.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high')) return 'high';
  if (lower.includes('low')) return 'low';
  return 'medium';
}

// Parse task type from planet.taskType
function parseTaskType(raw: string | null | undefined): 'bug' | 'feature' | 'task' | 'biz' {
  if (!raw) return 'task';
  const lower = raw.toLowerCase();
  if (lower.includes('bug')) return 'bug';
  if (lower.includes('feature') || lower.includes('enhancement')) return 'feature';
  if (lower.includes('biz')) return 'biz';
  return 'task';
}

export function EditTaskModal({ isOpen, onClose, onSave, planet }: EditTaskModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<'bug' | 'feature' | 'task' | 'biz'>('task');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  // Pre-fill form when planet changes
  useEffect(() => {
    if (planet) {
      setName(planet.name || '');
      setDescription(planet.description || '');
      setTaskType(parseTaskType(planet.taskType));
      setPriority(parsePriority(planet.priority));
      setDueDate(planet.targetDate || '');
      setAssignedTo(planet.ownerId || '');
    }
  }, [planet]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;

    const updates: EditTaskUpdates = {};

    if (name.trim() !== (planet.name || '')) {
      updates.name = name.trim();
    }
    if (description !== (planet.description || '')) {
      updates.description = description;
    }
    if (taskType !== parseTaskType(planet.taskType)) {
      updates.task_type = taskType;
    }
    if (priority !== parsePriority(planet.priority)) {
      updates.priority = priority;
    }
    const originalDate = planet.targetDate || '';
    if (dueDate !== originalDate) {
      updates.due_date = dueDate || null;
    }
    if (assignedTo !== (planet.ownerId || '')) {
      updates.assigned_to = assignedTo || null;
    }

    // Only save if something changed
    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target as HTMLElement).tagName.match(/TEXTAREA/i) && name.trim()) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2 style={styles.modalTitle}>Edit Task</h2>

        <div style={styles.formGroup}>
          <label style={styles.label}>Title</label>
          <input
            type="text"
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Description</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div style={styles.formRow}>
          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Type</label>
            <select
              style={styles.select}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as 'task' | 'bug' | 'feature' | 'biz')}
            >
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="feature">Enhancement</option>
              <option value="biz">Biz</option>
            </select>
          </div>

          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Priority</label>
            <select
              style={styles.select}
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div style={styles.formRow}>
          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Due Date</label>
            <input
              type="date"
              style={styles.input}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Assign To</label>
            <select
              style={styles.select}
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              {TEAM_MEMBERS.map(member => (
                <option key={member.id} value={member.id}>{member.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={styles.modalButtons}>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...styles.saveButton,
              opacity: !name.trim() ? 0.5 : 1,
              cursor: !name.trim() ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save Changes
          </button>
        </div>

        <p style={styles.shortcutHint}>Press Esc to close</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1a2e',
    borderRadius: 16,
    padding: '2rem',
    width: '90%',
    maxWidth: 420,
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid #a78bfa',
    boxShadow: '0 0 30px rgba(167, 139, 250, 0.2)',
    scrollbarWidth: 'none' as const,
    msOverflowStyle: 'none' as const,
  },
  modalTitle: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '1.5rem',
    color: '#a78bfa',
    marginTop: 0,
    marginBottom: '1.5rem',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  formRow: {
    display: 'flex',
    gap: '1rem',
  },
  label: {
    display: 'block',
    color: '#888',
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#fff',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  select: {
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  modalButtons: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 8,
    color: '#888',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 600,
  },
  shortcutHint: {
    textAlign: 'center',
    color: '#555',
    fontSize: '0.75rem',
    marginTop: '1rem',
    marginBottom: 0,
  },
};
