import type { HealthStatus } from '../../hooks/useHealthCheck';

interface ReadinessBadgeProps {
  health: HealthStatus;
  loading: boolean;
}

function friendlyMessage(health: HealthStatus): string {
  if (health.status === 'ready') return 'Ready to build!';
  if (health.status === 'offline') return 'Elisa can\'t find the backend server.';
  if (health.apiKey === 'missing') return 'No API key found. Ask your parent to add one!';
  if (health.apiKey === 'invalid') return 'That API key didn\'t work. Ask your parent to check it!';
  if (health.agentSdk === 'not_found') return 'Agent SDK not installed. Try running npm install.';
  return 'Something isn\'t set up yet.';
}

export default function ReadinessBadge({ health, loading }: ReadinessBadgeProps) {
  if (loading) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full bg-atelier-elevated text-atelier-text-muted font-medium">
        Checking...
      </span>
    );
  }

  if (health.status === 'ready') {
    return (
      <span
        className="text-xs px-2.5 py-1 rounded-full bg-accent-mint/15 text-accent-mint font-medium"
        title={friendlyMessage(health)}
      >
        Ready
      </span>
    );
  }

  if (health.status === 'offline') {
    return (
      <span
        className="text-xs px-2.5 py-1 rounded-full bg-accent-coral/15 text-accent-coral font-medium"
        title={friendlyMessage(health)}
      >
        Offline
      </span>
    );
  }

  // degraded -- show the friendly message directly, not just "Not Ready"
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full bg-accent-gold/15 text-accent-gold font-medium"
      title={friendlyMessage(health)}
    >
      {health.apiKey === 'missing' || health.apiKey === 'invalid'
        ? 'Needs API Key'
        : 'Not Ready'}
    </span>
  );
}
