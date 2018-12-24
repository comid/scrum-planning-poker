import { createConnection, getManager } from 'typeorm';
import { config } from '../../src/config';
import {
  Room,
  Score,
  Story,
  User,
  UserRoom,
} from '../../src/entity';
import { CalcMethod } from '../../src/model';
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
        calcMethod: CalcMethod.ArithmeticMean,
      };
      room.creator = host;
      room.updater = host;
      await transactionalEntityManager.insert(Room, room);

      for (let i = 0; i < 2; i += 1) {
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
    await scrum.join(host);
    const score = scrum.currentStory.scores.find(s => s.user.id === host.id);
    expect(score).not.toBeNull();

    await scrum.selectCard(host, 1);
    expect(score.card).toBe(1);
    expect(scrum.currentScore).toBe(2);

    await scrum.selectCard(host, 2);
    expect(score.card).toBe(2);
    expect(scrum.currentScore).toBe(3);

    await scrum.leave(host);
  });

  it('change calc method', async () => {
    await scrum.join(host);
    await scrum.join(players[0]);
    await scrum.join(players[1]);
    await scrum.join(players[2]);

    await scrum.selectCard(host, 1);
    await scrum.selectCard(players[0], 2);
    await scrum.selectCard(players[1], 10);

    await scrum.calcMethod(CalcMethod.ArithmeticMean);
    expect(scrum.room.options.calcMethod).toBe(CalcMethod.ArithmeticMean);
    expect(scrum.currentScore).toBe(5);

    await scrum.calcMethod(CalcMethod.TruncatedMean);
    expect(scrum.room.options.calcMethod).toBe(CalcMethod.TruncatedMean);
    expect(scrum.currentScore).toBe(3);

    await scrum.calcMethod(CalcMethod.Median);
    expect(scrum.room.options.calcMethod).toBe(CalcMethod.Median);
    expect(scrum.currentScore).toBe(3);
    await scrum.selectCard(players[2], 4);
    expect(scrum.currentScore).toBe(4);

    await scrum.calcMethod(CalcMethod.Customized);
    expect(scrum.room.options.calcMethod).toBe(CalcMethod.Customized);
    expect(scrum.currentScore).toBe(4);

    await scrum.leave(host);
    await scrum.leave(players[0]);
    await scrum.leave(players[1]);
    await scrum.leave(players[2]);
  });

  it('time changes', async () => {
    await scrum.join(host);
    const { timer } = scrum.currentStory;
    await new Promise(resolve => setTimeout(resolve, 1050));
    expect(scrum.currentStory.timer).toBe(timer + 1);
    await scrum.leave(host);
  });

  it('next story', async () => {
    await scrum.join(host);
    while (scrum.currentStory) {
      const { currentStory } = scrum;
      await scrum.nextStory();
      expect(currentStory.isCompleted).toBeTruthy();
    }
    expect(scrum.room.isCompleted).toBeTruthy();
    await scrum.selectCard(host, 1);
    await scrum.nextStory();
    await scrum.leave(host);
  });

  it('host not score', async () => {
    let room2: Room;

    await getManager().transaction(async (transactionalEntityManager) => {
      room2 = new Room();
      room2.name = 'Test Room 2';
      room2.options = {
        needScore: false,
        isNoymous: false,
        calcMethod: CalcMethod.ArithmeticMean,
      };
      room2.creator = host;
      room2.updater = host;
      await transactionalEntityManager.insert(Room, room2);

      for (let i = 0; i < 2; i += 1) {
        const story = new Story();
        story.name = `Test Story ${i + 1}`;
        story.room = room2;
        story.creator = host;
        story.updater = host;
        await transactionalEntityManager.insert(Story, story);
      }
    });

    room2 = await getManager().findOneOrFail(Room, {
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
        id: room2.id,
      },
    });

    const scrum2 = new Scrum(room2);
    await scrum2.join(players[0]);
    await scrum2.join(host);

    await scrum2.leave(players[0]);
    await scrum2.leave(host);

    await scrum2.join(host);
    await scrum2.join(players[0]);

    while (scrum2.currentStory) {
      const { currentStory } = scrum2;
      await scrum2.nextStory();
      expect(currentStory.isCompleted).toBeTruthy();
    }
    expect(scrum2.room.isCompleted).toBeTruthy();

    await scrum2.leave(players[0]);
    await scrum2.leave(host);

    room2.isDeleted = true;
    await getManager().save(Room, room2);
  });

  afterAll(async () => {
    room.isDeleted = true;
    await getManager().save(Room, room);
  });

});
