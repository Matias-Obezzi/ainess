import { describe, it, expect } from 'vitest';
import { parseNotes, parseResult, buildSystemPrompt } from '../providers';

describe('agent-blocks', () => {
  describe('parseNotes', () => {
    it('returns empty array if no notes', () => {
      expect(parseNotes('hello world')).toEqual([]);
    });

    it('parses a single note', () => {
      const text = 'foo\n```note\nthis is a note\n```\nbar';
      expect(parseNotes(text)).toEqual(['this is a note']);
    });

    it('parses multiple notes', () => {
      const text = '```note\nfirst\n```\nsome text\n```note\nsecond\n```';
      expect(parseNotes(text)).toEqual(['first', 'second']);
    });
  });

  describe('parseResult', () => {
    it('returns null if no result block', () => {
      expect(parseResult('hello')).toBeNull();
    });

    it('returns null if invalid JSON', () => {
      const text = '```result\n{ bad json }\n```';
      expect(parseResult(text)).toBeNull();
    });

    it('returns null if not an object', () => {
      const text = '```result\n"just a string"\n```';
      expect(parseResult(text)).toBeNull();
    });

    it('parses a valid result', () => {
      const text = '```result\n{"files":["a.ts"], "verified":["test"], "blocked":["b.ts"]}\n```';
      expect(parseResult(text)).toEqual({
        files: ['a.ts'],
        verified: ['test'],
        blocked: ['b.ts']
      });
    });

    it('parses the last valid block', () => {
      const text = '```result\n{"files":["1"]}\n```\nsome text\n```result\n{"files":["2"]}\n```';
      expect(parseResult(text)).toEqual({
        files: ['2'],
        verified: [],
        blocked: []
      });
    });

    it('normalizes missing fields or strings to arrays', () => {
      const text = '```result\n{"files":"a.ts"}\n```';
      expect(parseResult(text)).toEqual({
        files: ['a.ts'],
        verified: [],
        blocked: []
      });
    });
  });

  describe('buildSystemPrompt', () => {
    const fakeAgent = { id: '1', name: 'Agent', provider: 'custom' as any, role: 'implementer' as any, autoApprove: false, parentId: null };

    it('includes note and result if canNote is true', () => {
      const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: true, sharedContext: '' });
      expect(prompt).toContain('```note');
      expect(prompt).toContain('```result');
    });

    it('excludes note and result if canNote is false/undefined', () => {
      const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: false, sharedContext: '' });
      expect(prompt).not.toContain('```note');
      expect(prompt).not.toContain('```result');
    });

    it('includes note and result in resuming state', () => {
      const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: true, resuming: true, sharedContext: '' });
      expect(prompt).toContain('```note');
      expect(prompt).toContain('```result');
    });
  });
});
