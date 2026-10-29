import {
  Blocks,
  BookOpen,
  Braces,
  Bug,
  Copy,
  CreditCard,
  Database,
  FileText,
  Gauge,
  Globe,
  GraduationCap,
  Home,
  Inbox,
  Keyboard,
  KeyRound,
  Layers,
  LifeBuoy,
  ListChecks,
  Mail,
  Megaphone,
  MessagesSquare,
  Mic,
  Plus,
  Rocket,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  Users,
} from 'lucide-react';

const shortcut = ({
  id,
  title,
  source,
  transform,
  icon,
  alias,
  prompt,
  outputType,
  visibility,
  keywords,
}) => ({
  id,
  title,
  source,
  type: 'Shortcut',
  kind: 'transform',
  transform,
  icon,
  color: '#ffffff',
  homeSection: 'commands',
  alias,
  hotkey: '',
  description: prompt,
  prompt,
  outputType,
  visibility,
  keywords: keywords || `${title} ${source} ${outputType}`,
});

export const commands = [
  // Developer — marketing/PRD Shortcut examples
  shortcut({ id: 'issue-from-error', title: 'Issue from Error', source: 'Developer', transform: 'issue', icon: Bug, alias: 'issue', prompt: 'Create a GitHub issue draft with repro steps from this error', outputType: 'Markdown', visibility: 'Workspace', keywords: 'github issue bug error repro developer' }),
  shortcut({ id: 'json-types', title: 'JSON → Types', source: 'Developer', transform: 'codeTypes', icon: Braces, alias: 'types', prompt: 'Generate clean type definitions from this JSON', outputType: 'Code', visibility: 'Personal', keywords: 'json typescript types interface schema' }),
  shortcut({ id: 'explain-diff', title: 'Explain This Diff', source: 'Developer', transform: 'diff', icon: ScanText, alias: 'diff', prompt: 'Summarise what this diff changes and what could break', outputType: 'Text', visibility: 'Workspace', keywords: 'diff code review changes risk' }),
  shortcut({ id: 'log-fixture', title: 'Log → Test Fixture', source: 'Developer', transform: 'fixture', icon: Database, alias: 'fixture', prompt: 'Turn this log payload into a clean test fixture', outputType: 'Code', visibility: 'Personal', keywords: 'log test fixture payload developer' }),
  shortcut({ id: 'commit-message', title: 'Commit Message', source: 'Developer', transform: 'commit', icon: MessagesSquare, alias: 'commit', prompt: 'Write a conventional commit message for these changes', outputType: 'Text', visibility: 'Workspace', keywords: 'git commit message conventional' }),
  shortcut({ id: 'regex-examples', title: 'Regex from Examples', source: 'Developer', transform: 'regex', icon: Search, alias: 'regex', prompt: 'Build a regex that matches all of these examples', outputType: 'Code', visibility: 'Personal', keywords: 'regex pattern examples match' }),

  // Founder — marketing/PRD Shortcut examples
  shortcut({ id: 'investor-update', title: 'Investor Update', source: 'Founder', transform: 'investor', icon: Rocket, alias: 'investor', prompt: 'Turn these notes into a crisp monthly investor update', outputType: 'Markdown', visibility: 'Workspace', keywords: 'investor update monthly founder notes' }),
  shortcut({ id: 'polite-nudge', title: 'The Polite Nudge', source: 'Founder', transform: 'nudge', icon: Mail, alias: 'nudge', prompt: 'Draft a polite follow-up email from these call notes', outputType: 'Text', visibility: 'Workspace', keywords: 'follow up polite email reminder nudge' }),
  shortcut({ id: 'meeting-notes', title: 'Meeting → Notes', source: 'Founder', transform: 'notes', icon: FileText, alias: 'meeting', prompt: 'Structure this transcript into decisions and action items', outputType: 'Markdown', visibility: 'Personal', keywords: 'meeting transcript decisions action items notes' }),
  shortcut({ id: 'launch-post', title: 'Launch Post, 3 Ways', source: 'Founder', transform: 'variants', icon: Megaphone, alias: 'launch', prompt: 'Write three launch-post variants: bold, calm, playful', outputType: 'Text', visibility: 'Personal', keywords: 'launch post variants bold calm playful' }),
  shortcut({ id: 'metrics-table', title: 'Metrics Table', source: 'Founder', transform: 'table', icon: Table2, alias: 'metrics', prompt: 'Extract every number here into a clean metrics table', outputType: 'Table', visibility: 'Workspace', keywords: 'metrics table numbers markdown' }),
  shortcut({ id: 'voice-tasks', title: 'Voice Memo → Tasks', source: 'Founder', transform: 'actions', icon: Mic, alias: 'tasks', prompt: 'Turn this rambling voice note into an ordered task list', outputType: 'Markdown', visibility: 'Personal', keywords: 'voice memo tasks checklist Founder' }),

  // Support & Ops — marketing/PRD Shortcut examples
  shortcut({ id: 'reply-voice', title: 'Reply in Our Voice', source: 'Support & Ops', transform: 'reply', icon: LifeBuoy, alias: 'voice', prompt: 'Draft a reply to this ticket in our support tone', outputType: 'Text', visibility: 'Workspace', keywords: 'support reply ticket tone voice' }),
  shortcut({ id: 'triage-summary', title: 'Triage Summary', source: 'Support & Ops', transform: 'triage', icon: Inbox, alias: 'triage', prompt: 'Summarise this thread: problem, urgency, next step', outputType: 'Markdown', visibility: 'Workspace', keywords: 'support triage urgency next step thread' }),
  shortcut({ id: 'extract-order', title: 'Extract Order Details', source: 'Support & Ops', transform: 'extract', icon: ListChecks, alias: 'order', prompt: 'Pull order ID, items and address from this email', outputType: 'Table', visibility: 'Personal', keywords: 'extract order id items address email' }),
  shortcut({ id: 'translate-reply', title: 'Translate & Reply', source: 'Support & Ops', transform: 'translate', icon: Globe, alias: 'translate', prompt: 'Translate my reply into the customer language', outputType: 'Text', visibility: 'Personal', keywords: 'translate reply customer language support' }),
  shortcut({ id: 'de-escalate', title: 'De-escalate', source: 'Support & Ops', transform: 'professional', icon: ShieldCheck, alias: 'calm', prompt: 'Rewrite this draft to sound calm and confident', outputType: 'Text', visibility: 'Workspace', keywords: 'de-escalate calm confident support rewrite' }),
  shortcut({ id: 'macro-ticket', title: 'Macro from Ticket', source: 'Support & Ops', transform: 'macro', icon: Copy, alias: 'macro', prompt: 'Turn this solved ticket into a reusable macro', outputType: 'Markdown', visibility: 'Workspace', keywords: 'macro ticket reusable support template' }),

  // Research — marketing/PRD Shortcut examples
  shortcut({ id: 'summarise-article', title: 'Summarise Article', source: 'Research', transform: 'summarize', icon: BookOpen, alias: 'summarise', prompt: 'Summarise this in five bullets a busy person will read', outputType: 'Markdown', visibility: 'Personal', keywords: 'summarise article five bullets research' }),
  shortcut({ id: 'flashcards', title: 'Flashcards', source: 'Research', transform: 'flashcards', icon: GraduationCap, alias: 'cards', prompt: 'Make Q&A flashcards from this chapter', outputType: 'Text', visibility: 'Personal', keywords: 'flashcards questions answers study chapter' }),
  shortcut({ id: 'compare-sources', title: 'Compare Sources', source: 'Research', transform: 'compare', icon: Layers, alias: 'compare', prompt: 'Where do these two texts agree and disagree?', outputType: 'Table', visibility: 'Personal', keywords: 'compare sources agree disagree research' }),
  shortcut({ id: 'action-items', title: 'Action Items', source: 'Research', transform: 'actions', icon: ListChecks, alias: 'actions', prompt: 'Extract every commitment and deadline mentioned', outputType: 'Markdown', visibility: 'Workspace', keywords: 'action items commitments deadlines checklist' }),
  shortcut({ id: 'citation-list', title: 'Citation List', source: 'Research', transform: 'citations', icon: ScanText, alias: 'citations', prompt: 'Build a clean reference list from these links', outputType: 'Text', visibility: 'Personal', keywords: 'citations references links bibliography' }),
  shortcut({ id: 'data-table', title: 'Data Table', source: 'Research', transform: 'csv', icon: Table2, alias: 'data', prompt: 'Turn the numbers in this text into a sortable table', outputType: 'CSV', visibility: 'Personal', keywords: 'data table csv numbers sortable' }),

  // PRD dashboard and command-card destinations
  {
    id: 'search-shortcuts', title: 'Search Shortcuts', source: 'Shortcuts', type: 'Command', kind: 'view', target: 'shortcuts', icon: Keyboard, color: '#ffffff', homeSection: 'dashboard', alias: 'shortcuts', hotkey: '',
    description: 'Browse personal and workspace Shortcuts. Run any Shortcut by name.',
    prompt: '', keywords: 'search shortcuts library run by name personal workspace',
  },
  {
    id: 'create-shortcut', title: 'Create Shortcut', source: 'Shortcuts', type: 'Form', kind: 'view', target: 'create', icon: Plus, color: '#ffffff', homeSection: 'dashboard', alias: 'new', hotkey: '',
    description: 'Save a reusable command with an output format, tone and visibility.',
    prompt: '', keywords: 'create save shortcut command output format tone visibility',
  },
  {
    id: 'mcp-connections', title: 'MCP Connections', source: 'MCP', type: 'Command', kind: 'view', target: 'integrations', icon: Blocks, color: '#ffffff', homeSection: 'dashboard', alias: 'mcp', hotkey: '',
    description: 'Connect MCP servers explicitly. Review tools, approvals and action logs.',
    prompt: '', keywords: 'mcp connections servers tools permissions approvals logs',
  },
  {
    id: 'dashboard-home', title: 'Home', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'Home', icon: Home, color: '#ffffff', homeSection: 'dashboard', alias: 'home', hotkey: '',
    description: 'Account, trial, onboarding and product status inside the desktop app.',
    prompt: '', keywords: 'home dashboard account trial onboarding status',
  },
  {
    id: 'api-keys', title: 'API Keys', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'API Keys', icon: KeyRound, color: '#ffffff', homeSection: 'dashboard', alias: 'api', hotkey: '',
    description: 'Create and revoke personal API keys. Full keys are shown only once.',
    prompt: '', keywords: 'api keys developer token revoke rate limits',
  },
  {
    id: 'usage', title: 'Usage', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'Usage', icon: Gauge, color: '#ffffff', homeSection: 'dashboard', alias: 'usage', hotkey: '',
    description: 'AI actions, API requests and MCP activity for this workspace.',
    prompt: '', keywords: 'usage ai actions allowance API MCP',
  },
  {
    id: 'plans-billing', title: 'Plans & Billing', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'Plans & Billing', icon: CreditCard, color: '#ffffff', homeSection: 'dashboard', alias: 'billing', hotkey: '',
    description: 'Trial status, plan allowance, hosted checkout and billing portal entry points.',
    prompt: '', keywords: 'plans billing trial Pro Team Business Dodo checkout invoices',
  },
  {
    id: 'team', title: 'Team', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'Team', icon: Users, color: '#ffffff', homeSection: 'dashboard', alias: 'team', hotkey: '',
    description: 'Workspace members, seats, roles, shared Shortcuts and shared MCP connections.',
    prompt: '', keywords: 'team workspace members seats roles invites shared',
  },
  {
    id: 'settings', title: 'Settings', source: 'Dashboard', type: 'Window', kind: 'dashboard', section: 'Settings', icon: Settings, color: '#ffffff', homeSection: 'dashboard', alias: 'settings', hotkey: ',',
    description: 'Global shortcut, command card, context privacy and insertion controls.',
    prompt: '', keywords: 'settings global shortcut command card privacy context insertion',
  },
];

