'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/** Debug panel failure must not take down staff chat. */
export default class StaffChatDebugErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== 'undefined') {
      console.warn('[STAFF_CHAT_DEBUG_PANEL_ERROR]', error);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
