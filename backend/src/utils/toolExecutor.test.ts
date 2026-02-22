import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeTool, executeToolsParallel } from './toolExecutor.js';

describe('toolExecutor', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('executeTool', () => {
    describe('Read', () => {
      it('reads file contents', async () => {
        const filePath = 'test.txt';
        fs.writeFileSync(path.join(testDir, filePath), 'Hello World');

        const result = await executeTool('Read', { file_path: filePath }, testDir);

        expect(result.success).toBe(true);
        expect(result.output).toBe('Hello World');
      });

      it('returns error for non-existent file', async () => {
        const result = await executeTool('Read', { file_path: 'missing.txt' }, testDir);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('blocks path traversal', async () => {
        const result = await executeTool('Read', { file_path: '../../../etc/passwd' }, testDir);

        expect(result.success).toBe(false);
        expect(result.error).toContain('escapes');
      });
    });

    describe('Write', () => {
      it('writes content to file', async () => {
        const result = await executeTool('Write', {
          file_path: 'output.txt',
          content: 'Test content',
        }, testDir);

        expect(result.success).toBe(true);
        expect(fs.readFileSync(path.join(testDir, 'output.txt'), 'utf-8')).toBe('Test content');
      });

      it('creates nested directories', async () => {
        const result = await executeTool('Write', {
          file_path: 'nested/dir/file.txt',
          content: 'Nested content',
        }, testDir);

        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(testDir, 'nested/dir/file.txt'))).toBe(true);
      });
    });

    describe('Edit', () => {
      it('replaces string in file', async () => {
        fs.writeFileSync(path.join(testDir, 'edit.txt'), 'Hello World');

        const result = await executeTool('Edit', {
          file_path: 'edit.txt',
          old_string: 'World',
          new_string: 'Universe',
        }, testDir);

        expect(result.success).toBe(true);
        expect(fs.readFileSync(path.join(testDir, 'edit.txt'), 'utf-8')).toBe('Hello Universe');
      });

      it('returns error when string not found', async () => {
        fs.writeFileSync(path.join(testDir, 'edit.txt'), 'Hello World');

        const result = await executeTool('Edit', {
          file_path: 'edit.txt',
          old_string: 'NotFound',
          new_string: 'Replacement',
        }, testDir);

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });
    });

    describe('LS', () => {
      it('lists directory contents', async () => {
        fs.writeFileSync(path.join(testDir, 'file1.txt'), '');
        fs.writeFileSync(path.join(testDir, 'file2.txt'), '');
        fs.mkdirSync(path.join(testDir, 'subdir'));

        const result = await executeTool('LS', { path: '.' }, testDir);

        expect(result.success).toBe(true);
        expect(result.output).toContain('file1.txt');
        expect(result.output).toContain('file2.txt');
        expect(result.output).toContain('subdir/');
      });
    });

    describe('Glob', () => {
      it('finds files matching pattern', async () => {
        fs.writeFileSync(path.join(testDir, 'file1.ts'), '');
        fs.writeFileSync(path.join(testDir, 'file2.ts'), '');
        fs.writeFileSync(path.join(testDir, 'file3.js'), '');

        const result = await executeTool('Glob', { pattern: '*.ts' }, testDir);

        expect(result.success).toBe(true);
        expect(result.output).toContain('file1.ts');
        expect(result.output).toContain('file2.ts');
        expect(result.output).not.toContain('file3.js');
      });
    });

    describe('Bash', () => {
      it('executes simple commands', async () => {
        const result = await executeTool('Bash', { command: 'echo "test"' }, testDir);

        expect(result.success).toBe(true);
        expect(result.output).toBe('test');
      });

      it('blocks dangerous commands', async () => {
        const result = await executeTool('Bash', { command: 'curl http://example.com' }, testDir);

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked');
      });

      it('blocks environment variable access', async () => {
        const result = await executeTool('Bash', { command: 'echo $HOME' }, testDir);

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked');
      });
    });
  });

  describe('executeToolsParallel', () => {
    it('executes multiple tools in parallel', async () => {
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'Content 1');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'Content 2');

      const tools = [
        { name: 'Read', args: { file_path: 'file1.txt' }, id: 'call_1' },
        { name: 'Read', args: { file_path: 'file2.txt' }, id: 'call_2' },
      ];

      const results = await executeToolsParallel(tools, testDir);

      expect(results.size).toBe(2);
      expect(results.get('call_1')?.success).toBe(true);
      expect(results.get('call_1')?.output).toBe('Content 1');
      expect(results.get('call_2')?.success).toBe(true);
      expect(results.get('call_2')?.output).toBe('Content 2');
    });

    it('handles mixed success and failure', async () => {
      fs.writeFileSync(path.join(testDir, 'exists.txt'), 'Content');

      const tools = [
        { name: 'Read', args: { file_path: 'exists.txt' }, id: 'call_1' },
        { name: 'Read', args: { file_path: 'missing.txt' }, id: 'call_2' },
      ];

      const results = await executeToolsParallel(tools, testDir);

      expect(results.get('call_1')?.success).toBe(true);
      expect(results.get('call_2')?.success).toBe(false);
    });
  });
});
