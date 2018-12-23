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
  let players: User[];
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

    [host, ...players] = await getManager().find(User, { take: 4 });

    await getManager().transaction(async (transactionalEntityManager) => {
      room = new Room();
      room.name = 'Test Room';
      room.options = {
        needScore: true,
        isNoymous: false,
        calcMethod: 1,
      };
      room.creator = host;
      room.updater = host;
      await transactionalEntityManager.insert(Room, room);

      for (let i = 0; i < 10; i += 1) {
        const story = new Story();
        story.name = `Test Story ${i + 1}`;
        story.room = room;
        story.creator = host;
        story.updater = host;
        await transactionalEntityManager.insert(Story, story);
      }
    });

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
        id: room.id,
      },
    });

    scrum = new Scrum(room);
  });

  it('host join room', async () => {
    await scrum.join(host);
    const userRoom = scrum.room.userRooms.find(us => us.user.id === host.id);
    expect(userRoom).not.toBeNull();
    expect(userRoom.isLeft).toBeFalsy();
  });

  it('host leave room', async () => {
    await scrum.leave(host);
    const userRoom = scrum.room.userRooms.find(us => us.user.id === host.id);
    expect(userRoom).not.toBeNull();
    expect(userRoom.isLeft).toBeTruthy();
  });

  it('select card', async () => {
    const card = 1;
    await scrum.join(host);
    await scrum.selectCard(host, card);
    const score = scrum.currentStory.scores.find(s => s.user.id === host.id);
    expect(score).not.toBeNull();
    expect(score.card).toBe(card);
    await scrum.leave(host);
  });

  afterAll(async () => {
    room.isDeleted = true;
    await getManager().save(Room, room);
  });

});
