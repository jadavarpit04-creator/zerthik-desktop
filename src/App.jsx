import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Blocks,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  Clipboard,
  Code2,
  Command,
  Copy,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  Home,
  Keyboard,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Mic,
  Palette,
  PenLine,
  Play,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  commands as baseCommands,
  mcpServers as baseMcpServers,
  shortcuts as baseShortcuts,
} from './data.js';
import BrandLogo, { hasBrandLogo, domainFromUrl } from './brandLogos.jsx';
import { isTauri, readClipboardText, writeClipboardText, openExternal, onFocusSearch } from './native.js';
import { connectServer, disconnectServer, callServerTool, readServerResource, loadServers, saveServers, isValidHttpUrl } from './mcp/store.js';
import { argsSkeleton } from './mcp/policy.js';
import zerthikLogo from './assets/zerthik-logo.png';

const cx = (...parts) => parts.filter(Boolean).join(' ');

function readStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in restricted previews; in-memory state still works.
  }
}

function hasCompletedOnboarding() {
  // Marketing live demo (?demo=1) opens straight on the ready command card.
  try {
    if (new URLSearchParams(window.location.search).get('demo') === '1') return true;
  } catch {
    // fall through to stored state
  }
  return readStoredValue('zerthik-onboarding-complete') === '1';
}

function isEmbedMode() {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
}

function storedOnboardingStep() {
  const value = Number(readStoredValue('zerthik-onboarding-step') || 0);
  return Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0;
}

function loadUsage() {
  try {
    const parsed = JSON.parse(readStoredValue('zerthik-usage') || 'null');
    if (parsed && typeof parsed.count === 'number' && Array.isArray(parsed.events)) return parsed;
  } catch {
    // corrupted storage falls back to a clean slate
  }
  return { count: 0, events: [] };
}

function storedTheme() {
  const value = readStoredValue('zerthik-theme');
  return ['transparent', 'black'].includes(value) ? value : 'transparent';
}

function fuzzyIncludes(query, value) {
  const q = query.trim().toLowerCase();
  const text = String(value || '').toLowerCase();
  if (!q) return true;
  if (text.includes(q)) return true;
  let cursor = 0;
  for (const char of text) {
    if (char === q[cursor]) cursor += 1;
    if (cursor === q.length) return true;
  }
  return false;
}

function sentenceList(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((item) => item.trim())
    .filter(Boolean) || [];
}

