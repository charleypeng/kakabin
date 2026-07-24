mod trash_ops;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Emitter, Manager};

fn is_desktop_layer_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_SESSION_TYPE").map_or(true, |s| s != "wayland")
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

static FLOATING: AtomicBool = AtomicBool::new(true);

#[tauri::command]
async fn move_to_trash(paths: Vec<String>) -> Vec<trash_ops::TrashItemResult> {
    tauri::async_runtime::spawn_blocking(move || trash_ops::trash_all(paths))
        .await
        .unwrap_or_default()
}

#[tauri::command]
async fn open_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::open_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn empty_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(trash_ops::empty_trash)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_trash_count() -> usize {
    trash_ops::trash_count()
}

fn set_level(window: &tauri::WebviewWindow, floating: bool) {
    FLOATING.store(floating, Ordering::SeqCst);
    let _ = window.set_always_on_top(floating);
    if is_desktop_layer_supported() {
        let _ = window.set_always_on_bottom(!floating);
    }
}

#[tauri::command]
fn toggle_window_level(window: tauri::WebviewWindow) {
    if !is_desktop_layer_supported() {
        return;
    }
    let floating = !FLOATING.load(Ordering::SeqCst);
    set_level(&window, floating);
}

#[tauri::command]
fn show_context_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    let open = MenuItemBuilder::with_id("open", "打开垃圾桶")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let empty = MenuItemBuilder::with_id("empty", "清空垃圾桶")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let layer_ok = is_desktop_layer_supported();
    let level_text = if !layer_ok {
        "贴到桌面层 (不可用)"
    } else if FLOATING.load(Ordering::SeqCst) {
        "贴到桌面层"
    } else {
        "浮到最顶层"
    };
    let level = MenuItemBuilder::with_id("level", level_text)
        .enabled(layer_ok)
        .build(&window)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id("quit", "退出")
        .build(&window)
        .map_err(|e| e.to_string())?;
    let menu = MenuBuilder::new(&window)
        .items(&[&open, &empty, &level, &quit])
        .build()
        .map_err(|e| e.to_string())?;
    window.popup_menu(&menu).map_err(|e| e.to_string())
}

/// macOS：NSWindow.acceptsMouseMovedEvents 默认为 false，
/// 窗口未激活时 WebView 收不到 mousemove（必须先点一下才有悬停动效）。
/// 这里打开它，让鼠标划过即触发黑洞的引力注视。
#[cfg(target_os = "macos")]
fn enable_hover_mouse_events(window: &tauri::WebviewWindow) {
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = window.ns_window() {
        let ns_window = ptr as *mut AnyObject;
        if !ns_window.is_null() {
            unsafe {
                let () = objc2::msg_send![ns_window, setAcceptsMouseMovedEvents: true];
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                enable_hover_mouse_events(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            open_trash,
            empty_trash,
            get_trash_count,
            toggle_window_level,
            show_context_menu
        ])
        .on_menu_event(|app, event| {
            let Some(window) = app.get_webview_window("main") else { return };
            match event.id().0.as_str() {
                "open" => {
                    tauri::async_runtime::spawn(async { let _ = trash_ops::open_trash(); });
                }
                "empty" => {
                    let _ = window.emit("menu://empty-trash", ());
                }
                "level" => {
                    if is_desktop_layer_supported() {
                        let floating = !FLOATING.load(Ordering::SeqCst);
                        set_level(&window, floating);
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running BlkDustBin");
}
