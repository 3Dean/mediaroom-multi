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

  RoomSurfaceSnapshot: a
    .model({
      roomId: a.string().required(),
      surfaceId: a.string().required(),
      imagePath: a.string().required(),
      updatedByUserId: a.string().required(),
      updatedAt: a.datetime().required(),
    })
    .authorization((allow) => [allow.authenticated()]),

  RoomMediaAsset: a
    .model({
      roomId: a.string().required(),
      kind: a.string().required(),
      storageKey: a.string().required(),
      fileName: a.string().required(),
      mimeType: a.string().required(),
      sizeBytes: a.integer().required(),
      checksum: a.string().required(),
      createdBy: a.string().required(),
      createdAt: a.datetime().required(),
      updatedAt: a.datetime().required(),
      status: a.string().required(),
      width: a.integer(),
      height: a.integer(),
      durationSeconds: a.float(),
      inUseSurfaceIds: a.json(),
      inUseTv: a.boolean(),
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
