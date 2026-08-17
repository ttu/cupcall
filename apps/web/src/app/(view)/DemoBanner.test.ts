import { describe, it, expect } from 'vitest';
import { getDemoStage } from './DemoBanner';

describe('getDemoStage', () => {
  it('returns null for non-demo paths', () => {
    expect(getDemoStage('/view/abc123')).toBeNull();
    expect(getDemoStage('/pools')).toBeNull();
    expect(getDemoStage('/')).toBeNull();
    expect(getDemoStage('/login')).toBeNull();
    expect(getDemoStage('/demo')).toBeNull();
  });

  it('returns the correct stage for each demo checkpoint root', () => {
    expect(getDemoStage('/view/demo-groups')).toBe('groups');
    expect(getDemoStage('/view/demo-knockout')).toBe('knockout');
    expect(getDemoStage('/view/demo-completed')).toBe('completed');
  });

  it('matches sub-paths within a demo checkpoint', () => {
    expect(getDemoStage('/view/demo-groups/member/demo-user-1')).toBe('groups');
    expect(getDemoStage('/view/demo-knockout/results')).toBe('knockout');
    expect(getDemoStage('/view/demo-completed/results')).toBe('completed');
  });

  it('does not match partial prefix collisions', () => {
    expect(getDemoStage('/view/demo-groups-extra')).toBeNull();
    expect(getDemoStage('/view/demo-knockout-extra')).toBeNull();
    expect(getDemoStage('/view/demo-completed-extra')).toBeNull();
  });
});
