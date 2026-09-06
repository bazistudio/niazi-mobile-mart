fn main() {
    let res = std::panic::catch_unwind(|| {
        tauri_build::build();
    });
    if res.is_err() {
        println!("cargo:warning=tauri-winres skipped (windres not available in PATH); continuing build");
    }
}



