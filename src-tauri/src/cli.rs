//! Headless developer utility. Not exposed to the renderer or shipped as the desktop binary.
use syndwell_lib::{db, dispatch, feeds};
fn main() {
    let result = (|| -> Result<serde_json::Value, String> {
        let args: Vec<String> = std::env::args().collect();
        let path = std::path::Path::new(
            args.get(1)
                .ok_or("Usage: syndwell-cli DATABASE OPERATION [JSON]")?,
        );
        db::migrate(path)?;
        let op = args.get(2).ok_or("Missing operation")?;
        if op == "--ingest-fixture" {
            let id = args
                .get(3)
                .ok_or("Missing feed ID")?
                .parse()
                .map_err(|_| "Invalid feed ID")?;
            let bytes =
                std::fs::read(args.get(4).ok_or("Missing fixture")?).map_err(|e| e.to_string())?;
            return Ok(serde_json::json!(feeds::store(path, id, &bytes)?));
        }
        let input = if let Some(s) = args.get(3) {
            s.clone()
        } else {
            use std::io::Read;
            let mut s = String::new();
            std::io::stdin()
                .read_to_string(&mut s)
                .map_err(|e| e.to_string())?;
            if s.trim().is_empty() {
                "{}".into()
            } else {
                s
            }
        };
        dispatch(
            path,
            op,
            serde_json::from_str(&input).map_err(|e| e.to_string())?,
        )
    })();
    match result {
        Ok(v) => println!("{v}"),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1)
        }
    }
}
