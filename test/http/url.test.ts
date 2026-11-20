import { describe, expect, it } from 'vitest';
import { joinUrl } from '../../src/http/url.js';

describe('joinUrl', () => {
    it.each([
        ['https://api.sendparcel.com', 'https://api.sendparcel.com/api/v2/api-key'],
        ['https://api.sendparcel.com/', 'https://api.sendparcel.com/api/v2/api-key'],
        ['https://api.sendparcel.com//', 'https://api.sendparcel.com/api/v2/api-key'],
    ])('joins %s and the path with one slash', (baseUrl, expected) => {
        expect(joinUrl(baseUrl, '/api/v2/api-key')).toBe(expected);
    });
});
