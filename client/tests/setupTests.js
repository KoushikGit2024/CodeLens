import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver (often required by Monaco editor, Recharts, etc.)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock matchMedia (often required by UI libraries)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("../src/shared/context/ToastContext.jsx", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const mockUser = { id: 'test-user', email: 'test@example.com' };
vi.mock("../src/shared/context/AuthContext.jsx", () => ({ 
  useAuth: () => ({ 
    user: mockUser,
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUserPassword: vi.fn(),
    signInWithOAuth: vi.fn()
  }),
  AuthProvider: ({ children }) => children
}));

import React from 'react';

// Mock ReactFlow to prevent JSDOM memory leaks/infinite loops
vi.mock('reactflow', () => {
  return {
    default: ({ children }) => React.createElement('div', { 'data-testid': 'react-flow-mock' }, children),
    Controls: () => null,
    MiniMap: () => null,
    Background: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    applyNodeChanges: vi.fn(),
    useNodesState: (initial) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial) => [initial, vi.fn(), vi.fn()],
  };
});

// Mock Monaco Editor to prevent JSDOM memory leaks/crashing
vi.mock('@monaco-editor/react', () => {
  return {
    default: () => React.createElement('div', { 'data-testid': 'monaco-editor-mock' }),
  };
});