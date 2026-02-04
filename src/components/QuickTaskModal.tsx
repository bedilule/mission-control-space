import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
}

const TEAM_MEMBERS = [
  { id: '', name: 'Unassigned' },
  { id: 'quentin', name: 'Quentin' },
  { id: 'armel', name: 'Armel' },
  { id: 'alex', name: 'Alex' },
  { id: 'milya', name: 'Milya' },
  { id: 'hugues', name: 'Hugues' },
];

export function QuickTaskModal({ isOpen, onClose, currentUser }: QuickTaskModalProps) {
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<'task' | 'bug' | 'feature'>('task');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [assignedTo, setAssignedTo] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!taskName.trim()) return;

    // Capture values before resetting
    const payload = {
      name: taskName.trim(),
      description: description.trim() || null,
      type: taskType,
      priority: priority,
      assigned_to: assignedTo || null,
      created_by: currentUser,
    };

    // Reset form and close immediately
    setTaskName('');
    setDescription('');
    setTaskType('task');
    setPriority('medium');
    setAssignedTo('');
    onClose();

    // Create task in background
    supabase.functions.invoke('notion-create', { body: payload })
      .then(({ error }) => {
        if (error) {
          console.error('Failed to create Notion task:', error);
        }
      })
      .catch((error) => {
        console.error('Error creating Notion task:', error);
      });
  };

  const isValid = taskName.trim();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target as HTMLElement).tagName.match(/TEXTAREA/i) && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2 style={styles.modalTitle}>Quick Add Task</h2>

        <div style={styles.formGroup}>
          <label style={styles.label}>Task Name</label>
          <input
            type="text"
            style={styles.input}
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="What needs to be done?"
            autoFocus
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Description</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details..."
          />
        </div>

        <div style={styles.formRow}>
          <div style={{ ...styles.formGroup, flex: 1 }}>
            <label style={styles.label}>Type</label>
            <select
              style={styles.select}
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as 'task' | 'bug' | 'feature')}
            >
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
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

        <div style={styles.formGroup}>
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

        <div style={styles.modalButtons}>
          <button
            style={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.saveButton,
              opacity: !isValid ? 0.5 : 1,
              cursor: !isValid ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Create Task
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
    border: '1px solid #00c8ff',
    boxShadow: '0 0 30px rgba(0, 200, 255, 0.2)',
  },
  modalTitle: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: '1.5rem',
    color: '#00c8ff',
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
    boxSizing: 'border-box',
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
    background: 'linear-gradient(90deg, #00c8ff, #0088cc)',
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
