import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  UserProfile: a
    .model({
      userId: a.string().required(),
      displayName: a.string().required(),
      avatarStyle: a.string(),
      currentRoomSlug: a.string(),
    })
    .authorization((allow) => [allow.authenticated()]),

  Room: a
    .model({
      slug: a.string().required(),
      name: a.string().required(),
      description: a.string(),
      createdBy: a.string().required(),
      maxUsers: a.integer().required(),
      isPrivate: a.boolean(),
      isLocked: a.boolean(),
      adminUserIds: a.json(),
      mutedUserIds: a.json(),
    })
    .authorization((allow) => [allow.authenticated()]),

  RoomMessage: a
    .model({
      roomId: a.string().required(),
      userId: a.string().required(),
      displayName: a.string().required(),
      body: a.string().required(),
      createdAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),

  RoomSeatSnapshot: a
    .model({
      roomId: a.string().required(),
      seatId: a.string().required(),
      occupiedBySessionId: a.string(),
      updatedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),

  RoomObjectSnapshot: a
    .model({
      roomId: a.string().required(),
      objectId: a.string().required(),
      ownerSessionId: a.string(),
      position: a.json().required(),
      rotation: a.json(),
      updatedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