function tidyText(text) {
  return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function polishSentences(text) {
  return sentenceList(text)
    .map((sentence) => {
      let next = sentence
        .replace(/\bi\b/g, 'I')
        .replace(/\s+,/g, ',')
        .replace(/\s+\./g, '.')
        .trim();
      next = next.charAt(0).toUpperCase() + next.slice(1);
      if (!/[.!?]$/.test(next)) next += '.';
      return next;
    })
    .join(' ');
}

function generateOutput(type, rawText) {
  const text = tidyText(rawText);
  if (!text) return 'Add some source text first — select text in any app, copy something to the clipboard, or type into the Source text box — then Generate.';
  const sentences = sentenceList(text);
  const polished = polishSentences(text);

  switch (type) {
    case 'grammar':
      return polished;
    case 'rewrite':
      return polished
        .replace(/just checking/gi, 'I wanted to check')
        .replace(/got a chance/gi, 'had an opportunity')
        .replace(/let me know/gi, 'please let me know')
        .replace(/Thanks!/g, 'Thank you.');
    case 'professional':
      return polished
        .replace(/^Hey[,!]?\s*/i, 'Hello, ')
        .replace(/just checking/gi, 'I am following up')
        .replace(/got a chance/gi, 'had an opportunity')
        .replace(/Thanks!/g, 'Thank you for your time.');
    case 'shorten': {
      const words = polished.split(/\s+/);
      return words.length > 42 ? `${words.slice(0, 42).join(' ')}…` : polished;
    }
    case 'summarize':
      return sentences.slice(0, 5).map((sentence) => `• ${sentence.replace(/[.!?]+$/, '')}`).join('\n');
    case 'expand':
      return `I hope you are doing well.\n\n${polished}\n\nPlease let me know if you would like any additional context or a short call to walk through the details. I appreciate your time and look forward to your response.`;
    case 'translate':
      return `Translated preview\n\n${polished
        .replace(/^Hey/i, 'Hola')
        .replace(/Please let me know/gi, 'Por favor, avísame')
        .replace(/Thank you/gi, 'gracias')
        .replace(/Thanks/gi, 'gracias')}`;
    case 'email': {
      const subjectWords = polished.split(/\s+/).slice(0, 7).join(' ').replace(/[.!?]+$/, '');
      return `Subject: ${subjectWords}\n\nHello,\n\n${polished.replace(/^Hello,\s*/i, '')}\n\nBest regards`;
    }
    case 'actions':
      return sentences.map((sentence) => `- [ ] ${sentence.replace(/[.!?]+$/, '')}`).join('\n');
    case 'explain':
      return `In simple terms:\n\n${sentences.slice(0, 3).join(' ')}\n\nKey point: ${sentences[0] || polished}`;
    case 'issue':
      return `## Summary\n${sentences[0] || 'Issue reported from the current context.'}\n\n## Evidence\n${text}\n\n## Expected result\nThe workflow completes without an error.\n\n## Actual result\nThe workflow stops and requires investigation.\n\n## Next step\nReproduce with the attached context and add a regression test.`;
    case 'nudge': {
      const followUp = polished
        .replace(/^Hey[,!]? */i, '')
        .replace(/just checking if you got a chance to/gi, 'I wanted to follow up and see if you have had a chance to')
        .replace(/We need your approval/gi, 'We would appreciate your approval')
        .replace(/Please let me know if anything is unclear/gi, 'Please let me know if anything needs clarification')
        .replace(/Thanks!/g, 'Thank you.');
      return `Hi,\n\n${followUp}`;
    }
    case 'table': {
      const segments = text.split(/,|\n/).map((part) => part.trim()).filter(Boolean);
      const rows = segments.map((segment) => {
        const match = segment.match(/^(.*?)[\s:]+(-?[\d,.]+\s*(?:%|ms|s|k|m)?)$/i);
        return match ? `| ${match[1]} | ${match[2]} |` : `| ${segment} | — |`;
      });
      return ['| Metric | Value |', '| --- | ---: |', ...rows].join('\n');
    }
    case 'codeTypes': {
      const keys = [...text.matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]);
      const fields = (keys.length ? [...new Set(keys)] : ['selectedText', 'activeApp', 'clipboardText'])
        .map((key) => `  ${key}: string;`)
        .join('\n');
      return `export interface ContextPayload {\n${fields}\n}`;
    }
    case 'diff': {
      const lines = text.split('\n').filter(Boolean);
      const added = lines.filter((line) => line.trim().startsWith('+')).length;
      const removed = lines.filter((line) => line.trim().startsWith('-')).length;
      return `Summary: ${sentences.slice(0, 2).join(' ') || polished}\n\nChanges detected: ${added} additions, ${removed} removals.\n\nWhat could break: Review renamed fields, changed defaults and anything that depends on the previous output shape.`;
    }
    case 'fixture':
      return `\`\`\`json\n${JSON.stringify({ name: 'context-fixture', input: text.slice(0, 280) }, null, 2)}\n\`\`\``;
    case 'commit': {
      const subject = (sentences[0] || polished).replace(/[.!?]+$/, '').toLowerCase();
      return `feat: ${subject.charAt(0).toLowerCase()}${subject.slice(1)}\n\n- Preserve the existing behaviour and facts from the source context.`;
    }
    case 'regex': {
      const examples = text.split(/[\n,]/).map((part) => part.trim()).filter(Boolean).slice(0, 6);
      const escaped = examples.map((example) => example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return `/^(${escaped.join('|')})$/`;
    }
    case 'investor':
      return `## Investor update\n\n### Highlights\n${sentences.slice(0, 3).map((sentence) => `- ${sentence.replace(/[.!?]+$/, '')}`).join('\n')}\n\n### Next step\n${sentences[sentences.length - 1] || 'Confirm the next milestone and owner.'}`;
    case 'notes':
      return `## Decisions\n${sentences.slice(0, 2).map((sentence) => `- ${sentence.replace(/[.!?]+$/, '')}`).join('\n') || '- None stated'}\n\n## Action items\n${sentences.map((sentence) => `- [ ] ${sentence.replace(/[.!?]+$/, '')}`).join('\n')}\n\n## Open questions\n- Anything not explicitly decided in the source.`;
    case 'variants': {
      const core = sentences[0] || polished;
      return `Bold: ${core}\n\nCalm: ${core}\n\nPlayful: ${core}`;
    }
    case 'reply':
      return `Hi, thank you for reaching out. ${polished.replace(/^Hey[,!]?\s*/i, '')} Please let us know if anything else would help.`;
    case 'triage':
      return `Problem: ${sentences[0] || polished}\nUrgency: Not stated in the source.\nNext step: ${sentences[1] || 'Confirm the requested outcome and deadline.'}`;
    case 'extract': {
      const order = text.match(/(?:order\s*(?:id|#)?\s*[:#]?\s*)([A-Za-z0-9-]+)/i)?.[1] || 'Not stated';
      const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || 'Not stated';
      return `| Field | Value |\n| --- | --- |\n| Order ID | ${order} |\n| Email | ${emailMatch} |\n| Items | Not stated |\n| Address | Not stated |`;
    }
    case 'macro':
      return `Hi {{name}},\n\n${polished}\n\nThanks for contacting us. Please reply to this thread if you need anything else.`;
    case 'flashcards':
      return sentences.slice(0, 5).map((sentence, index) => `Q${index + 1}: What is the key point ${index + 1}?\nA${index + 1}: ${sentence}`).join('\n\n') || polished;
    case 'compare': {
      const midpoint = Math.ceil(sentences.length / 2) || 1;
      return `| Area | Source notes |\n| --- | --- |\n| First part | ${sentences.slice(0, midpoint).join(' ')} |\n| Second part | ${sentences.slice(midpoint).join(' ') || 'Not provided'} |\n| Agreement | Shared facts should be confirmed against both sources. |\n| Disagreement | Mark only differences stated in the text. |`;
    }
    case 'citations': {
      const links = text.match(/https?:\/\/\S+/g) || [];
      return links.length ? links.map((link, index) => `[${index + 1}] ${link}`).join('\n') : 'No links were found in the source context.';
    }
    case 'csv': {
      const segments = text.split(/,|\n/).map((part) => part.trim()).filter(Boolean);
      const rows = segments.map((segment) => {
        const match = segment.match(/^(.*?)[\s:]+(-?[\d,.]+\s*(?:%|ms|s|k|m)?)$/i);
        return match ? `${match[1]},${match[2]}` : `${segment},`;
      });
      return ['Metric,Value', ...rows].join('\n');
    }
    default:
      return polished;
  }
}

function Logo({ small = false }) {
  return (
    <span className={cx('z-logo', small && 'small')} aria-hidden="true">
      <img src={zerthikLogo} alt="" draggable="false" />
    </span>
  );
}

function ContextGlyph({ chip, size = 14 }) {
  if (chip.id === 'app' && hasBrandLogo(chip.label)) {
    return <BrandLogo name={chip.label} className="context-brand-logo" />;
  }
  const Icon = chip.icon;
  return <Icon size={size} />;
}

function Keys({ keys }) {
  return (
    <span className="keys" aria-hidden="true">
      {keys.map((key, index) => <kbd key={`${key}-${index}`}>{key}</kbd>)}
    </span>
  );
}

function keysForCommand(command, platform, hotkeyOverrides, aliasOverrides) {
  const raw = hotkeyOverrides[command.id] || command.hotkey || '';
  if (!raw) return [];
  if (raw === 'Tab') return ['Tab'];
  const parts = raw.includes('+') ? raw.split('+').map((part) => part.trim()) : raw.split(/\s+/);
  const hasModifier = /ctrl|cmd|command|⌘|⌃/i.test(parts[0] || '');
  const mod = platform === 'mac' ? '⌘' : 'Ctrl';
  const mapped = parts.map((part) => {
    if (/^shift$/i.test(part)) return platform === 'mac' ? '⇧' : 'Shift';
    if (/^alt$/i.test(part)) return platform === 'mac' ? '⌥' : 'Alt';
    if (/^ctrl$/i.test(part)) return platform === 'mac' ? '⌃' : 'Ctrl';
    if (/^cmd$|^command$/i.test(part)) return mod;
    return part;
  });
  return hasModifier ? mapped : [mod, ...mapped];
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      className={cx('toggle', checked && 'on')}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}


function PremiumSelect({ id, value, options, onChange, ariaLabel, variant = 'field', leading = null, optionIcon = null }) {
  const items = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));
  const selectedIndex = Math.max(0, items.findIndex((option) => option.value === value));
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [open]);

  const toggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 250 && rect.top > 250);
      setActiveIndex(selectedIndex);
    }
    setOpen((value) => !value);
  };

  const choose = (option) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const onKeyDownCapture = (event) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', ' '];
    if (!keys.includes(event.key)) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); }
      return;
    }
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); toggle(); }
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => Math.min(items.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(items[activeIndex]); }
  };

  return (
    <div ref={rootRef} className={cx('premium-select', `premium-select-${variant}`, open && 'open', dropUp && 'drop-up')} onKeyDownCapture={onKeyDownCapture}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className="premium-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        {leading}
        <span className="premium-select-value">{items[selectedIndex]?.label}</span>
        <ChevronDown className="premium-select-chevron" size={variant === 'header' ? 14 : 15} />
      </button>
      {open && (
        <div className="premium-select-popover" role="listbox" aria-label={ariaLabel}>
          {items.map((option, index) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={index === selectedIndex}
              tabIndex={-1}
              className={cx('premium-select-option', index === selectedIndex && 'selected', index === activeIndex && 'active')}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span className="premium-select-check">{index === selectedIndex && <Check size={14} />}</span>
              {optionIcon && <span className="premium-select-option-icon">{optionIcon(option)}</span>}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandRow({ command, selected, platform, hotkeyOverrides, aliasOverrides, isFavorite, onSelect, onRun }) {
  const Icon = command.icon || Command;
  const alias = aliasOverrides[command.id] || command.alias;
  return (
    <button
      type="button"
      className={cx('command-row', selected && 'selected')}
      onMouseEnter={onSelect}
      onClick={onRun}
    >
      <span className="row-icon">
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="row-title">{command.title}</span>
      <span className="row-source">{command.source}</span>
      {alias && <span className="alias-chip">{alias}</span>}
      {command.hotkey && <Keys keys={keysForCommand(command, platform, hotkeyOverrides, aliasOverrides)} />}
      {isFavorite && <Star className="favorite-star" size={13} fill="currentColor" />}
      <span className="row-spacer" />
      <span className="row-type">{command.type}</span>
    </button>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="meta-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function SettingRow({ title, description, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-title">{title}</div>
        {description && <p>{description}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function ActionPanel({
  item,
  platform,
  isFavorite,
  mode,
  setMode,
  pendingHotkey,
  onAction,
  onClose,
  onConfirmHotkey,
  onSaveAlias,
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [alias, setAlias] = useState(item?.alias || '');
  const mod = platform === 'mac' ? '⌘' : 'Ctrl';
  const shift = platform === 'mac' ? '⇧' : 'Shift';

  useEffect(() => {
    setQuery('');
    setSelected(0);
    setAlias(item?.alias || '');
  }, [item?.id]);

  if (!item) return null;

  if (mode === 'hotkey') {
    return (
      <section className="action-panel recorder" aria-label="Set hotkey">
        <div className="action-panel-title">Set Hotkey…</div>
        <div className="recorder-body">
          <p>Press keys to assign</p>
          <div className="recorded-keys">
            {pendingHotkey ? <Keys keys={pendingHotkey.split(' ')} /> : <span className="muted">Waiting for keys…</span>}
          </div>
          <p className="muted">Press Enter to save, or Esc to go back.</p>
        </div>
        <div className="action-panel-footer">
          <span className="panel-context"><Logo small /> {item.title}</span>
          <span className="panel-actions">
            <button type="button" onClick={() => setMode('list')}>Back <Keys keys={['Esc']} /></button>
            <button type="button" onClick={onConfirmHotkey} disabled={!pendingHotkey}>Use Hotkey <Keys keys={['↵']} /></button>
          </span>
        </div>
      </section>
    );
  }

  if (mode === 'alias') {
    return (
      <section className="action-panel recorder" aria-label="Set alias">
        <div className="action-panel-title">Set Alias…</div>
        <form
          className="alias-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveAlias(alias.trim());
          }}
        >
          <label htmlFor="alias-input">Type this word in Search to find “{item.title}” instantly.</label>
          <input id="alias-input" autoFocus value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="e.g. rw" />
          <div className="alias-buttons">
            <button type="button" className="ghost-button" onClick={() => setMode('list')}>Back</button>
            <button type="submit" className="primary-mini">Save Alias</button>
          </div>
        </form>
      </section>
    );
  }

  const actions = [
    { id: 'run', label: item.kind === 'transform' ? 'Run Shortcut' : 'Open', section: 'Primary', icon: Play, keys: ['↵'] },
    { id: 'favorite', label: isFavorite ? 'Unpin Shortcut' : 'Pin Shortcut', section: 'Saved Shortcuts', icon: Star, keys: [mod, 'F'] },
    { id: 'hotkey', label: 'Set Hotkey…', section: 'Configure', icon: Keyboard, keys: [mod, shift, ','] },
    { id: 'alias', label: 'Set Alias…', section: 'Configure', icon: FileText, keys: [] },
    { id: 'settings', label: 'Open Dashboard Settings', section: 'Configure', icon: Settings, keys: [mod, ','] },
    { id: 'disable', label: item.kind === 'transform' ? 'Disable Shortcut' : 'Disable Command', section: 'Manage', icon: Trash2, keys: [mod, shift, 'D'], danger: true },
  ].filter((action) => fuzzyIncludes(query, action.label));

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((value) => Math.min(actions.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter' && actions[selected]) {
      event.preventDefault();
      onAction(actions[selected].id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let lastSection = '';
  return (
    <section className="action-panel" aria-label="Actions">
      <div className="action-search">
        <Search size={15} />
        <input
          autoFocus
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          onKeyDown={handleKeyDown}
          placeholder="Search for actions…"
          aria-label="Search for actions"
        />
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close actions"><X size={14} /></button>
      </div>
      <div className="action-list">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const section = !query && action.section !== lastSection ? action.section : null;
          lastSection = action.section;
          return (
            <div key={action.id}>
              {section && <div className="action-section">{section}</div>}
              <button
                type="button"
                className={cx('action-row', index === selected && 'selected', action.danger && 'danger')}
                onMouseEnter={() => setSelected(index)}
                onClick={() => onAction(action.id)}
              >
                <Icon size={15} />
                <span>{action.label}</span>
                <span className="row-spacer" />
                {action.keys.length > 0 && <Keys keys={action.keys} />}
              </button>
            </div>
          );
        })}
        {actions.length === 0 && <div className="empty-state compact-empty">No actions found</div>}
      </div>
      <div className="action-panel-footer">
        <span className="panel-context"><Logo small /> {item.title}</span>
        <span className="muted">Actions</span>
      </div>
    </section>
  );
}

export default function App() {
  const searchRef = useRef(null);
  const toastTimer = useRef(null);

  const [surface, setSurface] = useState(() => hasCompletedOnboarding() ? 'launcher' : 'onboarding');
  const [viewStack, setViewStack] = useState([{ name: 'root' }]);
  const view = viewStack[viewStack.length - 1];

  const [query, setQuery] = useState('');
  const [rootUseCase, setRootUseCase] = useState('All');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionMode, setActionMode] = useState('list');
  const [pendingHotkey, setPendingHotkey] = useState('');

  const [platform, setPlatform] = useState(() => {
    const value = `${navigator.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`;
    return /mac|iphone|ipad/i.test(value) ? 'mac' : 'windows';
  });
  const [interfaceSize, setInterfaceSize] = useState('medium');
  const [theme, setTheme] = useState(() => storedTheme());
  const [windowMode, setWindowMode] = useState('expanded');
  const [onboardingStep, setOnboardingStep] = useState(() => storedOnboardingStep());
  const [onboardingComplete, setOnboardingComplete] = useState(() => hasCompletedOnboarding());
  const [authState, setAuthState] = useState(() => (readStoredValue('zerthik-auth-connected') === '1' ? 'connected' : 'signed-out'));
  const [globalHotkey, setGlobalHotkey] = useState(() => readStoredValue('zerthik-global-hotkey') || 'Ctrl Space');
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [hotkeyWarning, setHotkeyWarning] = useState('');
  const [practiceOutput, setPracticeOutput] = useState('');
  const [practiceInserted, setPracticeInserted] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [appMenuQuery, setAppMenuQuery] = useState('');
  const [mcpMenuOpen, setMcpMenuOpen] = useState(false);
  const [mcpCategoryQuery, setMcpCategoryQuery] = useState('');

  const [customCommands, setCustomCommands] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [favorites, setFavorites] = useState(['issue-from-error', 'polite-nudge', 'summarise-article']);
  const [hotkeyOverrides, setHotkeyOverrides] = useState({});
  const [aliasOverrides, setAliasOverrides] = useState({});

  const [activeApp, setActiveApp] = useState('Gmail');
  const [inputText, setInputText] = useState('');
  const [instruction, setInstruction] = useState(baseCommands[0].prompt);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [context, setContext] = useState({ selection: true, clipboard: true, app: true, screenshot: false, mcp: false });
  const [usageCount, setUsageCount] = useState(() => loadUsage().count);
  const [usageEvents, setUsageEvents] = useState(() => loadUsage().events);

  const [mcpFilter, setMcpFilter] = useState('All Categories');
  const [mcpItems, setMcpItems] = useState(() => loadServers(baseMcpServers));
  const [mcpLogs, setMcpLogs] = useState([]);
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [mcpForm, setMcpForm] = useState({ company: '', transport: 'http', serverUrl: '', command: '', argsText: '', apiKey: '', authType: 'OAuth', scope: 'Personal', category: 'Productivity' });
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpExpandedId, setMcpExpandedId] = useState('');
  const [toolRuns, setToolRuns] = useState({}); // `${serverId}:${toolName}` -> { open, argsText, busy, result, error }
  const [pendingApproval, setPendingApproval] = useState(null); // { serverId, tool, args }
  const [mcpContextData, setMcpContextData] = useState(null); // { serverName, label, text }
  const [mcpCtxPick, setMcpCtxPick] = useState({ serverId: '', sourceId: '', argsText: '{}' });
  const [mcpCtxBusy, setMcpCtxBusy] = useState(false);

  useEffect(() => { saveServers(mcpItems); }, [mcpItems]);

  const patchMcp = (id, patch) => setMcpItems((items) => items.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  const readyServers = mcpItems.filter((item) => item.status === 'ready');

  const logMcp = (serverName, toolName, status) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMcpLogs((items) => [{ id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, server: serverName, tool: toolName, status, time }, ...items]);
  };

  // Real connect/disconnect — replaces the old boolean flip. A connect
  // runs the MCP initialize handshake and replaces preview tools with the
  // tools the server actually reports.
  const setServerConnected = async (item, wantConnected) => {
    if (!wantConnected) {
      await disconnectServer(item.id).catch(() => {});
      patchMcp(item.id, { connected: false, status: 'idle', error: '' });
      showToast(`${item.name} MCP server disconnected`);
      return;
    }
    const needsHttp = (item.transport || 'http') === 'http';
    if (needsHttp && !isValidHttpUrl(item.serverUrl)) {
      showToast(`Paste the ${item.name} MCP server URL first, then connect`);
      setMcpExpandedId(item.id);
      return;
    }
    if (!needsHttp && !(item.command || '').trim()) {
      showToast(`Set the ${item.name} server command first, then connect`);
      setMcpExpandedId(item.id);
      return;
    }
    patchMcp(item.id, { status: 'connecting', error: '' });
    try {
      const withArgs = { ...item, args: (item.argsText || '').trim() ? item.argsText.trim().split(/\s+/) : [] };
      const { serverInfo, tools, resources } = await connectServer(withArgs);
      patchMcp(item.id, { connected: true, status: 'ready', error: '', serverInfo, tools, resources });
      logMcp(item.name, 'connect', 'Connected');
      showToast(`${item.name} MCP connected — ${tools.length} tools discovered`);
    } catch (error) {
      patchMcp(item.id, { connected: false, status: 'error', error: String(error.message || error) });
      logMcp(item.name, 'connect', 'Failed');
      showToast(`Could not connect to ${item.name} MCP`);
    }
  };

  const runMcpTool = async (server, tool, argsText) => {
    const key = `${server.id}:${tool.name}`;
    let args = {};
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {};
    } catch {
      setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], error: 'Arguments must be valid JSON.' } }));
      return;
    }
    if (tool.levelId === 'write') {
      setPendingApproval({ serverId: server.id, tool, args });
      return;
    }
    await executeMcpTool(server, tool, args);
  };

  const executeMcpTool = async (server, tool, args) => {
    const key = `${server.id}:${tool.name}`;
    setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], open: true, busy: true, error: '' } }));
    try {
      const { text, isError } = await callServerTool(server.id, tool.name, args);
      setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], busy: false, result: text, error: isError ? 'The tool reported an error.' : '' } }));
      logMcp(server.name, tool.name, isError ? 'Tool error' : 'Ran');
      if (!isError) showToast(`${tool.name} finished`);
    } catch (error) {
      setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], busy: false, error: String(error.message || error) } }));
      logMcp(server.name, tool.name, 'Failed');
    }
  };

  const approvePendingTool = async () => {
    if (!pendingApproval) return;
    const server = mcpItems.find((item) => item.id === pendingApproval.serverId);
    const { tool, args } = pendingApproval;
    setPendingApproval(null);
    if (server) {
      logMcp(server.name, tool.name, 'Approved');
      await executeMcpTool(server, tool, args);
    }
  };

  const rejectPendingTool = () => {
    if (!pendingApproval) return;
    const server = mcpItems.find((item) => item.id === pendingApproval.serverId);
    if (server) logMcp(server.name, pendingApproval.tool.name, 'Rejected');
    setPendingApproval(null);
    showToast('Cancelled — nothing ran. Draft preserved.');
  };

  const [createForm, setCreateForm] = useState({ name: '', instruction: '', outputType: 'Text', tone: '', visibility: 'Personal', mcp: 'No MCP tools' });
  const [settingsSection, setSettingsSection] = useState('Home');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [plan, setPlan] = useState('Free');
  const [apiKeyRevoked, setApiKeyRevoked] = useState(false);
  const [prefs, setPrefs] = useState({
    launch: true,
    tray: true,
    followSystem: true,
    showFavoritesCompact: false,
    contextChips: true,
    voice: true,
    screenshot: false,
    streaming: true,
    autoInsert: true,
    redact: true,
    clipboard: true,
    activeApp: true,
    sensitiveApps: true,
    pause: false,
    analytics: false,
  });

  const [toast, setToast] = useState('');

  const allCommands = useMemo(() => {
    const commands = [...customCommands, ...baseCommands];
    return commands.filter((command) => !disabledIds.includes(command.id));
  }, [customCommands, disabledIds]);

  const shortcutItems = useMemo(() => {
    const byId = Object.fromEntries(baseShortcuts.map((item) => [item.id, item]));
    return allCommands
      .filter((command) => command.kind === 'transform')
      .map((command, index) => ({
        ...(byId[command.id] || {}),
        ...command,
        visibility: command.visibility || byId[command.id]?.visibility || 'Personal',
        outputType: command.outputType || byId[command.id]?.outputType || 'Text',
        lastUsed: byId[command.id]?.lastUsed || 'Never',
        usage: byId[command.id]?.usage || 0,
        order: index,
      }));
  }, [allCommands]);

  const commandMatches = (command) => {
    const alias = aliasOverrides[command.id] || command.alias || '';
    return fuzzyIncludes(query, `${command.title} ${command.source} ${command.description} ${command.keywords || ''} ${alias}`);
  };

  const rankedCommands = (items) => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items
      .map((command, index) => {
        const title = command.title.toLowerCase();
        const alias = (aliasOverrides[command.id] || command.alias || '').toLowerCase();
        let score = 0;
        if (title === q) score += 100;
        if (alias === q) score += 90;
        if (title.startsWith(q)) score += 70;
        if (title.includes(q)) score += 50;
        if (alias.includes(q)) score += 35;
        if ((command.keywords || '').toLowerCase().includes(q)) score += 15;
        return { command, index, score };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.command);
  };

  const visibleItems = useMemo(() => {
    if (view.name === 'root') {
      if (query.trim()) return rankedCommands(allCommands.filter(commandMatches));
      if (rootUseCase !== 'All') {
        const laneItems = allCommands.filter((command) => command.kind === 'transform' && command.source === rootUseCase);
        return [
          ...laneItems.filter((command) => favorites.includes(command.id)),
          ...laneItems.filter((command) => !favorites.includes(command.id)),
        ];
      }
      const favoriteItems = allCommands.filter((command) => favorites.includes(command.id));
      const shortcutRest = allCommands.filter((command) => command.kind === 'transform' && !favorites.includes(command.id));
      const dashboardItems = allCommands.filter((command) => command.kind !== 'transform' && !favorites.includes(command.id));
      return [...favoriteItems, ...shortcutRest, ...dashboardItems];
    }
    if (view.name === 'transform') return rankedCommands(shortcutItems.filter(commandMatches));
    if (view.name === 'shortcuts') return rankedCommands(shortcutItems.filter(commandMatches));
    if (view.name === 'integrations') {
      return mcpItems.filter((item) => (mcpFilter === 'All Categories' || (mcpFilter === 'Connected' ? item.connected : item.category === mcpFilter))
        && fuzzyIncludes(query, `${item.name} ${item.detail} ${item.category} ${item.authType} ${item.scope} ${item.tools.map((tool) => tool.name).join(' ')}`));
    }
    return [];
  }, [view.name, query, rootUseCase, allCommands, shortcutItems, favorites, mcpFilter, mcpItems, aliasOverrides]);

  const selectedItem = visibleItems[Math.min(selectedIndex, Math.max(0, visibleItems.length - 1))] || null;
  const selectedCommand = selectedItem && ('kind' in selectedItem || 'transform' in selectedItem)
    ? {
        ...selectedItem,
        alias: aliasOverrides[selectedItem.id] ?? selectedItem.alias,
        hotkey: hotkeyOverrides[selectedItem.id] ?? selectedItem.hotkey,
      }
    : selectedItem
      ? {
          ...selectedItem,
          title: selectedItem.title || selectedItem.name,
          source: selectedItem.source || selectedItem.category || 'Zerthik',
          type: 'Item',
          icon: selectedItem.icon || FileText,
          color: '#ffffff',
        }
      : null;

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 30);

  useEffect(() => {
    if (!readStoredValue('zerthik-global-hotkey')) {
      setGlobalHotkey(platform === 'mac' ? '⌥ Space' : 'Ctrl Space');
    }
  }, [platform]);

  useEffect(() => {
    writeStoredValue('zerthik-onboarding-step', String(onboardingStep));
  }, [onboardingStep]);

  useEffect(() => {
    writeStoredValue('zerthik-global-hotkey', globalHotkey);
  }, [globalHotkey]);

  useEffect(() => {
    writeStoredValue('zerthik-usage', JSON.stringify({ count: usageCount, events: usageEvents.slice(0, 50) }));
  }, [usageCount, usageEvents]);

  useEffect(() => {
    writeStoredValue('zerthik-theme', theme);
  }, [theme]);

  useEffect(() => {
    let unlisten;
    onFocusSearch(() => {
      focusSearch();
      readClipboardText().then((text) => { if (text) setInputText(text); });
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    readClipboardText().then((text) => { if (text) setInputText((current) => current || text); });
  }, []);

  useEffect(() => {
    if (selectedIndex > visibleItems.length - 1) setSelectedIndex(0);
  }, [visibleItems.length, selectedIndex]);

  useEffect(() => {
    if (view.name === 'transform' && selectedItem?.prompt) setInstruction(selectedItem.prompt);
  }, [view.name, selectedItem?.id]);

  const pushView = (nextView, initialIndex = 0) => {
    setViewStack((stack) => [...stack, nextView]);
    setQuery('');
    setSelectedIndex(initialIndex);
    setActionOpen(false);
    setActionMode('list');
    focusSearch();
  };

  const goBack = () => {
    if (viewStack.length <= 1) return;
    setViewStack((stack) => stack.slice(0, -1));
    setQuery('');
    setSelectedIndex(0);
    setActionOpen(false);
    focusSearch();
  };

  const openTransform = (command) => {
    const index = Math.max(0, shortcutItems.findIndex((item) => item.id === command.id));
    if (view.name === 'transform') {
      setSelectedIndex(index);
    } else {
      pushView({ name: 'transform', commandId: command.id }, index);
    }
    setInstruction(command.prompt || '');
    setActionOpen(false);
  };

  const copyText = async (text, label = 'Copied to clipboard') => {
    await writeClipboardText(text);
    showToast(label);
  };

  const runTransform = (command = selectedItem) => {
    if (!command) return;
    setIsRunning(true);
    setOutput('');
    window.setTimeout(() => {
      const composed = context.mcp && mcpContextData
        ? `${inputText}\n\n— MCP context (${mcpContextData.label}) —\n${mcpContextData.text}`
        : inputText;
      const result = generateOutput(command.transform || 'rewrite', composed);
      setOutput(result);
      setIsRunning(false);
      setUsageCount((value) => value + 1);
      setUsageEvents((items) => [
        { id: `usage-${Date.now()}`, label: 'AI transformation', status: 'Success', time: 'Just now' },
        ...items,
      ]);
      showToast(`${command.title} complete`);
    }, 520);
  };

  const openDashboard = (section = 'Home') => {
    setSettingsSection(section);
    setActionOpen(false);
    setSurface('settings');
  };

  const runPrimary = (item = selectedItem) => {
    if (!item) return;
    if (view.name === 'root') {
      if (item.kind === 'transform') openTransform(item);
      else if (item.kind === 'view') pushView({ name: item.target, commandId: item.id });
      else if (item.kind === 'dashboard') openDashboard(item.section);
      else if (item.kind === 'surface') setSurface(item.target);
      return;
    }
    if (view.name === 'transform') {
      runTransform(item);
      return;
    }
    if (view.name === 'shortcuts') {
      openTransform(item);
      return;
    }
    if (view.name === 'integrations') {
      setServerConnected(item, !item.connected);
    }
  };

  const toggleFavorite = (commandId) => {
    setFavorites((items) => items.includes(commandId) ? items.filter((id) => id !== commandId) : [commandId, ...items]);
  };

  const handleAction = (actionId) => {
    const item = selectedCommand;
    if (!item) return;
    if (actionId === 'run') {
      setActionOpen(false);
      runPrimary(selectedItem);
    } else if (actionId === 'favorite') {
      toggleFavorite(item.id);
      showToast(favorites.includes(item.id) ? 'Shortcut unpinned' : 'Shortcut pinned');
      setActionOpen(false);
    } else if (actionId === 'hotkey') {
      setPendingHotkey('');
      setActionMode('hotkey');
    } else if (actionId === 'alias') {
      setActionMode('alias');
        } else if (actionId === 'settings') {
      openDashboard('Settings');
    } else if (actionId === 'disable') {
      if ('kind' in item) {
        setDisabledIds((items) => [...items, item.id]);
        showToast(`${item.title} disabled`);
      } else {
        showToast('Only commands can be disabled');
      }
      setActionOpen(false);
    }
  };

  const confirmHotkey = () => {
    if (!selectedCommand || !pendingHotkey) return;
    setHotkeyOverrides((items) => ({ ...items, [selectedCommand.id]: pendingHotkey }));
    showToast(`Hotkey saved for ${selectedCommand.title}`);
    setActionOpen(false);
    setActionMode('list');
    focusSearch();
  };

  const saveAlias = (alias) => {
    if (!selectedCommand) return;
    setAliasOverrides((items) => ({ ...items, [selectedCommand.id]: alias }));
    showToast(alias ? `Alias “${alias}” saved` : 'Alias removed');
    setActionOpen(false);
    setActionMode('list');
    focusSearch();
  };

  const goToOnboardingStep = (step) => {
    setOnboardingStep(Math.min(5, Math.max(0, step)));
  };

  const finishOnboardingLater = () => {
    writeStoredValue('zerthik-onboarding-step', String(onboardingStep));
    setSurface('launcher');
    focusSearch();
    showToast('Onboarding saved — it will resume where you left off');
  };

  const completeOnboarding = () => {
    setOnboardingComplete(true);
    writeStoredValue('zerthik-onboarding-complete', '1');
    writeStoredValue('zerthik-onboarding-step', null);
    setSurface('launcher');
    setViewStack([{ name: 'root' }]);
    setQuery('');
    focusSearch();
    showToast('Zerthik is ready');
  };

  const replayOnboarding = () => {
    setOnboardingComplete(false);
    setOnboardingStep(0);
    setPracticeOutput('');
    setPracticeInserted(false);
    setAppMenuOpen(false);
    setSurface('onboarding');
  };

  const AUTH_URL = import.meta.env.VITE_AUTH_URL || '';

  const startBrowserSignIn = (provider) => {
    if (!AUTH_URL) {
      setAuthState('unconfigured');
      return;
    }
    setAuthState('browser');
    const url = `${AUTH_URL}${AUTH_URL.includes('?') ? '&' : '?'}provider=${encodeURIComponent(provider.toLowerCase())}`;
    openExternal(url).catch(() => {});
  };

  const openCreateShortcut = () => {
    setSurface('launcher');
    setViewStack([{ name: 'root' }, { name: 'create', commandId: 'create-shortcut' }]);
    setQuery('');
    setSelectedIndex(0);
    setAppMenuOpen(false);
    focusSearch();
  };

  const jumpToLauncherView = (name) => {
    setSurface('launcher');
    setViewStack(name === 'root' ? [{ name: 'root' }] : [{ name: 'root' }, { name }]);
    setQuery('');
    setRootUseCase('All');
    setSelectedIndex(0);
    setActionOpen(false);
    setActionMode('list');
    setAppMenuOpen(false);
    setMcpMenuOpen(false);
    focusSearch();
  };

  const goToCommandDeck = () => jumpToLauncherView('root');

  useEffect(() => {
    const handleKeyDown = (event) => {
      const active = document.activeElement;
      const activeTag = active?.tagName;
      const inSearch = active === searchRef.current;
      const modifierPressed = platform === 'mac' ? event.metaKey : event.ctrlKey;
      const anyModifier = event.metaKey || event.ctrlKey;

      if (recordingHotkey) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setRecordingHotkey(false);
          return;
        }
        if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
          event.preventDefault();
          const parts = [];
          if (platform === 'mac') {
            if (event.ctrlKey) parts.push('⌃');
            if (event.altKey) parts.push('⌥');
            if (event.shiftKey) parts.push('⇧');
            if (event.metaKey) parts.push('⌘');
          } else {
            if (event.ctrlKey) parts.push('Ctrl');
            if (event.altKey) parts.push('Alt');
            if (event.shiftKey) parts.push('Shift');
          }
          parts.push(event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key);
          const combo = parts.join(' ');
          const reserved = ['Ctrl C', 'Ctrl V', 'Ctrl X', 'Ctrl Z', '⌘ C', '⌘ V', '⌘ X', '⌘ Z', 'Space'];
          setHotkeyWarning(reserved.includes(combo) ? 'That shortcut may conflict with system editing. You can keep it or record another.' : '');
          setGlobalHotkey(combo);
          setRecordingHotkey(false);
        }
        return;
      }

      if ((appMenuOpen || mcpMenuOpen) && event.key === 'Escape') {
        event.preventDefault();
        setAppMenuOpen(false);
        setMcpMenuOpen(false);
        focusSearch();
        return;
      }

      if (actionOpen && actionMode === 'hotkey') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setActionMode('list');
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmHotkey();
          return;
        }
        if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
          event.preventDefault();
          const parts = [];
          if (platform === 'mac') {
            if (event.ctrlKey) parts.push('⌃');
            if (event.altKey) parts.push('⌥');
            if (event.shiftKey) parts.push('⇧');
            if (event.metaKey) parts.push('⌘');
          } else {
            if (event.ctrlKey) parts.push('Ctrl');
            if (event.altKey) parts.push('Alt');
            if (event.shiftKey) parts.push('Shift');
          }
          parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
          setPendingHotkey(parts.join(' '));
        }
        return;
      }

      if (anyModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (surface === 'launcher' && selectedCommand) {
          setActionOpen((open) => !open);
          setActionMode('list');
        }
        return;
      }

      if (modifierPressed && event.key === ',') {
        event.preventDefault();
        openDashboard('Settings');
        return;
      }

      if (surface !== 'launcher') {
        if (event.key === 'Escape') {
          if (surface === 'onboarding') finishOnboardingLater();
          else setSurface('launcher');
        }
        return;
      }

      if (actionOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (actionMode !== 'list') setActionMode('list');
          else {
            setActionOpen(false);
            focusSearch();
          }
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (query) setQuery('');
        else if (viewStack.length > 1) goBack();
        else if (windowMode === 'expanded') setWindowMode('compact');
        return;
      }

      const inEditable = ['TEXTAREA', 'INPUT', 'SELECT'].includes(activeTag) && !inSearch;
      if (inEditable) {
        if (modifierPressed && event.key === 'Enter' && view.name === 'transform') {
          event.preventDefault();
          runTransform(selectedItem);
        }
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((value) => Math.min(visibleItems.length - 1, value + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((value) => Math.max(0, value - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (view.name === 'create') submitCreateShortcut();
        else runPrimary(selectedItem);
            } else if (event.key === 'Backspace' && inSearch && !query && viewStack.length > 1) {
        event.preventDefault();
        goBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionOpen, actionMode, pendingHotkey, platform, selectedCommand, selectedItem, surface, query, view.name, viewStack.length, visibleItems.length, windowMode, createForm, inputText, activeApp, appMenuOpen, mcpMenuOpen, recordingHotkey, onboardingStep]);

  const submitCreateShortcut = () => {
    const name = createForm.name.trim();
    if (!name) {
      showToast('Give your Shortcut a name first');
      return;
    }
    const duplicate = allCommands.some((command) => command.kind === 'transform'
      && command.title.toLowerCase() === name.toLowerCase()
      && (command.visibility || 'Personal') === createForm.visibility);
    if (duplicate) {
      showToast(`A ${createForm.visibility} Shortcut with this name already exists`);
      return;
    }
    const command = {
      id: `custom-${Date.now()}`,
      title: name,
      source: createForm.visibility,
      type: 'Shortcut',
      kind: 'transform',
      transform: 'rewrite',
      icon: Command,
      color: '#ffffff',
      homeSection: 'commands',
      alias: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      hotkey: '',
      description: createForm.instruction || 'A reusable Zerthik Shortcut.',
      prompt: createForm.instruction || 'Transform this text according to the Shortcut instructions.',
      outputType: createForm.outputType,
      visibility: createForm.visibility,
      keywords: `${name} ${createForm.outputType} ${createForm.visibility} ${createForm.tone} custom shortcut`,
    };
    setCustomCommands((items) => [command, ...items]);
    setCreateForm({ name: '', instruction: '', outputType: 'Text', tone: '', visibility: 'Personal', mcp: 'No MCP tools' });
    showToast(`Shortcut “${name}” created`);
    goBack();
  };

  const contextChips = [
    { id: 'selection', label: 'Selected text', icon: ScanText },
    { id: 'clipboard', label: 'Clipboard', icon: Clipboard },
    { id: 'app', label: activeApp, icon: AppWindow },
    { id: 'screenshot', label: 'Screenshot', icon: Camera },
    { id: 'mcp', label: 'MCP context', icon: Blocks },
  ];

  const toggleContextChip = (chip) => {
    if (chip.id === 'mcp' && !context.mcp) {
      if (!readyServers.length) {
        showToast('Connect an MCP server first — open MCP Connections');
        return;
      }
      setMcpCtxPick((pick) => ({ ...pick, serverId: pick.serverId || readyServers[0].id }));
    }
    setContext((value) => ({ ...value, [chip.id]: !value[chip.id] }));
  };

  const ctxServer = readyServers.find((server) => server.id === mcpCtxPick.serverId) || readyServers[0] || null;
  const ctxSourceOptions = ctxServer ? [
    ...ctxServer.tools.filter((tool) => tool.levelId === 'read').map((tool) => `Tool · ${tool.name}`),
    ...(ctxServer.resources || []).map((resource) => `Resource · ${resource.name}`),
  ] : [];

  const fetchMcpContext = async () => {
    if (!ctxServer) return;
    const sourceLabel = mcpCtxPick.sourceId || ctxSourceOptions[0] || '';
    if (!sourceLabel) { showToast('This server exposes no read tools or resources'); return; }
    setMcpCtxBusy(true);
    try {
      if (sourceLabel.startsWith('Resource · ')) {
        const resource = (ctxServer.resources || []).find((entry) => `Resource · ${entry.name}` === sourceLabel);
        if (!resource) throw new Error('Resource not found on this server.');
        const { text } = await readServerResource(ctxServer.id, resource.uri);
        setMcpContextData({ serverName: ctxServer.name, label: `${ctxServer.name} · ${resource.name}`, text });
        logMcp(ctxServer.name, resource.uri, 'Context');
      } else {
        const toolName = sourceLabel.replace('Tool · ', '');
        let args = {};
        try {
          args = mcpCtxPick.argsText.trim() ? JSON.parse(mcpCtxPick.argsText) : {};
        } catch {
          showToast('MCP tool arguments must be valid JSON');
          setMcpCtxBusy(false);
          return;
        }
        const { text, isError } = await callServerTool(ctxServer.id, toolName, args);
        setMcpContextData({ serverName: ctxServer.name, label: `${ctxServer.name} · ${toolName}`, text });
        logMcp(ctxServer.name, toolName, isError ? 'Tool error' : 'Context');
        if (isError) showToast(`${toolName} reported an error`);
      }
      showToast('MCP context attached');
    } catch (error) {
      showToast(String(error.message || error));
    }
    setMcpCtxBusy(false);
  };

  const startVoiceInput = (target = 'instruction') => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showToast('Voice input is available in the desktop build');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (!transcript) return;
      if (target === 'query') {
        setQuery(transcript);
        setRootUseCase('All');
        setSelectedIndex(0);
      } else {
        setInstruction(transcript);
      }
    };
    recognition.onerror = () => showToast('Voice input could not start');
    recognition.start();
    showToast('Listening…');
  };

  const renderRoot = () => {
    const hasQuery = Boolean(query.trim());
    const favoriteItems = visibleItems.filter((command) => favorites.includes(command.id));
    const shortcutItemsRoot = visibleItems.filter((command) => command.kind === 'transform' && !favorites.includes(command.id));
    const dashboardItems = visibleItems.filter((command) => command.kind !== 'transform' && !favorites.includes(command.id));
    const sections = hasQuery
      ? [['Results', visibleItems]]
      : rootUseCase !== 'All'
        ? [[`${rootUseCase} Shortcuts`, visibleItems]]
        : [
            ['Pinned Shortcuts', favoriteItems],
            ['Shortcuts', shortcutItemsRoot],
            ['Zerthik', dashboardItems],
          ];
    let offset = 0;
    const useCaseLanes = ['All', 'Developer', 'Founder', 'Support & Ops', 'Research'];

    return (
      <div className="palette-home" aria-label="Zerthik command card">
        {prefs.contextChips && (
          <div className="palette-context-strip" aria-label="Context sources">
            <span className="context-ready">Context</span>
            <div className="palette-context-chips">
              {contextChips.map((chip) => {
                const enabled = context[chip.id];
                return (
                  <button
                    type="button"
                    key={chip.id}
                    className={cx('palette-context-chip', enabled && 'enabled')}
                    onClick={() => setContext((value) => ({ ...value, [chip.id]: !value[chip.id] }))}
                    aria-pressed={enabled}
                    title={enabled ? `Remove ${chip.label}` : `Add ${chip.label}`}
                  >
                    <ContextGlyph chip={chip} size={13} /> {chip.label} {enabled ? <Check size={12} /> : <Plus size={12} />}
                  </button>
                );
              })}
            </div>
            <span className="row-spacer" />
            <span className="palette-context-note">Nothing sends until Generate</span>
          </div>
        )}

        {!hasQuery && (
          <div className="palette-lanes" aria-label="Shortcut categories">
            {useCaseLanes.map((lane) => {
              const count = lane === 'All' ? shortcutItems.length : shortcutItems.filter((item) => item.source === lane).length;
              const active = rootUseCase === lane;
              return (
                <button
                  type="button"
                  key={lane}
                  className={cx('palette-lane', active && 'active')}
                  onClick={() => { setRootUseCase(lane); setSelectedIndex(0); focusSearch(); }}
                  aria-pressed={active}
                >
                  {lane} <span>{count}</span>
                </button>
              );
            })}
            <span className="row-spacer" />
            <span className="palette-count">{visibleItems.length} available</span>
          </div>
        )}

        <div className="palette-list">
          {visibleItems.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <strong>No results for “{query}”</strong>
              <span>Create a Shortcut for this job, or search by a Shortcut name.</span>
              <button type="button" className="dark-button" onClick={openCreateShortcut}><Plus size={15} /> Create Shortcut</button>
            </div>
          )}

          {sections.map(([label, items]) => {
            const start = offset;
            offset += items.length;
            if (!items.length) return null;
            return (
              <section key={label} className="palette-section">
                <div className="section-label">{label} <span>{items.length}</span></div>
                {items.map((command, index) => (
                  <CommandRow
                    key={command.id}
                    command={command}
                    selected={start + index === selectedIndex}
                    platform={platform}
                    hotkeyOverrides={hotkeyOverrides}
                    aliasOverrides={aliasOverrides}
                    isFavorite={favorites.includes(command.id)}
                    onSelect={() => setSelectedIndex(start + index)}
                    onRun={() => { setSelectedIndex(start + index); runPrimary(command); }}
                  />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    );
  };


  const renderTransform = () => {
    const command = selectedItem || shortcutItems[0];
    return (
      <div className="split-view transform-view studio-view">
        <div className="list-pane studio-switcher">
          <div className="section-label">Shortcuts <span>{visibleItems.length}</span></div>
          {visibleItems.map((item, index) => (
            <CommandRow
              key={item.id}
              command={item}
              selected={index === selectedIndex}
              platform={platform}
              hotkeyOverrides={hotkeyOverrides}
              aliasOverrides={aliasOverrides}
              isFavorite={favorites.includes(item.id)}
              onSelect={() => setSelectedIndex(index)}
              onRun={() => { setSelectedIndex(index); runTransform(item); }}
            />
          ))}
        </div>

        <div className="detail-pane workspace-pane studio-pane">
          {command && (
            <>
              <div className="workspace-header studio-header">
                <div>
                  <span className="studio-kicker">Run Shortcut · {command.source}</span>
                  <h2>{command.title}</h2>
                  <p>{command.description}</p>
                </div>
              </div>

              <div className="studio-grid">
                <section className="studio-lane source-lane">
                  <div className="studio-lane-heading">
                    <span>01</span>
                    <div>
                      <h3>Context & source</h3>
                      <p>Remove any source before the run.</p>
                    </div>
                  </div>

                  <div className="context-editor studio-context-editor" aria-label="Context sources">
                    {contextChips.map((chip) => {
                      const enabled = context[chip.id];
                      return (
                        <button
                          type="button"
                          key={chip.id}
                          className={cx('context-toggle', enabled && 'enabled')}
                          onClick={() => toggleContextChip(chip)}
                          aria-pressed={enabled}
                        >
                          <ContextGlyph chip={chip} size={14} /> {chip.label} {enabled ? <Check size={13} /> : <Plus size={13} />}
                        </button>
                      );
                    })}
                  </div>

                  {context.mcp && (
                    <div className="mcp-context-panel">
                      {ctxServer ? (
                        <>
                          <div className="mcp-context-row">
                            <PremiumSelect
                              id="mcp-ctx-server"
                              ariaLabel="MCP server for context"
                              value={ctxServer.name}
                              options={readyServers.map((server) => server.name)}
                              onChange={(name) => {
                                const server = readyServers.find((entry) => entry.name === name);
                                if (server) setMcpCtxPick({ serverId: server.id, sourceId: '', argsText: '{}' });
                              }}
                            />
                            <PremiumSelect
                              id="mcp-ctx-source"
                              ariaLabel="MCP context source"
                              value={mcpCtxPick.sourceId || ctxSourceOptions[0] || ''}
                              options={ctxSourceOptions}
                              onChange={(value) => {
                                const tool = ctxServer.tools.find((entry) => `Tool · ${entry.name}` === value);
                                setMcpCtxPick((pick) => ({ ...pick, sourceId: value, argsText: tool ? argsSkeleton(tool) : pick.argsText }));
                              }}
                            />
                            <button type="button" className="dark-button mcp-fetch" onClick={fetchMcpContext} disabled={mcpCtxBusy || !ctxSourceOptions.length}>
                              {mcpCtxBusy ? <Loader2 className="spin" size={14} /> : <Play size={14} />} Fetch
                            </button>
                          </div>
                          {(mcpCtxPick.sourceId || ctxSourceOptions[0] || '').startsWith('Tool · ') && (
                            <textarea
                              className="mcp-args"
                              rows={2}
                              value={mcpCtxPick.argsText}
                              onChange={(event) => setMcpCtxPick((pick) => ({ ...pick, argsText: event.target.value }))}
                              placeholder='{ "message": "hello" }'
                              aria-label="MCP tool arguments as JSON"
                            />
                          )}
                          {mcpContextData ? (
                            <div className="mcp-context-card">
                              <div className="mcp-context-head">
                                <Blocks size={13} /> <strong>{mcpContextData.label}</strong>
                                <button type="button" className="icon-button" onClick={() => setMcpContextData(null)} aria-label="Remove MCP context"><X size={13} /></button>
                              </div>
                              <pre>{mcpContextData.text}</pre>
                            </div>
                          ) : (
                            <p className="lane-note">Only Read tools and resources can feed context — writes stay behind approval.</p>
                          )}
                        </>
                      ) : (
                        <p className="lane-note"><Blocks size={14} /> No MCP server is connected. Open MCP Connections to connect one.</p>
                      )}
                    </div>
                  )}

                  <label className="field-label" htmlFor="source-text">Source text</label>
                  <textarea
                    id="source-text"
                    className="source-box studio-source-box"
                    value={context.selection ? inputText : ''}
                    disabled={!context.selection}
                    onChange={(event) => setInputText(event.target.value)}
                    placeholder={context.selection ? 'Selected text appears here…' : 'Selected-text context is off'}
                  />
                  <p className="lane-note"><ShieldCheck size={14} /> Sensitive apps and secrets stay protected.</p>
                </section>

                <section className="studio-lane command-lane">
                  <div className="studio-lane-heading">
                    <span>02</span>
                    <div>
                      <h3>Command</h3>
                      <p>Type it, speak it, or keep the saved recipe.</p>
                    </div>
                  </div>

                  <label className="field-label" htmlFor="instruction">Instruction</label>
                  <div className="instruction-box studio-instruction-box">
                    <PenLine size={16} />
                    <textarea id="instruction" rows={4} value={instruction} onChange={(event) => setInstruction(event.target.value)} />
                    <button type="button" className="icon-button" onClick={startVoiceInput} aria-label="Voice instruction"><Mic size={16} /></button>
                  </div>

                  <div className="destination-card">
                    <span>Destination</span>
                    <strong><BrandLogo name={activeApp} className="inline-brand-logo" /> {activeApp}</strong>
                    <p>Reviewed output returns to the active field.</p>
                  </div>

                  <button type="button" className="dark-button studio-generate" onClick={() => runTransform(command)} disabled={isRunning}>
                    {isRunning ? <Loader2 className="spin" size={15} /> : output ? <RefreshCw size={15} /> : <Play size={15} />} {output ? 'Regenerate output' : 'Generate output'}
                  </button>
                </section>

                <section className="studio-lane output-lane">
                  <div className="studio-lane-heading">
                    <span>03</span>
                    <div>
                      <h3>Review & insert</h3>
                      <p>Edit the result before it lands anywhere.</p>
                    </div>
                  </div>

                  <div className="output-heading">
                    <label className="field-label">Output · {command.outputType || 'Text'}</label>
                    {output && <span className="output-status"><Check size={13} /> Ready for {activeApp}</span>}
                  </div>
                  <div className={cx('output-box studio-output-box', isRunning && 'loading')}>
                    {isRunning ? (
                      <span className="loading-label"><Loader2 className="spin" size={17} /> Running {command.title}…</span>
                    ) : output ? (
                      <textarea className="output-editor" value={output} onChange={(event) => setOutput(event.target.value)} aria-label="Edit output before insertion" />
                    ) : (
                      <span className="muted">Generated output will appear here for review. Nothing is inserted automatically.</span>
                    )}
                  </div>

                  <div className="workspace-actions studio-actions">
                    <button type="button" className="dark-button" disabled={!output} onClick={() => showToast(`Inserted into ${activeApp}`)}>
                      <Clipboard size={15} /> Insert
                    </button>
                    <button type="button" className="ghost-button" disabled={!output} onClick={() => copyText(output)}>
                      <Copy size={15} /> Copy
                    </button>
                    <button type="button" className="ghost-button" disabled={!output || isRunning} onClick={() => runTransform(command)}>
                      <RefreshCw size={15} /> Regenerate
                    </button>
                  </div>
                  <p className="lane-note"><ShieldCheck size={14} /> If direct insert is unavailable, Zerthik copies the output instead.</p>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };


  const renderShortcuts = () => {
    const item = selectedItem;
    return (
      <div className="split-view library-view">
        <div className="list-pane library-board">
          <div className="section-label">Shortcut Library <span>{visibleItems.length}</span></div>
          {visibleItems.map((shortcut, index) => (
            <CommandRow
              key={shortcut.id}
              command={shortcut}
              selected={index === selectedIndex}
              platform={platform}
              hotkeyOverrides={hotkeyOverrides}
              aliasOverrides={aliasOverrides}
              isFavorite={favorites.includes(shortcut.id)}
              onSelect={() => setSelectedIndex(index)}
              onRun={() => { setSelectedIndex(index); openTransform(shortcut); }}
            />
          ))}
        </div>
        <div className="detail-pane library-inspector">
          {item && (
            <>
              <div className="detail-hero">
                <span className="detail-icon">
                  {(() => { const Icon = item.icon; return <Icon size={25} />; })()}
                </span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </div>
              <div className="recipe-box">
                <span>Recipe</span>
                <p>{item.prompt}</p>
              </div>
              <div className="metadata-block">
                <h3>Metadata</h3>
                <MetaRow label="Alias" value={aliasOverrides[item.id] || item.alias} />
                <MetaRow label="Hotkey" value={keysForCommand(item, platform, hotkeyOverrides, aliasOverrides).join(' ')} />
                <MetaRow label="Category" value={item.source} />
                <MetaRow label="Visibility" value={item.visibility} />
                <MetaRow label="Output format" value={item.outputType} />
                <MetaRow label="Last used" value={item.lastUsed} />
                <MetaRow label="Runs" value={String(item.usage)} />
              </div>
              <button type="button" className="violet-button detail-run" onClick={() => openTransform(item)}>
                <Play size={15} /> Open Shortcut
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const testMcpConnection = async () => {
    const company = mcpForm.company.trim() || 'Test';
    const probe = {
      id: `probe-${Date.now()}`,
      name: company,
      transport: mcpForm.transport,
      serverUrl: mcpForm.serverUrl.trim(),
      command: mcpForm.command.trim(),
      argsText: mcpForm.argsText,
      args: mcpForm.argsText.trim() ? mcpForm.argsText.trim().split(/\s+/) : [],
      authType: mcpForm.authType,
      apiKey: mcpForm.apiKey,
    };
    if (probe.transport === 'http' && !isValidHttpUrl(probe.serverUrl)) {
      showToast('Enter a valid MCP server URL to test');
      return;
    }
    if (probe.transport === 'stdio' && !probe.command) {
      showToast('Enter a server command to test');
      return;
    }
    setMcpTesting(true);
    try {
      const { serverInfo, tools } = await connectServer(probe);
      await disconnectServer(probe.id);
      showToast(`Reachable — ${serverInfo?.name || 'MCP server'} reported ${tools.length} tools`);
    } catch (error) {
      showToast(`Test failed: ${String(error.message || error)}`);
    }
    setMcpTesting(false);
  };

  const submitAddMcp = () => {
    const company = mcpForm.company.trim();
    if (!company) {
      showToast('Add a company name first — the logo follows the name');
      return;
    }
    if (mcpItems.some((item) => item.name.toLowerCase() === company.toLowerCase())) {
      showToast(`${company} MCP server is already in the list`);
      return;
    }
    const host = domainFromUrl(mcpForm.serverUrl) || domainFromUrl(company);
    const item = {
      id: `custom-mcp-${Date.now()}`,
      name: company,
      detail: `Tools through a user-added ${company} MCP server.`,
      category: mcpForm.category,
      authType: mcpForm.authType,
      scope: mcpForm.scope,
      transport: mcpForm.transport,
      serverUrl: mcpForm.serverUrl.trim() || 'Remote MCP URL',
      command: mcpForm.command.trim(),
      argsText: mcpForm.argsText,
      apiKey: mcpForm.apiKey,
      domain: host,
      custom: true,
      connected: false,
      status: 'idle',
      error: '',
      serverInfo: null,
      resources: [],
      tools: [],
    };
    setMcpItems((items) => [item, ...items]);
    setMcpExpandedId(item.id);
    setMcpForm({ company: '', transport: 'http', serverUrl: '', command: '', argsText: '', apiKey: '', authType: 'OAuth', scope: 'Personal', category: 'Productivity' });
    setShowAddMcp(false);
    setMcpFilter('All Categories');
    setQuery('');
    setSelectedIndex(0);
    showToast(`${company} MCP server added — connect it to discover its tools`);
  };

  const renderAddMcpForm = () => {
    const company = mcpForm.company.trim();
    const host = domainFromUrl(mcpForm.serverUrl) || domainFromUrl(company);
    const known = Boolean(company && hasBrandLogo(company));
    const logoNote = !company
      ? 'Type a company name and its logo previews here automatically.'
      : known
        ? 'Real logo found — it matched the built-in logo library.'
        : host
          ? `No built-in logo, so it loads automatically from ${host}. If that fails, initials show instead.`
          : 'No built-in logo for this name, so initials will show. Add the server URL and the logo loads from its domain.';
    return (
      <form className="mcp-add-form" onSubmit={(event) => { event.preventDefault(); submitAddMcp(); }}>
        <div className="mcp-add-head">
          <span className="store-avatar brand-avatar"><BrandLogo name={company || 'MCP'} domain={host} className="store-brand-logo" allowFallback /></span>
          <div>
            <strong>{company ? `${company} MCP` : 'New MCP server'}</strong>
            <small>{logoNote}</small>
          </div>
        </div>
        <div className="mcp-add-grid">
          <label className="wide">Company name
            <input id="mcp-company" autoFocus value={mcpForm.company} onChange={(event) => setMcpForm((v) => ({ ...v, company: event.target.value }))} placeholder="e.g. Asana" />
          </label>
          <label>Transport
            <PremiumSelect
              id="mcp-transport-new"
              ariaLabel="Transport"
              value={mcpForm.transport === 'stdio' ? 'Command (stdio)' : 'Remote URL (HTTP)'}
              options={['Remote URL (HTTP)', 'Command (stdio)']}
              onChange={(value) => setMcpForm((v) => ({ ...v, transport: value.startsWith('Command') ? 'stdio' : 'http' }))}
            />
          </label>
          {mcpForm.transport === 'http' ? (
            <label>Server URL
              <input id="mcp-url" value={mcpForm.serverUrl} onChange={(event) => setMcpForm((v) => ({ ...v, serverUrl: event.target.value }))} placeholder="https://mcp.example.com/mcp" />
            </label>
          ) : (
            <>
              <label>Command
                <input id="mcp-command" value={mcpForm.command} onChange={(event) => setMcpForm((v) => ({ ...v, command: event.target.value }))} placeholder="npx" />
              </label>
              <label className="wide">Arguments
                <input id="mcp-args" value={mcpForm.argsText} onChange={(event) => setMcpForm((v) => ({ ...v, argsText: event.target.value }))} placeholder="-y @modelcontextprotocol/server-everything" />
              </label>
            </>
          )}
          <label>Category
            <PremiumSelect id="mcp-category" ariaLabel="Category" value={mcpForm.category} options={['Developer', 'Productivity', 'Communication', 'Design']} onChange={(value) => setMcpForm((v) => ({ ...v, category: value }))} />
          </label>
          <label>Auth
            <PremiumSelect id="mcp-auth" ariaLabel="Auth" value={mcpForm.authType} options={['OAuth', 'API key']} onChange={(value) => setMcpForm((v) => ({ ...v, authType: value }))} />
          </label>
          <label>Scope
            <PremiumSelect id="mcp-scope" ariaLabel="Scope" value={mcpForm.scope} options={['Personal', 'Workspace']} onChange={(value) => setMcpForm((v) => ({ ...v, scope: value }))} />
          </label>
          {mcpForm.authType === 'API key' && (
            <label>API key
              <input id="mcp-apikey" type="password" value={mcpForm.apiKey} onChange={(event) => setMcpForm((v) => ({ ...v, apiKey: event.target.value }))} placeholder="Bearer token" />
            </label>
          )}
        </div>
        <div className="mcp-add-actions">
          <button type="button" className="ghost-button" onClick={() => setShowAddMcp(false)}>Cancel</button>
          <button type="button" className="ghost-button" onClick={testMcpConnection} disabled={mcpTesting}>
            {mcpTesting ? <Loader2 className="spin" size={15} /> : <Plug size={15} />} Test connection
          </button>
          <button type="submit" className="dark-button"><Plus size={15} /> Add Server</button>
        </div>
      </form>
    );
  };

  const mcpStatusLabel = (item) => (item.status === 'connecting' ? 'Connecting…' : item.status === 'ready' ? 'Connected' : item.status === 'error' ? 'Connection failed' : 'Disconnected');

  const readResourceInto = async (item, resource) => {
    const key = `${item.id}:res:${resource.uri}`;
    setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], open: true, busy: true, error: '' } }));
    try {
      const { text } = await readServerResource(item.id, resource.uri);
      setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], busy: false, result: text } }));
      logMcp(item.name, resource.uri, 'Read');
    } catch (error) {
      setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], busy: false, error: String(error.message || error) } }));
    }
  };

  const renderMcpEndpoint = (item) => (
    <div className="mcp-endpoint">
      <div className="mcp-endpoint-fields">
        {(item.transport || 'http') === 'http' ? (
          <label className="wide">Server URL
            <input
              value={item.serverUrl === 'Remote MCP URL' ? '' : item.serverUrl || ''}
              placeholder="https://mcp.example.com/mcp"
              onChange={(event) => patchMcp(item.id, { serverUrl: event.target.value })}
            />
          </label>
        ) : (
          <>
            <label>Command
              <input value={item.command || ''} placeholder="npx" onChange={(event) => patchMcp(item.id, { command: event.target.value })} />
            </label>
            <label className="wide">Arguments
              <input value={item.argsText || ''} placeholder="-y @modelcontextprotocol/server-everything" onChange={(event) => patchMcp(item.id, { argsText: event.target.value })} />
            </label>
          </>
        )}
      </div>
      <div className="mcp-endpoint-actions">
        <PremiumSelect
          id={`mcp-transport-${item.id}`}
          ariaLabel="Transport"
          value={(item.transport || 'http') === 'stdio' ? 'Command (stdio)' : 'Remote URL (HTTP)'}
          options={['Remote URL (HTTP)', 'Command (stdio)']}
          onChange={(value) => patchMcp(item.id, { transport: value.startsWith('Command') ? 'stdio' : 'http' })}
        />
        <button type="button" className="dark-button" onClick={() => setServerConnected(item, !item.connected)} disabled={item.status === 'connecting'}>
          {item.status === 'connecting' ? <Loader2 className="spin" size={14} /> : <Plug size={14} />} {item.connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      {(item.transport || 'http') === 'stdio' && <p className="lane-note">Command servers spawn locally inside the desktop app.</p>}
      {item.authType === 'API key' && (
        <label className="wide mcp-apikey">API key (sent as Bearer token)
          <input type="password" value={item.apiKey || ''} placeholder="sk-…" onChange={(event) => patchMcp(item.id, { apiKey: event.target.value })} />
        </label>
      )}
    </div>
  );

  const renderMcpTools = (item) => {
    const isReady = item.status === 'ready';
    const tools = item.tools || [];
    return (
      <div className="mcp-tools">
        <div className="mcp-status-line">
          <span className={cx('connection-pill', item.connected && 'connected')}>{mcpStatusLabel(item)}</span>
          {item.serverInfo && <small>{item.serverInfo.name} {item.serverInfo.version}</small>}
          <small>{isReady ? `${tools.length} tools discovered` : 'Connect to discover the real tool list'}</small>
        </div>
        {item.error && <p className="mcp-error">{item.error}</p>}
        {!isReady && tools.length > 0 && <p className="lane-note">Catalog preview — connecting replaces this with the tools the server actually reports.</p>}
        <div className="mcp-tool-list">
          {tools.map((tool) => {
            const key = `${item.id}:${tool.name}`;
            const run = toolRuns[key] || {};
            const blocked = tool.levelId === 'destructive' || tool.level === 'Destructive · blocked';
            return (
              <div className="mcp-tool-row" key={tool.name}>
                <div className="mcp-tool-head">
                  <span className="mcp-tool-name">{tool.name}</span>
                  <span className={cx('level-pill', tool.levelId || (tool.level === 'Read' ? 'read' : blocked ? 'destructive' : 'write'))}>{tool.level}</span>
                  <button
                    type="button"
                    className="ghost-button mcp-run-toggle"
                    disabled={!isReady || blocked}
                    onClick={() => setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], open: !runs[key]?.open, argsText: runs[key]?.argsText ?? argsSkeleton(tool) } }))}
                  >
                    {blocked ? 'Blocked' : 'Run'}
                  </button>
                </div>
                {tool.description && <p className="mcp-tool-desc">{tool.description}</p>}
                {run.open && (
                  <div className="mcp-runner">
                    <textarea
                      className="mcp-args"
                      rows={3}
                      value={run.argsText ?? argsSkeleton(tool)}
                      onChange={(event) => setToolRuns((runs) => ({ ...runs, [key]: { ...runs[key], argsText: event.target.value } }))}
                      aria-label={`Arguments for ${tool.name} as JSON`}
                    />
                    <div className="mcp-runner-actions">
                      <button type="button" className="dark-button" disabled={run.busy} onClick={() => runMcpTool(item, tool, run.argsText ?? argsSkeleton(tool))}>
                        {run.busy ? <Loader2 className="spin" size={14} /> : <Play size={14} />} {tool.levelId === 'write' ? 'Review & run' : 'Run tool'}
                      </button>
                      {tool.levelId === 'write' && <small>Write tool — you approve the exact call first.</small>}
                    </div>
                    {run.error && <p className="mcp-error">{run.error}</p>}
                    {run.result && <pre className="mcp-result">{run.result}</pre>}
                  </div>
                )}
              </div>
            );
          })}
          {!tools.length && <p className="lane-note">No tools yet — connect the server to discover them.</p>}
        </div>
        {isReady && (item.resources || []).length > 0 && (
          <div className="mcp-tool-list">
            <div className="section-label">Resources</div>
            {item.resources.map((resource) => {
              const key = `${item.id}:res:${resource.uri}`;
              const run = toolRuns[key] || {};
              return (
                <div className="mcp-tool-row" key={resource.uri}>
                  <div className="mcp-tool-head">
                    <span className="mcp-tool-name">{resource.name}</span>
                    <span className="level-pill read">Resource</span>
                    <button type="button" className="ghost-button mcp-run-toggle" disabled={run.busy} onClick={() => readResourceInto(item, resource)}>
                      {run.busy ? 'Reading…' : 'Read'}
                    </button>
                  </div>
                  {resource.description && <p className="mcp-tool-desc">{resource.uri}</p>}
                  {run.error && <p className="mcp-error">{run.error}</p>}
                  {run.result && <pre className="mcp-result">{run.result}</pre>}
                </div>
              );
            })}
          </div>
        )}
        {pendingApproval?.serverId === item.id && (
          <div className="mcp-approval-card" role="group" aria-label="MCP approval">
            <div>
              <strong>Approval required</strong>
              <p>{item.name} · {pendingApproval.tool.name} · Write action</p>
              <small>Arguments: {JSON.stringify(pendingApproval.args)} — review before anything runs.</small>
            </div>
            <div className="mcp-approval-actions">
              <button type="button" className="ghost-button" onClick={rejectPendingTool}>Cancel</button>
              <button type="button" className="dark-button" onClick={approvePendingTool}>Approve & run</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderIntegrations = () => {
    const selectedLogs = mcpLogs.filter((log) => !selectedItem || log.server === selectedItem.name).slice(0, 5);

    return (
      <div className="list-scroll store-list mcp-board">
        <div className="section-label">MCP Servers <span>{visibleItems.length}</span></div>
        <div className="mcp-note"><ShieldCheck size={15} /> MCP is off until you explicitly connect a server. Write actions require approval; destructive tools stay blocked.</div>
        {visibleItems.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={cx('store-row', index === selectedIndex && 'selected')}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => { setSelectedIndex(index); runPrimary(item); }}
          >
            <span className="store-avatar brand-avatar"><BrandLogo name={item.name} domain={item.domain} className="store-brand-logo" allowFallback /></span>
            <span className="rich-copy">
              <strong>{item.name} MCP</strong>
              <small>{item.detail}</small>
            </span>
            <span className="store-meta">
              <span><Blocks size={14} /> {item.authType}</span>
              <span>{item.scope} · {item.status === 'ready' ? `${item.tools.length} tools` : 'Not connected'}</span>
              <span className={cx('connection-pill', item.connected && 'connected')}>{mcpStatusLabel(item)}</span>
            </span>
          </button>
        ))}
        <button type="button" className="add-connection" onClick={() => setShowAddMcp((open) => !open)} aria-expanded={showAddMcp}>
          <Plus size={16} /> Add MCP Server
        </button>
        {showAddMcp && renderAddMcpForm()}
        {selectedItem && (
          <>
            <div className="integration-detail">
              <div>
                <strong className="integration-detail-title"><BrandLogo name={selectedItem.name} domain={selectedItem.domain} className="inline-brand-logo" allowFallback /> {selectedItem.name} MCP</strong>
                <p>{selectedItem.detail}</p>
                <p>{selectedItem.authType} · {selectedItem.scope} scope</p>
              </div>
              <span className="privacy-note"><ShieldCheck size={14} /> Credentials stay on this device</span>
            </div>
            {renderMcpEndpoint(selectedItem)}
            {renderMcpTools(selectedItem)}
            <div className="mcp-log-card">
              <strong>Action logs</strong>
              {selectedLogs.length ? selectedLogs.map((log) => (
                <p key={log.id}><span>{log.status}</span> {log.server}.{log.tool} · {log.time}</p>
              )) : <p>No MCP actions yet. Connects, tool runs and approvals will be logged here.</p>}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderCreate = () => (
    <form className="shortcut-form recipe-form" onSubmit={(event) => { event.preventDefault(); submitCreateShortcut(); }}>
      <div className="recipe-builder-header">
        <span>Shortcut recipe builder</span>
        <h2>Turn a repeated job into one name.</h2>
        <p>Save the command once. Run it from the command card in any app, with the same visible context and review step.</p>
      </div>

      <div className="recipe-builder">
        <div className="recipe-fields">
          <div className="form-row">
            <label htmlFor="shortcut-name">Name</label>
            <input id="shortcut-name" autoFocus value={createForm.name} onChange={(event) => setCreateForm((value) => ({ ...value, name: event.target.value }))} placeholder="e.g. Reply in Our Voice" />
          </div>
          <div className="form-row top">
            <label htmlFor="shortcut-instruction">Command</label>
            <textarea id="shortcut-instruction" value={createForm.instruction} onChange={(event) => setCreateForm((value) => ({ ...value, instruction: event.target.value }))} placeholder="Draft a reply to this ticket in our support tone…" />
          </div>
          <div className="form-row">
            <label htmlFor="shortcut-format">Output format</label>
            <PremiumSelect id="shortcut-format" ariaLabel="Output format" value={createForm.outputType} options={['Text', 'Markdown', 'Table', 'CSV', 'TSV', 'Code']} onChange={(value) => setCreateForm((v) => ({ ...v, outputType: value }))} />
          </div>
          <div className="form-row">
            <label htmlFor="shortcut-tone">Tone</label>
            <input id="shortcut-tone" value={createForm.tone} onChange={(event) => setCreateForm((value) => ({ ...value, tone: event.target.value }))} placeholder="Optional — e.g. calm, direct, technical" />
          </div>
          <div className="form-row">
            <label htmlFor="shortcut-visibility">Visibility</label>
            <PremiumSelect id="shortcut-visibility" ariaLabel="Visibility" value={createForm.visibility} options={['Personal', 'Workspace']} onChange={(value) => setCreateForm((v) => ({ ...v, visibility: value }))} />
          </div>
          <div className="form-row">
            <label htmlFor="shortcut-mcp">MCP tools</label>
            <PremiumSelect id="shortcut-mcp" ariaLabel="MCP tools" value={createForm.mcp} options={['No MCP tools', 'Read-only tools only', 'Approved write tools', ...readyServers.map((server) => `${server.name} MCP · connected`)]} onChange={(value) => setCreateForm((v) => ({ ...v, mcp: value }))} />
          </div>
        </div>

        <aside className="recipe-preview-card" aria-label="Live Shortcut preview">
          <span className="recipe-preview-label">Live recipe</span>
          <span className="detail-icon"><Command size={24} /></span>
          <h3>{createForm.name.trim() || 'Untitled Shortcut'}</h3>
          <p>{createForm.instruction.trim() || 'Your saved command will appear here as you write it.'}</p>
          <div className="recipe-preview-chips">
            <span>{createForm.outputType}</span>
            <span>{createForm.visibility}</span>
            <span>{createForm.mcp}</span>
            {createForm.tone.trim() && <span>{createForm.tone.trim()}</span>}
          </div>
          <div className="insertion-path recipe-path">
            <span>Context</span><ArrowRight size={13} /><span>Review</span><ArrowRight size={13} /><span>Insert</span>
          </div>
          <p className="lane-note"><ShieldCheck size={14} /> MCP writes still require approval.</p>
        </aside>
      </div>
    </form>
  );


  const primaryActionLabel = () => {
    if (view.name === 'transform') return output ? 'Regenerate' : 'Generate';
    if (view.name === 'shortcuts') return 'Open Shortcut';
    if (view.name === 'integrations') return selectedItem?.connected ? 'Disconnect' : 'Connect';
    if (view.name === 'create') return 'Create Shortcut';
    if (selectedItem?.kind === 'transform') return 'Open Shortcut';
    if (selectedItem?.kind === 'dashboard') return `Open ${selectedItem.title}`;
    return 'Open Command';
  };

  const footerContext = () => {
    const labels = {
      root: 'Zerthik',
      transform: selectedItem?.title || 'Shortcut',
      shortcuts: 'Shortcut Library',
      integrations: 'MCP Connections',
      create: 'Create Shortcut',
    };
    return labels[view.name] || 'Zerthik';
  };

  const searchPlaceholder = {
    root: 'Type a command or search Shortcuts…',
    transform: 'Search Shortcuts…',
    shortcuts: 'Search Shortcuts…',
    integrations: 'Search MCP servers…',
    create: '',
  }[view.name];

  const renderHeaderAccessory = () => {
    if (view.name === 'root') {
      return (
        <button type="button" className="ask-ai" onClick={() => startVoiceInput('query')}>
          <Mic size={14} /> Voice
        </button>
      );
    }
    if (view.name === 'transform') {
      return (
        <span className="header-select">
          <PremiumSelect
            variant="header"
            ariaLabel="Active app"
            value={activeApp}
            options={['Gmail', 'Slack', 'Google Docs', 'Notion', 'VS Code']}
            onChange={setActiveApp}
            leading={<BrandLogo name={activeApp} className="header-brand-logo" />}
            optionIcon={(option) => <BrandLogo name={option.value} className="inline-brand-logo" />}
          />
        </span>
      );
    }
    if (view.name === 'integrations') {
      const categories = [
        { name: 'Connected', icon: Plug },
        { name: 'All Categories', icon: Blocks },
        { name: 'Developer', icon: Code2 },
        { name: 'Productivity', icon: FileText },
        { name: 'Communication', icon: Users },
        { name: 'Design', icon: Palette },
      ].filter((category) => fuzzyIncludes(mcpCategoryQuery, category.name));
      return (
        <div className="category-menu-wrap">
          <button type="button" className="category-button" onClick={() => setMcpMenuOpen((open) => !open)} aria-expanded={mcpMenuOpen}>
            <Blocks size={15} /> {mcpFilter} <ChevronDown size={14} />
          </button>
          {mcpMenuOpen && (
            <div className="category-popover" role="menu" aria-label="MCP categories">
              <label className="category-search">
                <Search size={14} />
                <input autoFocus value={mcpCategoryQuery} onChange={(event) => setMcpCategoryQuery(event.target.value)} placeholder="Search categories..." />
              </label>
              {categories.map((category) => {
                const Icon = category.icon;
                const active = mcpFilter === category.name;
                return (
                  <button
                    type="button"
                    key={category.name}
                    className={cx('category-option', active && 'active')}
                    onClick={() => { setMcpFilter(category.name); setMcpMenuOpen(false); setSelectedIndex(0); focusSearch(); }}
                  >
                    {active ? <Check size={15} /> : <Icon size={15} />} {category.name}
                  </button>
                );
              })}
              {categories.length === 0 && <div className="empty-state compact-empty">No categories found</div>}
            </div>
          )}
        </div>
      );
    }
    return null;
  };


  const renderLauncherBody = () => {
    if (view.name === 'root') return renderRoot();
    if (view.name === 'transform') return renderTransform();
    if (view.name === 'shortcuts') return renderShortcuts();
    if (view.name === 'integrations') return renderIntegrations();
    if (view.name === 'create') return renderCreate();
    return renderRoot();
  };

  const isCompact = windowMode === 'compact' && view.name === 'root' && !query && !actionOpen;

  const renderLauncher = () => (
    <div className="launcher-shell palette-shell">
      <div className="palette-workspace">
      {!isCompact && (
        <div className="brand-strip">
          <span className="brand-side brand-hotkey"><Keyboard size={13} /> {globalHotkey}</span>
          <button type="button" className="brand-lockup" onClick={goToCommandDeck} aria-label="Zerthik home">
            <Logo />
            <span>Zerthik</span>
          </button>
          <span className="brand-side brand-plan-wrap">
            <button type="button" className="brand-plan" onClick={() => openDashboard('Plans & Billing')}>{plan}</button>
          </span>
        </div>
      )}
      <header className="launcher-header command-console">
        {viewStack.length > 1 ? (
          <button type="button" className="back-button" onClick={goBack} aria-label="Go back"><ChevronLeft size={19} /></button>
        ) : (
          <span className="search-leading">{isCompact ? <Logo small /> : <Search size={18} />}</span>
        )}
        {view.name === 'create' ? (
          <div className="header-title">Create Shortcut</div>
        ) : (
          <input
            ref={searchRef}
            autoFocus={!isEmbedMode()}
            className="search-input"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setRootUseCase('All'); setSelectedIndex(0); }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        )}
        {renderHeaderAccessory()}
      </header>

      {!isCompact && (
        <>
          <div className="launcher-body">{renderLauncherBody()}</div>
          <footer className="launcher-footer execution-dock">
            <button type="button" className="footer-context footer-menu-button" onClick={() => setAppMenuOpen((open) => !open)} aria-expanded={appMenuOpen}><Logo small /> {footerContext()}</button>
            <span className="dock-status">{Object.values(context).filter(Boolean).length} context on · Review before insert</span>
            <span className="row-spacer" />
            <button type="button" className="footer-action" onClick={() => view.name === 'create' ? submitCreateShortcut() : runPrimary(selectedItem)}>
              {primaryActionLabel()} <Keys keys={view.name === 'transform' || view.name === 'create' ? [platform === 'mac' ? '⌘' : 'Ctrl', '↵'] : ['↵']} />
            </button>
            <span className="footer-divider" />
            <button
              type="button"
              className="footer-action muted-action"
              onClick={() => { if (selectedCommand) { setActionOpen(true); setActionMode('list'); } }}
            >
              Actions <Keys keys={[platform === 'mac' ? '⌘' : 'Ctrl', 'K']} />
            </button>
          </footer>
        </>
      )}

      {isCompact && prefs.showFavoritesCompact && (
        <div className="compact-favorites">
          {allCommands.filter((command) => favorites.includes(command.id)).slice(0, 6).map((command) => {
            const Icon = command.icon;
            return (
              <button type="button" key={command.id} onClick={() => openTransform(command)} title={command.title}>
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      </div>

      {appMenuOpen && (
        <section className="app-menu" aria-label="Zerthik app menu">
          <div className="app-menu-version">Zerthik v0.1.0</div>
          {[
            { label: 'Command Card', icon: Home, action: () => { setSurface('launcher'); setViewStack([{ name: 'root' }]); setQuery(''); setAppMenuOpen(false); focusSearch(); } },
            { label: 'Home', icon: Home, action: () => { openDashboard('Home'); setAppMenuOpen(false); } },
            { label: 'Shortcuts', icon: Keyboard, action: () => { openDashboard('Shortcuts'); setAppMenuOpen(false); } },
            { label: 'Create Shortcut', icon: Plus, action: openCreateShortcut },
            { label: 'MCP Connections', icon: Blocks, action: () => { openDashboard('MCP Connections'); setAppMenuOpen(false); } },
            { label: 'API Keys', icon: KeyRound, action: () => { openDashboard('API Keys'); setAppMenuOpen(false); } },
            { label: 'Usage', icon: Gauge, action: () => { openDashboard('Usage'); setAppMenuOpen(false); } },
            { label: 'Plans & Billing', icon: CreditCard, action: () => { openDashboard('Plans & Billing'); setAppMenuOpen(false); } },
            { label: 'Team', icon: Users, action: () => { openDashboard('Team'); setAppMenuOpen(false); } },
            { label: 'Replay Onboarding', icon: RotateCcw, action: replayOnboarding },
            { label: 'Settings', icon: Settings, action: () => { openDashboard('Settings'); setAppMenuOpen(false); }, keys: [platform === 'mac' ? '⌘' : 'Ctrl', ','] },
          ].filter((item) => fuzzyIncludes(appMenuQuery, item.label)).map((item, index) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.label} className={cx('app-menu-row', index === 0 && 'selected')} onClick={item.action}>
                <Icon size={16} /> <span>{item.label}</span>
                <span className="row-spacer" />
                {item.keys && <Keys keys={item.keys} />}
              </button>
            );
          })}
          <label className="app-menu-search">
            <Search size={14} />
            <input autoFocus value={appMenuQuery} onChange={(event) => setAppMenuQuery(event.target.value)} placeholder="Search for actions..." />
          </label>
        </section>
      )}

      {actionOpen && (
        <ActionPanel
          item={selectedCommand}
          platform={platform}
          isFavorite={selectedCommand ? favorites.includes(selectedCommand.id) : false}
          mode={actionMode}
          setMode={setActionMode}
          pendingHotkey={pendingHotkey}
          onAction={handleAction}
          onClose={() => { setActionOpen(false); focusSearch(); }}
          onConfirmHotkey={confirmHotkey}
          onSaveAlias={saveAlias}
        />
      )}
    </div>
  );

  const updatePref = (key, value) => setPrefs((items) => ({ ...items, [key]: value }));

  const settingsNav = [
    { name: 'Home', icon: Home },
    { name: 'Shortcuts', icon: Keyboard },
    { name: 'MCP Connections', icon: Blocks },
    { name: 'API Keys', icon: KeyRound },
    { name: 'Usage', icon: Gauge },
    { name: 'Plans & Billing', icon: CreditCard },
    { name: 'Team', icon: Users },
    { name: 'Settings', icon: Settings },
  ];

  const renderSettingsContent = () => {
    const allowance = plan === 'Free' ? 50 : plan === 'Team' ? 2500 : plan === 'Business' ? 6000 : 1000;
    const usagePercent = Math.min(100, Math.round((usageCount / allowance) * 100));
    const connectedMcp = mcpItems.filter((item) => item.connected).length;
    const workspaceShortcuts = shortcutItems.filter((item) => item.visibility === 'Workspace').length;

    if (settingsSection === 'Home') {
      return (
        <>
          <div className="billing-card">
            <div>
              <span>Workspace</span>
              <h2>{plan}</h2>
              <p>{plan === 'Pro Trial' ? '14-day Pro trial' : `${plan} plan`} · {allowance.toLocaleString()} AI actions this month · no payment card required.</p>
            </div>
            <span className="trial-badge"><Check size={14} /> {authState === 'connected' ? 'Signed in' : 'Local mode'}</span>
          </div>
          <div className="settings-group">
            <SettingRow title="AI Actions Used" description={`${usageCount} of ${allowance.toLocaleString()} actions used this month.`}>
              <span className="usage-meter"><i style={{ width: `${Math.max(4, usagePercent)}%` }} /></span>
            </SettingRow>
            <SettingRow title="Saved Shortcuts" description={`${shortcutItems.length} personal and workspace Shortcuts can be run by name.`}>
              <button type="button" className="dark-button" onClick={() => setSettingsSection('Shortcuts')}>View</button>
            </SettingRow>
            <SettingRow title="MCP Servers" description={connectedMcp ? `${connectedMcp} server connected. Write actions still require approval.` : 'No MCP servers connected. MCP stays off until you connect one.'}>
              <button type="button" className="dark-button" onClick={() => setSettingsSection('MCP Connections')}>Manage</button>
            </SettingRow>
          </div>
          <h3 className="settings-heading">Onboarding</h3>
          <div className="settings-group">
            <SettingRow title="Permissions" description="Accessibility, clipboard and optional screenshot access are confirmed on this device.">
              <span className="trial-badge"><Check size={14} /> Ready</span>
            </SettingRow>
            <SettingRow title="Global Hotkey" description="Open Zerthik over the active app.">
              <span className="hotkey-chip">{globalHotkey}</span>
            </SettingRow>
            <SettingRow title="Practice Transformation" description="Run one Shortcut with visible context before inserting output.">
              <button type="button" className="dark-button" onClick={() => { setSurface('launcher'); openTransform(shortcutItems[0]); }}>Practice</button>
            </SettingRow>
            <SettingRow title="Replay Onboarding" description="Review sign-in, permissions, the global hotkey and a practice transformation.">
              <button type="button" className="dark-button" onClick={replayOnboarding}>Replay</button>
            </SettingRow>
          </div>
        </>
      );
    }

    if (settingsSection === 'Shortcuts') {
      return (
        <>
          <div className="settings-list-card">
            {shortcutItems.map((shortcut) => {
              const enabled = !disabledIds.includes(shortcut.id);
              const Icon = shortcut.icon;
              return (
                <div className="settings-command-row" key={shortcut.id}>
                  <span className="row-icon"><Icon size={16} /></span>
                  <span className="rich-copy"><strong>{shortcut.title}</strong><small>{shortcut.visibility} · {shortcut.outputType} · {shortcut.source}</small></span>
                  <Keys keys={keysForCommand(shortcut, platform, hotkeyOverrides, aliasOverrides)} />
                  <Toggle
                    checked={enabled}
                    label={`Enable ${shortcut.title}`}
                    onChange={(value) => setDisabledIds((items) => value ? items.filter((id) => id !== shortcut.id) : [...items, shortcut.id])}
                  />
                </div>
              );
            })}
          </div>
          <button type="button" className="add-connection" onClick={() => { setSurface('launcher'); pushView({ name: 'create', commandId: 'create-shortcut' }); }}>
            <Plus size={16} /> Create Shortcut
          </button>
        </>
      );
    }

    if (settingsSection === 'MCP Connections') {
      return (
        <>
          <div className="settings-list-card">
            {mcpItems.map((item) => (
              <div key={item.id}>
                <div
                  className="settings-command-row"
                  onClick={() => setMcpExpandedId((current) => (current === item.id ? '' : item.id))}
                >
                  <span className="store-avatar small-avatar brand-avatar"><BrandLogo name={item.name} domain={item.domain} className="store-brand-logo" allowFallback /></span>
                  <span className="rich-copy"><strong>{item.name} MCP</strong><small>{item.authType} · {item.scope} · {item.status === 'ready' ? `${item.tools.length} tools` : item.status === 'error' ? 'Connection failed' : 'Not connected'}</small></span>
                  <span onClick={(event) => event.stopPropagation()}>
                    <Toggle
                      checked={item.connected}
                      label={`Connect ${item.name} MCP server`}
                      onChange={(value) => setServerConnected(item, value)}
                    />
                  </span>
                </div>
                {mcpExpandedId === item.id && (
                  <div className="mcp-settings-detail">
                    {renderMcpEndpoint(item)}
                    {renderMcpTools(item)}
                  </div>
                )}
              </div>
            ))}
            <button type="button" className="add-connection" onClick={() => setShowAddMcp((open) => !open)} aria-expanded={showAddMcp}>
              <Plus size={16} /> Add MCP Server
            </button>
          </div>
          {showAddMcp && renderAddMcpForm()}
          <div className="info-card"><ShieldCheck size={17} /><p><strong>MCP is disabled by default.</strong> Read tools can run after connection, write tools require approval, destructive tools are blocked, and every MCP action is logged.</p></div>
        </>
      );
    }

    if (settingsSection === 'API Keys') {
      return (
        <>
          <div className="settings-group">
            <SettingRow title="Personal API Key" description={apiKeyRevoked ? 'No active personal key. Create a key to use the transform API.' : 'Stored hashed. The full key is shown only once at creation.'}>
              <span className="api-key">{apiKeyRevoked ? 'No active key' : 'zk_live_4f8a••••••••'}</span>
            </SettingRow>
            <SettingRow title="Scopes" description="transform:write · shortcuts:read">
              <span className="hotkey-chip">Pro</span>
            </SettingRow>
            <SettingRow title="Rate Limit" description="Pro and trial workspaces can send 60 requests per minute.">
              <span className="hotkey-chip">60/min</span>
            </SettingRow>
            <div className="api-actions">
              {apiKeyRevoked ? (
                <button type="button" className="dark-button" onClick={() => { setApiKeyRevoked(false); showToast('In production, the full key is shown only once here'); }}>Create API Key</button>
              ) : (
                <button type="button" className="ghost-button danger-text" onClick={() => { setApiKeyRevoked(true); showToast('API key revoked'); }}><Trash2 size={14} /> Revoke</button>
              )}
              <button type="button" className="ghost-button" onClick={() => copyText('https://api.zerthik.app/v1/transform', 'API endpoint copied')}><Copy size={14} /> Copy endpoint</button>
            </div>
          </div>
          <div className="code-card">
            <span>POST https://api.zerthik.app/v1/transform</span>
            <pre>{`{
  "command": "Create a GitHub issue draft from this error",
  "outputType": "markdown",
  "context": { "selectedText": "...", "activeApp": "Terminal" }
}`}</pre>
          </div>
        </>
      );
    }

    if (settingsSection === 'Usage') {
      return (
        <>
          <div className="settings-group">
            <SettingRow title="AI Actions" description={`${usageCount} of ${allowance.toLocaleString()} used this month. Failed Zerthik system errors do not consume allowance.`}>
              <span className="usage-meter"><i style={{ width: `${Math.max(4, usagePercent)}%` }} /></span>
            </SettingRow>
            <SettingRow title="MCP Actions" description="Approved and rejected MCP write actions are recorded with redacted summaries.">
              <span className="hotkey-chip">{mcpLogs.length}</span>
            </SettingRow>
          </div>
          <h3 className="settings-heading">Recent activity — redacted</h3>
          <div className="settings-list-card">
            {usageEvents.length ? usageEvents.map((event) => (
              <div className="settings-command-row" key={event.id}>
                <span className="row-icon"><Activity size={16} /></span>
                <span className="rich-copy"><strong>{event.label}</strong><small>{event.status}</small></span>
                <span className="row-type">{event.time}</span>
              </div>
            )) : <div className="empty-state compact-empty">No recent activity</div>}
          </div>
        </>
      );
    }

    if (settingsSection === 'Plans & Billing') {
      const plans = [
        ['Free', '$0', '50 AI actions/month · MCP not included · No API access'],
        ['Pro', '$10/user/month · $96/year', '1,000 AI actions/month · 2 personal MCP servers · API 60/min'],
        ['Team', '$16/user/month · $154/year', '2,500 AI actions/user · 10 shared MCP servers · Minimum 3 seats'],
        ['Business', '$28/user/month · $269/year', '6,000 AI actions/user · 25 shared MCP servers · Minimum 5 seats'],
      ];
      return (
        <>
          <div className="billing-card">
            <div>
              <span>Current plan</span>
              <h2>{plan}</h2>
              <p>{plan === 'Pro Trial' ? '14-day Pro trial active. No payment card was required. Data and Shortcuts are preserved if the trial ends.' : 'No payment card on file. Your Shortcuts and data stay on this device.'}</p>
            </div>
            <span className="trial-badge"><Check size={14} /> {plan === 'Pro Trial' ? '14 days left' : authState === 'connected' ? 'Signed in' : 'Local mode'}</span>
          </div>
          <div className="settings-group">
            {plans.map(([name, price, detail]) => (
              <SettingRow key={name} title={`${name} — ${price}`} description={detail}>
                {name === 'Free' ? <span className="hotkey-chip">{plan === 'Free' ? 'Current plan' : 'After trial'}</span> : <button type="button" className="dark-button" onClick={() => showToast('Hosted Dodo checkout opens in your browser')}>Upgrade</button>}
              </SettingRow>
            ))}
          </div>
          <div className="settings-group">
            <SettingRow title="Manage Subscription" description="Payment method, invoices and cancellation open in the provider billing portal. Plan and seat changes stay in the app.">
              <button type="button" className="dark-button" onClick={() => showToast('Billing portal opens in your browser')}>Manage</button>
            </SettingRow>
          </div>
        </>
      );
    }

    if (settingsSection === 'Team') {
      return (
        <>
          <div className="settings-list-card">
            <div className="settings-command-row">
              <span className="account-avatar"><User size={17} /></span>
              <span className="rich-copy"><strong>You</strong><small>{authState === 'connected' ? 'Signed in on this device' : 'Local mode · not signed in'}</small></span>
              <span className="hotkey-chip">Admin</span>
            </div>
            <p className="settings-empty-note">No teammates yet — invite your team to share Shortcuts and MCP connections.</p>
            <button type="button" className="add-connection" onClick={() => showToast('Sign in to invite your team')}>
              <Plus size={16} /> Invite Member
            </button>
          </div>
          <div className="settings-group">
            <SettingRow title="Seats" description="Team plans require at least 3 seats. Seat changes are made here in the app.">
              <span className="hotkey-chip">3 seats</span>
            </SettingRow>
            <SettingRow title="Shared Shortcuts" description="Admins can create workspace Shortcuts that members can run.">
              <span className="hotkey-chip">{workspaceShortcuts}</span>
            </SettingRow>
            <SettingRow title="Shared MCP" description="Only admins manage workspace MCP permissions and allowed roles.">
              <span className="hotkey-chip">Admins</span>
            </SettingRow>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="settings-group">
          <SettingRow title="Open at Login" description="Start Zerthik quietly when you sign in so the global shortcut is ready.">
            <Toggle checked={prefs.launch} onChange={(value) => updatePref('launch', value)} label="Open at Login" />
          </SettingRow>
          <SettingRow title={platform === 'mac' ? 'Show in Menu Bar' : 'Show in System Tray'} description="Keep Zerthik available from the desktop tray or menu bar.">
            <Toggle checked={prefs.tray} onChange={(value) => updatePref('tray', value)} label="Show tray icon" />
          </SettingRow>
          <SettingRow title="Global Shortcut" description="Open the floating command card over the active app. Zerthik warns if another app uses the same shortcut.">
            <span className="hotkey-chip">{globalHotkey}</span>
          </SettingRow>
          <SettingRow title="Pause Zerthik" description="Stop context capture until you resume Zerthik.">
            <Toggle checked={prefs.pause} onChange={(value) => updatePref('pause', value)} label="Pause Zerthik" />
          </SettingRow>
        </div>

        <h3 className="settings-heading">Command Card</h3>
        <div className="settings-group">
          <SettingRow title="Context Chips" description="Selected text, clipboard, active app, screenshot and MCP context stay visible and removable before submission.">
            <Toggle checked={prefs.contextChips} onChange={(value) => updatePref('contextChips', value)} label="Context chips" />
          </SettingRow>
          <SettingRow title="Voice Commands" description="Allow microphone input inside the command card.">
            <Toggle checked={prefs.voice} onChange={(value) => updatePref('voice', value)} label="Voice commands" />
          </SettingRow>
          <SettingRow title="Universal Insertion" description="Try accessibility insertion, then clipboard paste, then keyboard simulation. If all fail, copy the output.">
            <Toggle checked={prefs.autoInsert} onChange={(value) => updatePref('autoInsert', value)} label="Universal insertion" />
          </SettingRow>
        </div>

        <h3 className="settings-heading">Context & Privacy</h3>
        <div className="settings-group">
          <SettingRow title="Clipboard Context" description="Allow the current clipboard content to appear as a removable chip. Full clipboard content is not stored in logs.">
            <Toggle checked={prefs.clipboard} onChange={(value) => { updatePref('clipboard', value); setContext((items) => ({ ...items, clipboard: value })); }} label="Clipboard context" />
          </SettingRow>
          <SettingRow title="Screenshot Context" description="Allow optional screenshot capture when you attach it.">
            <Toggle checked={prefs.screenshot} onChange={(value) => { updatePref('screenshot', value); setContext((items) => ({ ...items, screenshot: value })); }} label="Screenshot context" />
          </SettingRow>
          <SettingRow title="Active-App Detection" description="Detect the active application and window title for context.">
            <Toggle checked={prefs.activeApp} onChange={(value) => { updatePref('activeApp', value); setContext((items) => ({ ...items, app: value })); }} label="Active app detection" />
          </SettingRow>
          <SettingRow title="Sensitive Apps Blocked" description="Password managers, banking apps, private windows and sensitive apps are blocked by default.">
            <Toggle checked={prefs.sensitiveApps} onChange={(value) => updatePref('sensitiveApps', value)} label="Sensitive apps blocked" />
          </SettingRow>
          <SettingRow title="Custom Blocked Apps" description="Add apps or domains where Zerthik must never capture context.">
            <button type="button" className="dark-button" onClick={() => showToast('Choose an app or domain to block in the desktop build')}>Add</button>
          </SettingRow>
          <SettingRow title="Redact Secrets" description="Detect API keys, tokens and passwords before context is sent.">
            <Toggle checked={prefs.redact} onChange={(value) => updatePref('redact', value)} label="Redact secrets" />
          </SettingRow>
          <SettingRow title="Clear Recent Activity" description="Clear redacted usage activity shown on this device.">
            <button type="button" className="ghost-button danger-text" onClick={() => { setUsageEvents([]); showToast('Recent activity cleared'); }}>Clear</button>
          </SettingRow>
        </div>

        <h3 className="settings-heading">AI</h3>
        <div className="info-card"><ShieldCheck size={17} /><p><strong>Output is checked before you review it.</strong> Source facts are preserved, and missing facts are not invented.</p></div>

        <h3 className="settings-heading">Appearance</h3>
        <div className="settings-group">
          <SettingRow title="Theme" description="Transparent glass, or deep black. Applies instantly, everywhere.">
            <div className="segmented theme-picker">
              {[['transparent', 'Transparent'], ['black', 'Black']].map(([value, label]) => (
                <button type="button" key={value} className={cx('theme-option', theme === value && 'active')} onClick={() => setTheme(value)}>
                  <i className={cx('theme-dot', `dot-${value}`)} />{label}
                </button>
              ))}
            </div>
          </SettingRow>
        </div>

        <h3 className="settings-heading">Accessibility</h3>
        <div className="settings-group">
          <SettingRow title="Keyboard Labels" description="Choose how shortcut labels are displayed in this preview.">
            <div className="segmented">
              <button type="button" className={platform === 'windows' ? 'active' : ''} onClick={() => setPlatform('windows')}>Windows</button>
              <button type="button" className={platform === 'mac' ? 'active' : ''} onClick={() => setPlatform('mac')}>Mac</button>
            </div>
          </SettingRow>
          <SettingRow title="Interface Size" description="Adjust the size of the Zerthik interface.">
            <div className="segmented aa">
              {['small', 'medium', 'large'].map((size) => (
                <button type="button" key={size} className={interfaceSize === size ? 'active' : ''} onClick={() => setInterfaceSize(size)}>Aa</button>
              ))}
            </div>
          </SettingRow>
        </div>
      </>
    );
  };

  const filteredSettingsNav = settingsNav.filter((item) => fuzzyIncludes(settingsQuery, item.name));

  const renderSettings = () => (
    <div className="settings-shell control-shell">
      <aside className="settings-sidebar control-nav">
        <div className="window-controls" aria-hidden="true">
          {platform === 'mac' ? <><i className="red" /><i className="yellow" /><i className="green" /></> : <button type="button" onClick={() => setSurface('launcher')} aria-label="Back to launcher"><ArrowLeft size={16} /></button>}
        </div>
        <label className="settings-search">
          <Search size={15} />
          <input value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder="Search dashboard…" />
        </label>
        <div className="account-row">
          <span className="account-logo"><Logo /></span>
          <span><strong>Zerthik Account</strong><small>{authState === 'connected' ? (plan === 'Pro Trial' ? 'Pro Trial · 14 days left' : `${plan} plan`) : 'Local mode · not signed in'}</small></span>
        </div>
        <nav>
          {filteredSettingsNav.map((item) => {
            const Icon = item.icon;
            return (
              <button type="button" key={item.name} className={cx(settingsSection === item.name && 'active')} onClick={() => setSettingsSection(item.name)}>
                <Icon size={16} /> {item.name}
              </button>
            );
          })}
        </nav>
        <button type="button" className="back-to-app" onClick={() => { setSurface('launcher'); focusSearch(); }}>
          <ArrowLeft size={15} /> Back to Command Card
        </button>
      </aside>
      <section className="settings-content control-content">
        <div className="settings-topbar control-topbar">
          <div className="history-buttons">
            <button type="button" onClick={() => setSurface('launcher')} aria-label="Back"><ChevronLeft size={16} /></button>
            <button type="button" disabled aria-label="Forward"><ChevronLeft size={16} className="flip" /></button>
          </div>
          <span>{settingsSection}</span>
          <span className="row-spacer" />
          <span className="settings-saved"><Check size={13} /> Desktop only</span>
        </div>
        <div className="settings-scroll">{renderSettingsContent()}</div>
      </section>
    </div>
  );

  const renderOnboarding = () => {
    const stepLabels = ['Welcome', 'Core workflow', 'Sign in & trial', 'Permissions', 'Global hotkey', 'Practice'];
    const practiceCommand = shortcutItems.find((item) => item.id === 'polite-nudge') || shortcutItems[0];
    const nextStep = () => {
      if (onboardingStep >= 5) completeOnboarding();
      else goToOnboardingStep(onboardingStep + 1);
    };
    const primaryLabel = onboardingStep === 0
      ? 'Get Started'
      : onboardingStep === 5
        ? 'Open Command Card'
        : 'Continue';
    const primaryDisabled = false;

    const renderWelcome = () => (
      <div className="onboarding-center">
        <span className="onboarding-logo"><Logo /></span>
        <h1>Turn any context into the output you need.</h1>
        <p>Select something in any app, press one shortcut, say what you need, then review and insert the result where you were already working.</p>
        {authState === 'connected' ? (
          <span className="onboarding-status">Connected to your Zerthik account</span>
        ) : (
          <button type="button" className="onboarding-signin-link" onClick={() => goToOnboardingStep(2)}><User size={15} /> Sign In</button>
        )}
      </div>
    );

    const renderCore = () => (
      <div className="onboarding-split">
        <div className="onboarding-copy">
          <span className="onboarding-eyebrow">Core workflow</span>
          <h2>Start from what is already on screen.</h2>
          <p>Zerthik uses the context you approve — selected text, clipboard, active app, an optional screenshot, or connected MCP tools.</p>
          <div className="onboarding-points">
            <span><ScanText size={16} /> Context stays visible and removable</span>
            <span><Mic size={16} /> Type or speak the command</span>
            <span><Clipboard size={16} /> Review first, then insert or copy</span>
          </div>
        </div>
        <div className="onboarding-visual" aria-hidden="true">
          <div className="onboarding-mini-card">
            <div className="onboarding-mini-search"><Logo small /> Type a command or search Shortcuts…</div>
            <div className="onboarding-mini-chips">
              <span><ScanText size={13} /> Selected text</span>
              <span><Clipboard size={13} /> Clipboard</span>
              <span><BrandLogo name={activeApp} className="inline-brand-logo" /> {activeApp}</span>
            </div>
            {shortcutItems.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return <div className="onboarding-mini-row" key={item.id}><span className="row-icon"><Icon size={15} /></span>{item.title}<span>{item.source}</span></div>;
            })}
          </div>
          <div className="onboarding-apps-card">
            <span>Insert back into the active field</span>
            <div>
              {['Gmail', 'VS Code', 'Notion', 'Slack'].map((app) => (
                <span className="onboarding-app-tile" key={app}><BrandLogo name={app} className="onboarding-app-logo" /></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    const renderSignIn = () => (
      <div className="onboarding-split signin-split">
        <div className="onboarding-copy">
          <span className="onboarding-eyebrow">14-day Pro trial</span>
          <h2>Try the full workflow first.</h2>
          <p>Sign in through the hosted page in your browser — the session returns to the desktop app automatically. Or continue in local mode and sign in later.</p>
          <div className="onboarding-feature-grid">
            <span><BrainCircuit size={17} /><strong>AI transforms</strong><small>Checked before you review</small></span>
            <span><Mic size={17} /><strong>Voice commands</strong><small>Type or speak in the card</small></span>
            <span><Blocks size={17} /><strong>MCP approvals</strong><small>Writes wait for approval</small></span>
            <span><KeyRound size={17} /><strong>API keys</strong><small>Personal keys for the API</small></span>
          </div>
        </div>
        <div className="browser-signin-card" aria-label="Hosted sign-in preview">
          <div className="browser-bar"><Globe size={14} /> Hosted sign-in · opens in your browser</div>
          <div className="signin-body">
            <Logo />
            <h3>Sign in to Zerthik</h3>
            {authState === 'connected' ? (
              <div className="connected-state">
                <span><Check size={20} /></span>
                <strong>Connected to Zerthik</strong>
                <p>Connection complete. Your session returned to the desktop app and the 14-day Pro trial is ready.</p>
              </div>
            ) : authState === 'browser' ? (
              <div className="connected-state">
                <span><Loader2 className="spin" size={20} /></span>
                <strong>Waiting for browser sign-in…</strong>
                <p>Finish sign-in in your browser — you will return here automatically.</p>
              </div>
            ) : authState === 'unconfigured' ? (
              <div className="connected-state">
                <span><Globe size={20} /></span>
                <strong>Sign-in isn't set up in this build yet</strong>
                <p>Hosted sign-in isn't configured. Continue in local mode — your Shortcuts and settings stay on this device.</p>
                <button type="button" className="ghost-button" onClick={() => setAuthState('signed-out')}>Back</button>
              </div>
            ) : (
              <>
                <div className="signin-providers">
                  <button type="button" onClick={() => startBrowserSignIn('GitHub')}><BrandLogo name="GitHub" className="signin-brand-logo" /> GitHub</button>
                  <button type="button" onClick={() => startBrowserSignIn('Google')}><BrandLogo name="Google" className="signin-brand-logo" /> Google</button>
                  <button type="button" onClick={() => startBrowserSignIn('Email')}><Mail size={17} /> Email</button>
                </div>
                <p>Sign-in opens securely in your browser.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );

    const renderPermissions = () => (
      <div className="onboarding-narrow">
        <span className="onboarding-eyebrow">Permissions</span>
        <h2>Choose what Zerthik can see.</h2>
        <p>Nothing is sent until you generate. Sensitive apps stay blocked by default, and every context chip can be removed before a run.</p>
        <div className="settings-group onboarding-permissions">
          <SettingRow title="Accessibility Insertion" description="Insert reviewed output into the active field, with clipboard fallback.">
            <Toggle checked={prefs.autoInsert} onChange={(value) => updatePref('autoInsert', value)} label="Accessibility insertion" />
          </SettingRow>
          <SettingRow title="Clipboard Context" description="Show the current clipboard item as an optional chip.">
            <Toggle checked={prefs.clipboard} onChange={(value) => { updatePref('clipboard', value); setContext((items) => ({ ...items, clipboard: value })); }} label="Clipboard context" />
          </SettingRow>
          <SettingRow title="Active App & Window" description="Detect where the output should land.">
            <Toggle checked={prefs.activeApp} onChange={(value) => { updatePref('activeApp', value); setContext((items) => ({ ...items, app: value })); }} label="Active app detection" />
          </SettingRow>
          <SettingRow title="Optional Screenshot" description="Attach a screenshot only when you ask for it.">
            <Toggle checked={prefs.screenshot} onChange={(value) => { updatePref('screenshot', value); setContext((items) => ({ ...items, screenshot: value })); }} label="Screenshot context" />
          </SettingRow>
          <SettingRow title="Sensitive Apps Blocked" description="Password managers, banking apps and private windows are blocked by default.">
            <Toggle checked={prefs.sensitiveApps} onChange={(value) => updatePref('sensitiveApps', value)} label="Sensitive apps blocked" />
          </SettingRow>
        </div>
      </div>
    );

    const renderHotkey = () => (
      <div className="onboarding-center hotkey-step">
        <span className="onboarding-eyebrow">Global hotkey</span>
        <h2>Open Zerthik from any app.</h2>
        <p>Press <strong>{globalHotkey}</strong> to open the command card, or record a new hotkey.</p>
        <button type="button" className={cx('hotkey-tile', recordingHotkey && 'recording')} onClick={() => setRecordingHotkey(true)}>
          <Keys keys={globalHotkey.split(' ')} />
          <span>{recordingHotkey ? 'Press a new shortcut…' : 'Click to record'}</span>
        </button>
        {hotkeyWarning && <p className="hotkey-warning">{hotkeyWarning}</p>}
        <button type="button" className="ghost-button" onClick={() => { setGlobalHotkey(platform === 'mac' ? '⌥ Space' : 'Ctrl Space'); setHotkeyWarning(''); }}>Use default</button>
      </div>
    );

    const renderPractice = () => (
      <div className="onboarding-practice">
        <div className="onboarding-copy">
          <span className="onboarding-eyebrow">Practice transform</span>
          <h2>Try one Shortcut.</h2>
          <p>Review the context and instruction, generate output, edit it if needed, then insert it into the active field.</p>
          <div className="onboarding-mini-chips practice-chips">
            {contextChips.filter((chip) => context[chip.id]).map((chip) => <span key={chip.id}><ContextGlyph chip={chip} size={13} /> {chip.label}</span>)}
          </div>
        </div>
        <div className="practice-card">
          <label>Shortcut<span>{practiceCommand?.title || 'Shortcut'}</span></label>
          <label>Instruction<span>{practiceCommand?.prompt}</span></label>
          <label>Source<textarea value={inputText} onChange={(event) => setInputText(event.target.value)} /></label>
          <label>Output<textarea value={practiceOutput} onChange={(event) => { setPracticeOutput(event.target.value); setPracticeInserted(false); }} placeholder="Generate output to review it here." /></label>
          <div className="practice-actions">
            <button type="button" className="dark-button" onClick={() => { setPracticeOutput(generateOutput(practiceCommand?.transform || 'nudge', inputText)); setPracticeInserted(false); }}>
              {practiceOutput ? <RefreshCw size={15} /> : <Play size={15} />} {practiceOutput ? 'Regenerate' : 'Generate'}
            </button>
            <button type="button" className="ghost-button" disabled={!practiceOutput} onClick={() => copyText(practiceOutput)}>
              <Copy size={15} /> Copy
            </button>
            <button type="button" className="ghost-button" disabled={!practiceOutput} onClick={() => { setPracticeInserted(true); showToast('Inserted into active field.'); }}>
              <Clipboard size={15} /> Insert
            </button>
            {practiceInserted && <span className="practice-done"><Check size={14} /> Practice complete</span>}
          </div>
        </div>
      </div>
    );

    return (
      <div className="onboarding-shell">
        <header className="onboarding-topbar">
          <span className="onboarding-brand"><Logo small /> Zerthik Setup</span>
          <span className="row-spacer" />
          <span className="onboarding-step-label">{stepLabels[onboardingStep]} · {onboardingStep + 1} of {stepLabels.length}</span>
          <button type="button" className="icon-button" onClick={finishOnboardingLater} aria-label="Finish onboarding later"><X size={17} /></button>
        </header>

        <div className="onboarding-body">
          {onboardingStep === 0 && renderWelcome()}
          {onboardingStep === 1 && renderCore()}
          {onboardingStep === 2 && renderSignIn()}
          {onboardingStep === 3 && renderPermissions()}
          {onboardingStep === 4 && renderHotkey()}
          {onboardingStep === 5 && renderPractice()}
        </div>

        <footer className="onboarding-footer">
          <button type="button" className="icon-button bordered" onClick={() => goToOnboardingStep(onboardingStep - 1)} disabled={onboardingStep === 0} aria-label="Previous step"><ChevronLeft size={17} /></button>
          <div className="onboarding-progress" aria-hidden="true">
            {stepLabels.map((label, index) => <span key={label} className={cx(index === onboardingStep && 'active', index < onboardingStep && 'done')} />)}
          </div>
          <span className="row-spacer" />
          <button type="button" className="ghost-button" onClick={finishOnboardingLater}>Finish Later</button>
          <button type="button" className="dark-button onboarding-continue" onClick={nextStep} disabled={primaryDisabled}>
            {primaryLabel} <ArrowRight size={15} />
          </button>
        </footer>
      </div>
    );
  };

  return (
    <div className={cx('desktop-scene', isEmbedMode() && 'embed-mode', isTauri() && 'tauri-mode', `theme-${isEmbedMode() ? 'transparent' : theme}`)}>
      <div className="desktop-glow one" />
      <div className="desktop-glow two" />
      <div className="desktop-topbar">
        <span><Logo small /> Zerthik</span>
        <span className="topbar-trigger">{globalHotkey} · Command Card Ready</span>
      </div>

      <main className={cx('app-window', surface, `size-${interfaceSize}`, surface === 'launcher' && isCompact && 'compact-window')}>
        {surface === 'launcher' ? renderLauncher() : surface === 'onboarding' ? renderOnboarding() : renderSettings()}
      </main>

      <div className="desktop-hint">
        <span><Keyboard size={14} /> ↑↓ navigate</span>
        <span>Enter run</span>
        <span>{platform === 'mac' ? '⌘K' : 'Ctrl K'} actions</span>
        <span>Esc back</span>
      </div>

      {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
    </div>
  );
}
