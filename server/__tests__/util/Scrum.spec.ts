import { createConnection, getManager } from 'typeorm';
import { config } from '../../src/config';
import {
  Room,
  Score,
  Story,
  User,
  UserRoom,
} from '../../src/entity';
import { Scrum } from '../../src/util';

describe('Scrum', () => {
  let host: User;
  let room: Room;
  let scrum: Scrum;

  beforeAll(async () => {
    await createConnection({
      type: 'mysql',
      host: config.databaseHost,
      port: config.databasePort,
      username: config.databaseUsername,
      password: config.databasePassword,
      database: config.databaseScheme,
      synchronize: true,
      logging: false,
      bigNumberStrings: false,
      entities: [
        Room,
        Score,
        Story,
        User,
        UserRoom,
      ],
    });

    host = await getManager().findOneOrFail(User);
    room = await getManager().findOneOrFail(Room, {
      relations: [
        'userRooms',
        'userRooms.user',
        'stories',
        'stories.scores',
        'stories.scores.user',
        'creator',
        'updater',
      ],
      where: {
        creator: host,
      },
    });

    scrum = new Scrum(room);
  });

  it('join room', async () => {
    await scrum.join(host);
    const userRoom = scrum.room.userRooms.find(us => us.user.id === host.id);
    expect(userRoom).not.toBeNull();
    expect(userRoom.isLeft).toBeFalsy();
  });

  it('leave room', async () => {
    await scrum.leave(host);
    const userRoom = scrum.room.userRooms.find(us => us.user.id === host.id);
    expect(userRoom).not.toBeNull();
    expect(userRoom.isLeft).toBeTruthy();
  });
});
