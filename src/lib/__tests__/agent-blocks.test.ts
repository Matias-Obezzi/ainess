import { describe, it, expect } from 'vitest';
import { parseNotes, parseResult, parseSuggestion, buildSystemPrompt } from '../providers';

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

  describe('parseSuggestion', () => {
    it('returns undefined when there is no block', () => {
      expect(parseSuggestion('hello world')).toBeUndefined();
    });

    it('reads the suggested reply', () => {
      const text = 'Listo, quedó andando.\n\n```suggest\nsí, dale\n```';
      expect(parseSuggestion(text)).toBe('sí, dale');
    });

    it('ignores an empty block', () => {
      expect(parseSuggestion('```suggest\n   \n```')).toBeUndefined();
    });

    it('keeps only the first line when several arrive', () => {
      expect(parseSuggestion('```suggest\nsí, dale\ny después corré los tests\n```')).toBe('sí, dale');
    });

    it('takes the last block when there is more than one', () => {
      // The last one was written knowing the whole answer, same rule `result` follows.
      expect(parseSuggestion('```suggest\nprimera\n```\ntexto\n```suggest\núltima\n```')).toBe('última');
    });

    it('drops one too long to be something anybody was about to type', () => {
      expect(parseSuggestion('```suggest\n' + 'a'.repeat(300) + '\n```')).toBeUndefined();
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

    it('includes the suggested reply for every agent, canNote or not', () => {
      for (const canNote of [true, false]) {
        const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote, sharedContext: '' });
        expect({ canNote, has: prompt.includes('```suggest') }).toEqual({ canNote, has: true });
      }
    });

    it('includes the suggested reply in a chat, which is where it is worth most', () => {
      const prompt = buildSystemPrompt(fakeAgent, [], {
        skills: [], sharedContext: '', chat: { role: 'implementer', others: [] },
      });
      expect(prompt).toContain('```suggest');
    });

    it('includes note and result in resuming state', () => {
      const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: true, resuming: true, sharedContext: '' });
      expect(prompt).toContain('```note');
      expect(prompt).toContain('```result');
    });
  });
});
