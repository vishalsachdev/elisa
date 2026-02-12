import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoButton from './GoButton';

describe('GoButton', () => {
  it('renders GO text', () => {
    render(<GoButton disabled={false} onClick={vi.fn()} />);
    expect(screen.getByText('GO')).toBeInTheDocument();
  });

  it('disabled state renders gray button', () => {
    render(<GoButton disabled={true} onClick={vi.fn()} />);
    const btn = screen.getByText('GO');
    expect(btn).toBeDisabled();
    expect(btn.className).not.toContain('go-btn-ready');
    expect(btn.className).not.toContain('go-btn-building');
  });

  it('ready state renders green/mint button', () => {
    render(<GoButton disabled={false} onClick={vi.fn()} uiState="design" />);
    const btn = screen.getByText('GO');
    expect(btn.className).toContain('go-btn-ready');
  });

  it('building state renders disabled coral button', () => {
    render(<GoButton disabled={true} onClick={vi.fn()} uiState="building" />);
    const btn = screen.getByText('GO');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('go-btn-building');
  });

  it('click fires handler when not disabled', () => {
    const onClick = vi.fn();
    render(<GoButton disabled={false} onClick={onClick} />);
    fireEvent.click(screen.getByText('GO'));
    expect(onClick).toHaveBeenCalled();
  });

  it('click does not fire handler when disabled', () => {
    const onClick = vi.fn();
    render(<GoButton disabled={true} onClick={onClick} />);
    fireEvent.click(screen.getByText('GO'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
