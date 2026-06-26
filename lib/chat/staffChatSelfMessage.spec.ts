import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStaffChatSelfMessage,
  resolveStaffChatSessionIdentity,
  type StaffChatSessionIdentity
} from './staffChatSelfMessage';

const cleanerIdentity: StaffChatSessionIdentity = {
  currentUserId: 'cleaner-uuid',
  currentTokenId: 'invite-cleaner-1',
  currentSenderName: 'Cleaner-1',
  spokenLang: 'ru',
  role: 'cleaning'
};

const managerIdentity: StaffChatSessionIdentity = {
  currentUserId: 'manager-uuid',
  currentTokenId: null,
  currentSenderName: 'Manager',
  spokenLang: null,
  role: 'manager'
};

describe('isStaffChatSelfMessage', () => {
  it('PC manager message is not self on cleaner token session', () => {
    assert.equal(
      isStaffChatSelfMessage(
        {
          id: 'm1',
          user_id: 'manager-uuid',
          token_id: null,
          sender_side: 'pc',
          sender_name: 'Manager'
        },
        cleanerIdentity
      ),
      false
    );
  });

  it('mobile own message matches by token_id', () => {
    assert.equal(
      isStaffChatSelfMessage(
        {
          id: 'm2',
          user_id: 'cleaner-uuid',
          token_id: 'invite-cleaner-1',
          sender_side: 'mobile',
          sender_name: 'Cleaner-1'
        },
        cleanerIdentity
      ),
      true
    );
  });

  it('PC manager message is not self even when user_id matches cleaner', () => {
    assert.equal(
      isStaffChatSelfMessage(
        {
          id: 'm1b',
          user_id: 'cleaner-uuid',
          token_id: null,
          sender_side: 'pc',
          sender_name: 'Manager'
        },
        cleanerIdentity
      ),
      false
    );
  });
    assert.equal(
      isStaffChatSelfMessage(
        {
          id: 'm3',
          user_id: 'cleaner-uuid',
          token_id: null,
          sender_side: 'mobile',
          sender_name: 'Cleaner-1'
        },
        managerIdentity
      ),
      false
    );
  });
});

describe('resolveStaffChatSessionIdentity', () => {
  it('uses invite session without legacy user id fallback', () => {
    const identity = resolveStaffChatSessionIdentity(
      {
        inviteId: 'inv-1',
        token: 'tok',
        displayName: 'Cleaner A',
        role: 'cleaning',
        userId: 'cleaner-uuid',
        spokenLang: 'ru',
        siteId: 'site'
      },
      { key: 'manager', userId: 'manager-uuid' },
      null
    );
    assert.equal(identity.currentUserId, 'cleaner-uuid');
    assert.equal(identity.currentTokenId, 'inv-1');
    assert.equal(identity.currentSenderName, 'Cleaner A');
  });
});
