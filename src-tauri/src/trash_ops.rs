use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct TrashItemResult {
    pub path: String,
    pub ok: bool,
    pub error: Option<String>,
}

pub fn normalize_paths(paths: Vec<String>) -> (Vec<PathBuf>, Vec<TrashItemResult>) {
    let mut seen = std::collections::HashSet::new();
    let mut valid = Vec::new();
    let mut invalid = Vec::new();
    for p in paths {
        let trimmed = p.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        let pb = PathBuf::from(trimmed);
        if pb.exists() {
            valid.push(pb);
        } else {
            invalid.push(TrashItemResult {
                path: trimmed.to_string(),
                ok: false,
                error: Some("路径不存在".to_string()),
            });
        }
    }
    (valid, invalid)
}

pub fn trash_all(paths: Vec<String>) -> Vec<TrashItemResult> {
    let (valid, mut results) = normalize_paths(paths);
    for pb in valid {
        let display = pb.display().to_string();
        match trash::delete(&pb) {
            Ok(_) => results.push(TrashItemResult { path: display, ok: true, error: None }),
            Err(e) => results.push(TrashItemResult {
                path: display,
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    results
}

pub fn open_trash() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let cmd = std::process::Command::new("open").arg(dirs_home_trash()).spawn();
    #[cfg(target_os = "windows")]
    let cmd = std::process::Command::new("explorer.exe")
        .arg("shell:RecycleBinFolder")
        .spawn();
    #[cfg(target_os = "linux")]
    let cmd = std::process::Command::new("xdg-open")
        .arg("trash:///")
        .spawn()
        .or_else(|_| std::process::Command::new("xdg-open").arg(dirs_home_trash()).spawn());
    cmd.map(|_| ()).map_err(|e| e.to_string())
}

fn dirs_home_trash() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".Trash")
    }
    #[cfg(target_os = "linux")]
    {
        PathBuf::from(std::env::var("HOME").unwrap_or_default())
            .join(".local/share/Trash/files")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::new()
    }
}

pub fn empty_trash() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("osascript")
            .arg("-e")
            .arg("tell application \"Finder\" to empty the trash")
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() { Ok(()) } else { Err("Finder 清空失败".into()) }
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::SHEmptyRecycleBinW;
        unsafe {
            SHEmptyRecycleBinW(None, None, 0)
                .map_err(|e| e.to_string())
        }
    }
    #[cfg(target_os = "linux")]
    {
        let base = PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".local/share/Trash");
        for sub in ["files", "info"] {
            let dir = base.join(sub);
            if dir.exists() {
                for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    let p = entry.path();
                    if p.is_dir() {
                        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
                    } else {
                        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        Ok(())
    }
}

pub fn trash_count() -> usize {
    #[cfg(target_os = "macos")]
    {
        let dir = dirs_home_trash();
        std::fs::read_dir(dir).map(|d| d.filter(|e| {
            e.as_ref().map(|x| x.file_name().to_string_lossy() != ".DS_Store").unwrap_or(false)
        }).count()).unwrap_or(0)
    }
    #[cfg(target_os = "linux")]
    {
        let dir = dirs_home_trash();
        std::fs::read_dir(dir).map(|d| d.count()).unwrap_or(0)
    }
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};
        let mut info = SHQUERYRBINFO {
            cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            match SHQueryRecycleBinW(None, &mut info) {
                Ok(_) => info.i64NumItems as usize,
                Err(_) => 0,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_dedups_and_filters_empty() {
        let tmp = std::env::temp_dir().join("blkdustbin_test_file");
        std::fs::write(&tmp, b"x").unwrap();
        let (valid, invalid) = normalize_paths(vec![
            tmp.display().to_string(),
            tmp.display().to_string(),
            "  ".to_string(),
        ]);
        assert_eq!(valid.len(), 1);
        assert_eq!(invalid.len(), 0);
        std::fs::remove_file(&tmp).unwrap();
    }

    #[test]
    fn normalize_marks_missing_path_invalid() {
        let (valid, invalid) = normalize_paths(vec!["/definitely/not/here.xyz".to_string()]);
        assert_eq!(valid.len(), 0);
        assert_eq!(invalid.len(), 1);
        assert!(!invalid[0].ok);
        assert!(invalid[0].error.is_some());
    }

    #[test]
    #[ignore]
    fn trash_all_moves_real_file_to_system_trash() {
        let tmp = std::env::temp_dir().join("blkdustbin_trash_it.txt");
        std::fs::write(&tmp, b"bye").unwrap();
        let results = trash_all(vec![tmp.display().to_string()]);
        assert!(results.iter().any(|r| r.ok));
        assert!(!tmp.exists());
    }
}
