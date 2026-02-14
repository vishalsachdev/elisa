import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestResults from './TestResults';
import type { TestResult } from '../../types';

describe('TestResults', () => {
  it('shows empty state when no results', () => {
    render(<TestResults results={[]} coveragePct={null} />);
    expect(screen.getByText('No test results yet')).toBeInTheDocument();
  });

  it('shows passing test with green indicator', () => {
    const results: TestResult[] = [
      { test_name: 'test_add', passed: true, details: 'PASSED' },
    ];
    const { container } = render(<TestResults results={results} coveragePct={null} />);
    expect(screen.getByRole('img', { name: '1 of 1 tests passing' })).toBeInTheDocument();
    expect(container.querySelector('[title="test_add"]')).toBeInTheDocument();
  });

  it('shows failing test with red indicator', () => {
    const results: TestResult[] = [
      { test_name: 'test_bad', passed: false, details: 'FAILED' },
    ];
    render(<TestResults results={results} coveragePct={null} />);
    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('test_bad')).toBeInTheDocument();
  });

  it('shows summary line', () => {
    const results: TestResult[] = [
      { test_name: 'test_a', passed: true, details: 'PASSED' },
      { test_name: 'test_b', passed: true, details: 'PASSED' },
      { test_name: 'test_c', passed: true, details: 'PASSED' },
      { test_name: 'test_d', passed: false, details: 'FAILED' },
    ];
    render(<TestResults results={results} coveragePct={null} />);
    expect(screen.getByText('3/4 passing')).toBeInTheDocument();
  });

  it('shows coverage progress bar when available', () => {
    const results: TestResult[] = [
      { test_name: 'test_a', passed: true, details: 'PASSED' },
    ];
    render(<TestResults results={results} coveragePct={85.5} />);
    expect(screen.getByText('Coverage: 85.5%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not show coverage bar when null', () => {
    const results: TestResult[] = [
      { test_name: 'test_a', passed: true, details: 'PASSED' },
    ];
    render(<TestResults results={results} coveragePct={null} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows success message when all tests pass', () => {
    const results: TestResult[] = [
      { test_name: 'test_a', passed: true, details: 'PASSED' },
      { test_name: 'test_b', passed: true, details: 'PASSED' },
    ];
    render(<TestResults results={results} coveragePct={null} />);
    expect(screen.getByText('All tests passing!')).toBeInTheDocument();
  });

  it('only lists failures, not passing tests', () => {
    const results: TestResult[] = [
      { test_name: 'test_pass', passed: true, details: 'PASSED' },
      { test_name: 'test_fail', passed: false, details: 'assertion error' },
    ];
    render(<TestResults results={results} coveragePct={null} />);
    expect(screen.getByText('test_fail')).toBeInTheDocument();
    expect(screen.queryByText('test_pass')).not.toBeInTheDocument();
  });

  it('expands and collapses failure details on click', () => {
    const results: TestResult[] = [
      { test_name: 'test_broken', passed: false, details: 'expected 4 got 5' },
    ];
    render(<TestResults results={results} coveragePct={null} />);

    const button = screen.getByRole('button', { name: /test_broken/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('expected 4 got 5')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('expected 4 got 5')).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('expected 4 got 5')).not.toBeInTheDocument();
  });
});
