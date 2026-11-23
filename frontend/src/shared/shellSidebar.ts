import { createContext, useContext } from 'react'

/**
 * The app shell tells pages whether it is in Reader mode (full window) and lets the Reader's toolbar open or
 * close the sidebar. Lives in shared/ so the Reader feature never imports the app shell.
 */
export type ShellSidebar = { inReader: boolean; open: boolean; setOpen(open: boolean): void }
export const ShellSidebarContext = createContext<ShellSidebar>({ inReader: false, open: false, setOpen: () => {} })
export const useShellSidebar = () => useContext(ShellSidebarContext)
