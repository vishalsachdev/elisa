import { describe, it, expect } from 'vitest';
import { EXAMPLE_NUGGETS, type ExampleNugget } from './index';
import { interpretWorkspace } from '../../components/BlockCanvas/blockInterpreter';

describe('bundled example nuggets', () => {
  it('exports at least one example', () => {
    expect(EXAMPLE_NUGGETS.length).toBeGreaterThanOrEqual(1);
  });

  for (const example of EXAMPLE_NUGGETS) {
    describe(example.name, () => {
      it('has required fields', () => {
        expect(example.id).toBeTruthy();
        expect(example.name).toBeTruthy();
        expect(example.description).toBeTruthy();
        expect(example.category).toBeTruthy();
        expect(example.color).toBeTruthy();
        expect(example.accentColor).toBeTruthy();
        expect(example.workspace).toBeDefined();
        expect(Array.isArray(example.skills)).toBe(true);
        expect(Array.isArray(example.rules)).toBe(true);
        expect(Array.isArray(example.portals)).toBe(true);
      });

      it('contains a nugget_goal block', () => {
        const ws = example.workspace as any;
        const blocks = ws.blocks?.blocks ?? [];
        const hasGoal = blocks.some((b: any) => b.type === 'nugget_goal');
        expect(hasGoal).toBe(true);
      });

      it('produces a valid NuggetSpec with a non-empty goal', () => {
        const spec = interpretWorkspace(
          example.workspace,
          example.skills,
          example.rules,
          example.portals,
        );
        expect(spec.nugget.goal).toBeTruthy();
      });
    });
  }

  // Regression tests for migrated hardwareBlink (now uses portal blocks)

  it('hardwareBlink example sets deployment target to esp32', () => {
    const hw = EXAMPLE_NUGGETS.find((e) => e.id === 'hardware-blink')!;
    const spec = interpretWorkspace(hw.workspace, hw.skills, hw.rules, hw.portals);
    expect(spec.deployment.target).toBe('esp32');
  });

  it('hardwareBlink example uses portal_tell for LED control', () => {
    const hw = EXAMPLE_NUGGETS.find((e) => e.id === 'hardware-blink')!;
    const spec = interpretWorkspace(hw.workspace, hw.skills, hw.rules, hw.portals);
    expect(spec.portals).toHaveLength(1);
    expect(spec.portals![0].name).toBe('ESP32 Board');
    expect(spec.portals![0].interactions).toContainEqual(
      expect.objectContaining({ type: 'tell', capabilityId: 'led-blink' }),
    );
  });

  it('teamBuild example includes tester and reviewer agents', () => {
    const team = EXAMPLE_NUGGETS.find((e) => e.id === 'team-build')!;
    const spec = interpretWorkspace(team.workspace, team.skills, team.rules, team.portals);
    const roles = spec.agents.map((a) => a.role);
    expect(roles).toContain('tester');
    expect(roles).toContain('reviewer');
  });

  it('teamBuild example enables testing and review workflow', () => {
    const team = EXAMPLE_NUGGETS.find((e) => e.id === 'team-build')!;
    const spec = interpretWorkspace(team.workspace, team.skills, team.rules, team.portals);
    expect(spec.workflow.testing_enabled).toBe(true);
    expect(spec.workflow.review_enabled).toBe(true);
  });
});
