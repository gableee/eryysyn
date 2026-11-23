import type { ReactNode } from 'react'

/** Feature files register their component states here; /dev/states (dev builds only) shows them all. */
const registry: { name: string; render: () => ReactNode }[] = []

export function registerStates(name: string, render: () => ReactNode): void {
  if (!registry.some((r) => r.name === name)) registry.push({ name, render })
}

export function registeredStates() {
  return registry
}
