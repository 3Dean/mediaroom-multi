import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'roomSurfaceImages',
  isDefault: true,
  access: (allow) => ({
    'room-surfaces/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
  }),
});
