interface WorkspaceSidebarProps {
  onOpen: () => void;
  onSave: () => void;
  onSkills: () => void;
  onPortals: () => void;
  onExamples: () => void;
  onHelp: () => void;
  saveDisabled: boolean;
}

const sidebarItems: Array<{ key: string; label: string; prop: keyof Pick<WorkspaceSidebarProps, 'onOpen' | 'onSave' | 'onSkills' | 'onPortals' | 'onExamples' | 'onHelp'> }> = [
  { key: 'open', label: 'Open', prop: 'onOpen' },
  { key: 'save', label: 'Save', prop: 'onSave' },
  { key: 'skills', label: 'Skills', prop: 'onSkills' },
  { key: 'portals', label: 'Portals', prop: 'onPortals' },
  { key: 'examples', label: 'Examples', prop: 'onExamples' },
  { key: 'help', label: 'Help', prop: 'onHelp' },
];

export default function WorkspaceSidebar({
  onOpen, onSave, onSkills, onPortals, onExamples, onHelp, saveDisabled,
}: WorkspaceSidebarProps) {
  const handlers: Record<string, () => void> = {
    onOpen, onSave, onSkills, onPortals, onExamples, onHelp,
  };

  return (
    <div className="flex flex-col gap-1.5 py-3 px-1.5 border-r border-border-subtle bg-atelier-surface/60">
      {sidebarItems.map(item => {
        const disabled = item.key === 'save' && saveDisabled;
        const handler = handlers[item.prop];
        return (
          <button
            key={item.key}
            onClick={handler}
            disabled={disabled}
            className={`px-2.5 py-2 text-xs rounded-lg font-medium transition-colors text-center whitespace-nowrap ${
              disabled
                ? 'text-atelier-text-muted cursor-not-allowed'
                : item.key === 'skills'
                  ? 'bg-accent-lavender/10 text-accent-lavender hover:bg-accent-lavender/20'
                  : item.key === 'portals'
                    ? 'bg-accent-sky/10 text-accent-sky hover:bg-accent-sky/20'
                    : item.key === 'examples'
                      ? 'bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20'
                      : 'text-atelier-text-secondary hover:bg-atelier-elevated hover:text-atelier-text'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
