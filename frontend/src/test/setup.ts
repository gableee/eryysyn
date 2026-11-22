import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Remove what each test rendered. Testing Library only does this by itself when Vitest's
// globals are on; without it, the next test finds the previous test's screen too.
afterEach(() => cleanup())
