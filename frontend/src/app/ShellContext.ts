import { createContext, useContext, type ReactNode } from 'react'

/** Lets a feature put something in the sidebar (Chat's recent chats, Task 9) without the shell importing it. */
export const SidebarExtraContext = createContext<ReactNode>(null)
export const useSidebarExtra = () => useContext(SidebarExtraContext)
