import { formatRoomId } from '../../src/util';

describe('Socket', () => {
  it('format room id', () => {
    expect(formatRoomId(1)).toBe('Room 1');
  });
});
