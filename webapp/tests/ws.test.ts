import { buildWebSocketUrl } from '../src/ws';

describe('buildWebSocketUrl', () => {
  it('creates ws url based on location', () => {
    const location = { protocol: 'https:', host: 'example.com' } as Location;
    const url = buildWebSocketUrl('123', 'u1', 'alice', location);
    expect(url).toBe('wss://example.com/ws/game/123?user_id=u1&username=alice');
  });
});
