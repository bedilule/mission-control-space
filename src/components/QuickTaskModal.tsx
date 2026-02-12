import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface TeamMember {
  id: string;
  name: string;
  color: string;
  shipImage: string;
}

interface QuickTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  teamMembers: TeamMember[];
  onCreatedForSelf?: (taskName: string, taskType: string, priority: string) => void;
  onCreatedForOther?: (taskName: string, taskType: string, priority: string, assignedTo: string) => void;
  onPositionReady?: (position: { x: number; y: number }, planetId: string) => void;
}

const TASK_TYPES = [
  { value: 'task', label: 'Task', image: '/notion-task.png' },
  { value: 'bug', label: 'Bug', image: '/notion-bug.png' },
  { value: 'feature', label: 'Enhance', image: '/notion-enhancement.png' },
  { value: 'biz', label: 'Biz', image: '/notion-biz.png' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', icon: '📋', color: '#888' },
  { value: 'medium', label: 'Medium', icon: '⚡', color: '#fbbf24' },
  { value: 'high', label: 'High', icon: '🔥', color: '#f97316' },
  { value: 'critical', label: 'Critical', icon: '🧨', color: '#ef4444' },
] as const;

export function QuickTaskModal({ isOpen, onClose, currentUser, teamMembers, onCreatedForSelf, onCreatedForOther, onPositionReady }: QuickTaskModalProps) {
  const [taskContent, setTaskContent] = useState('');
  const [taskType, setTaskType] = useState<'task' | 'bug' | 'feature'>('task');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [autoOpenNotion, setAutoOpenNotion] = useState(
    () => localStorage.getItem('mission-control-auto-open-notion') === 'true'
  );
  const [autoAnalyze, setAutoAnalyze] = useState(
    () => localStorage.getItem('mission-control-auto-analyze') === 'true'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all mic tracks
        stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;

        // Convert to base64
        setIsTranscribing(true);
        try {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          const { data, error } = await supabase.functions.invoke('whisper-transcribe', {
            body: { audio: base64 },
          });

          if (error) {
            console.error('Whisper transcription error:', error);
          } else if (data?.text) {
            setTaskContent(prev => {
              const separator = prev.trim() ? ' ' : '';
              return prev.trim() + separator + data.text.trim();
            });
          }
        } catch (err) {
          console.error('Transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  }, [isRecording, stopRecording]);

  // Stop recording when modal closes
  useEffect(() => {
    if (!isOpen && isRecording) {
      stopRecording();
    }
  }, [isOpen, isRecording, stopRecording]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!taskContent.trim()) return;
    if (isRecording) stopRecording();

    const content = taskContent.trim();

    // Capture values before resetting
    const payload = {
      content,
      type: taskType,
      priority: priority,
      assigned_to: assignedTo || null,
      created_by: currentUser,
      auto_analyze: autoAnalyze,
    };

    // Play voice line + send animation (use content as temp name)
    if (assignedTo === currentUser && onCreatedForSelf) {
      onCreatedForSelf(content, taskType, priority);
    } else if (onCreatedForOther) {
      onCreatedForOther(content, taskType, priority, assignedTo);
    }

    // Reset form and close immediately
    setTaskContent('');
    setTaskType('task');
    setPriority('medium');
    setAssignedTo(currentUser);
    onClose();

    // Create task in background
    supabase.functions.invoke('notion-create', { body: payload })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to create Notion task:', error);
          return;
        }
        if (data?.position && onPositionReady) {
          onPositionReady(data.position, data.planet_id);
        }
        if (autoOpenNotion && data?.notion_url) {
          window.open(data.notion_url, '_blank');
        }
      })
      .catch((error) => {
        console.error('Error creating Notion task:', error);
      });
  };

  const isValid = taskContent.trim();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isValid) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h2 style={styles.modalTitle}>Quick Add Task</h2>

        <div style={styles.formGroup}>
          <div style={{ position: 'relative' }}>
            <textarea
              style={{ ...styles.input, minHeight: 100, resize: 'none', paddingRight: 48 }}
              value={taskContent}
              onChange={(e) => setTaskContent(e.target.value)}
              placeholder={isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'What needs to be done?'}
              autoFocus
              disabled={isTranscribing}
            />
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                background: isRecording ? 'rgba(239, 68, 68, 0.25)' : isTranscribing ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.08)',
                cursor: isTranscribing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                animation: isRecording ? 'mic-pulse 1.5s ease-in-out infinite' : isTranscribing ? 'mic-spin 1s linear infinite' : 'none',
              }}
            >
              {isTranscribing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00c8ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isRecording ? '#ef4444' : '#888'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>
          <style>{`
            @keyframes mic-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
              50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
            }
            @keyframes mic-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Type</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {TASK_TYPES.map(t => {
              const isSelected = taskType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTaskType(t.value as 'task' | 'bug' | 'feature')}
                  style={{
                    ...styles.typePill,
                    borderColor: isSelected ? '#00c8ff' : 'transparent',
                    background: isSelected ? 'rgba(0,200,255,0.12)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <img src={t.image} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  <span style={{ color: isSelected ? '#fff' : '#aaa', fontSize: '0.85rem' }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Priority</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRIORITY_OPTIONS.map(p => {
              const isSelected = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value as 'low' | 'medium' | 'high' | 'critical')}
                  style={{
                    ...styles.typePill,
                    borderColor: isSelected ? p.color : 'transparent',
                    background: isSelected ? `rgba(${hexToRgb(p.color)}, 0.15)` : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>{p.icon}</span>
                  <span style={{ color: isSelected ? p.color : '#aaa', fontSize: '0.85rem' }}>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Assign To</label>
          <div style={styles.playerPillsContainer}>
            {teamMembers.map(member => {
              const isSelected = assignedTo === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setAssignedTo(member.id)}
                  style={{
                    ...styles.playerPill,
                    borderColor: isSelected ? member.color : 'transparent',
                    background: isSelected
                      ? `rgba(${hexToRgb(member.color)}, 0.15)`
                      : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <img
                    src={member.shipImage}
                    alt={member.name}
                    style={{
                      width: 28,
                      height: 28,
                      objectFit: 'contain',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    color: isSelected ? member.color : '#aaa',
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 600 : 400,
                  }}>{member.name}</span>
                </button>
              );
            })}
            {/* Unassigned option - last */}
            <button
              type="button"
              onClick={() => setAssignedTo('')}
              style={{
                ...styles.playerPill,
                borderColor: assignedTo === '' ? '#666' : 'transparent',
                background: assignedTo === '' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                color: '#666',
                flexShrink: 0,
              }}>?</div>
              <span style={{ color: '#888', fontSize: '0.8rem' }}>None</span>
            </button>
          </div>
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

        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => {
              const newValue = !autoOpenNotion;
              setAutoOpenNotion(newValue);
              localStorage.setItem('mission-control-auto-open-notion', String(newValue));
            }}
          >
            <div style={{
              width: 28,
              height: 14,
              borderRadius: 7,
              background: autoOpenNotion ? 'rgba(0, 200, 255, 0.4)' : 'rgba(255,255,255,0.1)',
              position: 'relative',
              transition: 'background 0.2s ease',
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: autoOpenNotion ? '#00c8ff' : '#555',
                position: 'absolute',
                top: 2,
                left: autoOpenNotion ? 16 : 2,
                transition: 'all 0.2s ease',
              }} />
            </div>
            <span style={{ color: autoOpenNotion ? '#00c8ff' : '#555', fontSize: '0.7rem', letterSpacing: '0.02em' }}>
              Open Notion
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => {
              const newValue = !autoAnalyze;
              setAutoAnalyze(newValue);
              localStorage.setItem('mission-control-auto-analyze', String(newValue));
            }}
          >
            <div style={{
              width: 28,
              height: 14,
              borderRadius: 7,
              background: autoAnalyze ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255,255,255,0.1)',
              position: 'relative',
              transition: 'background 0.2s ease',
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: autoAnalyze ? '#a855f7' : '#555',
                position: 'absolute',
                top: 2,
                left: autoAnalyze ? 16 : 2,
                transition: 'all 0.2s ease',
              }} />
            </div>
            <span style={{ color: autoAnalyze ? '#a855f7' : '#555', fontSize: '0.7rem', letterSpacing: '0.02em' }}>
              Claude Agent
            </span>
          </div>
        </div>

        <p style={styles.shortcutHint}>Press Esc to close</p>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
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
    scrollbarWidth: 'none',
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
  typePill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: '2px solid transparent',
    borderRadius: 10,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
    flex: 1,
    justifyContent: 'center',
  },
  playerPillsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px 6px 6px',
    border: '2px solid transparent',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    fontFamily: 'inherit',
  },
  shortcutHint: {
    textAlign: 'center',
    color: '#555',
    fontSize: '0.75rem',
    marginTop: '1rem',
    marginBottom: 0,
  },
};
