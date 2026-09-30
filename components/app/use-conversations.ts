'use client'

/**
 * useConversations — React binding for the conversations store.
 *
 * useSyncExternalStore with a server snapshot of [] keeps SSR/hydration
 * clean; the client snapshot reads the shared in-memory cache (which is
 * hydrated from localStorage once) and re-renders on every store mutation.
 */

import { useSyncExternalStore } from 'react'
import {
  getList,
  subscribe as subscribeStore,
  conversationsStore,
  type Conversation,
} from './conversations'

const EMPTY: Conversation[] = []

function subscribe(listener: () => void) {
  return subscribeStore(listener)
}

function getSnapshot(): Conversation[] {
  return getList()
}

function getServerSnapshot(): Conversation[] {
  return EMPTY
}

export function useConversations() {
  const conversations = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return {
    conversations,
    hydrated: conversations.length >= 0, // snapshot exists only on client
    upsert: conversationsStore.upsert,
    remove: conversationsStore.remove,
    togglePin: conversationsStore.togglePin,
    rename: conversationsStore.rename,
  }
}
