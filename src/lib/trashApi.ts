import { invoke } from "@tauri-apps/api/core";

export interface TrashItemResult {
  path: string;
  ok: boolean;
  error: string | null;
}

export const moveToTrash = (paths: string[]) =>
  invoke<TrashItemResult[]>("move_to_trash", { paths });
export const openTrash = () => invoke<void>("open_trash");
export const emptyTrash = () => invoke<void>("empty_trash");
export const getTrashCount = () => invoke<number>("get_trash_count");
export const toggleWindowLevel = () => invoke<void>("toggle_window_level");
export const showContextMenu = () => invoke<void>("show_context_menu");
