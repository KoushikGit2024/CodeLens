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