export const shortcuts = commands
  .filter((command) => command.kind === 'transform')
  .map((command, index) => ({
    ...command,
    lastUsed: ['2 min ago', '18 min ago', 'Yesterday', 'Mon 09:42'][index % 4],
    usage: [128, 96, 74, 51, 43, 29, 22, 18, 16, 12, 9, 7, 5, 11, 8, 6, 14, 4, 19, 3, 2, 13, 1, 10][index] || 0,
  }));

// Example user-added MCP servers. MCP is disabled until a user explicitly connects a server.
export const mcpServers = [
  {
    id: 'github', name: 'GitHub', detail: 'Repository, issue and pull-request tools through a user-added GitHub MCP server.', category: 'Developer', authType: 'OAuth', scope: 'Personal', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_issues', level: 'Read' }, { name: 'create_issue', level: 'Write · approval required' }, { name: 'delete_repository', level: 'Destructive · blocked' }],
  },
  {
    id: 'linear', name: 'Linear', detail: 'Issue search and drafting through a user-added Linear MCP server.', category: 'Developer', authType: 'API key', scope: 'Workspace', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_issues', level: 'Read' }, { name: 'create_issue', level: 'Write · approval required' }, { name: 'archive_project', level: 'Destructive · blocked' }],
  },
  {
    id: 'notion', name: 'Notion', detail: 'Page search and approved updates through a user-added Notion MCP server.', category: 'Productivity', authType: 'OAuth', scope: 'Workspace', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_pages', level: 'Read' }, { name: 'append_blocks', level: 'Write · approval required' }, { name: 'delete_page', level: 'Destructive · blocked' }],
  },
  {
    id: 'slack', name: 'Slack', detail: 'Channel context and approved messages through a user-added Slack MCP server.', category: 'Communication', authType: 'OAuth', scope: 'Workspace', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_messages', level: 'Read' }, { name: 'post_message', level: 'Write · approval required' }, { name: 'delete_message', level: 'Destructive · blocked' }],
  },
  {
    id: 'googledrive', name: 'Google Drive', detail: 'File search and approved document actions through a user-added Drive MCP server.', category: 'Productivity', authType: 'OAuth', scope: 'Personal', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_files', level: 'Read' }, { name: 'create_file', level: 'Write · approval required' }, { name: 'delete_file', level: 'Destructive · blocked' }],
  },
  {
    id: 'figma', name: 'Figma', detail: 'Design-file context through a user-added Figma MCP server.', category: 'Design', authType: 'API key', scope: 'Workspace', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'get_file', level: 'Read' }, { name: 'post_comment', level: 'Write · approval required' }, { name: 'delete_comment', level: 'Destructive · blocked' }],
  },
  {
    id: 'jira', name: 'Jira', detail: 'Issue search and approved updates through a user-added Jira MCP server.', category: 'Developer', authType: 'OAuth', scope: 'Workspace', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'search_issues', level: 'Read' }, { name: 'transition_issue', level: 'Write · approval required' }, { name: 'delete_issue', level: 'Destructive · blocked' }],
  },
  {
    id: 'todoist', name: 'Todoist', detail: 'Task context and approved task creation through a user-added Todoist MCP server.', category: 'Productivity', authType: 'API key', scope: 'Personal', serverUrl: 'Remote MCP URL', connected: false,
    tools: [{ name: 'list_tasks', level: 'Read' }, { name: 'create_task', level: 'Write · approval required' }, { name: 'delete_project', level: 'Destructive · blocked' }],
  },
];


