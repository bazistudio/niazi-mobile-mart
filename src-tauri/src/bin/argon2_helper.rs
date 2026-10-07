/// Argon2id CLI helper — invoked by the TypeScript backend via child_process.
///
/// Usage:
///   argon2-helper verify <argon2id-hash> <plaintext>
///     → exit 0 if plaintext matches hash, exit 1 if not
///
///   argon2-helper hash <plaintext>
///     → prints the Argon2id hash to stdout, exit 0 on success
///
/// This binary is compiled as part of the Rust workspace and deployed
/// alongside niazi-server in the Docker container. The TypeScript auth
/// layer spawns it as a subprocess to verify Argon2id password/PIN hashes
/// without needing a native Node.js argon2 binding.
use std::env;
use std::process;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: argon2-helper verify <hash> <plaintext>");
        eprintln!("       argon2-helper hash <plaintext>");
        process::exit(2);
    }

    match args[1].as_str() {
        "verify" => {
            if args.len() < 4 {
                eprintln!("verify requires two arguments: <hash> <plaintext>");
                process::exit(2);
            }
            let hash_str = &args[2];
            let plaintext = &args[3];

            let parsed = match PasswordHash::new(hash_str) {
                Ok(h) => h,
                Err(_) => {
                    // Invalid hash format → not a match
                    process::exit(1);
                }
            };

            if Argon2::default()
                .verify_password(plaintext.as_bytes(), &parsed)
                .is_ok()
            {
                process::exit(0);
            } else {
                process::exit(1);
            }
        }
        "hash" => {
            if args.len() < 3 {
                eprintln!("hash requires one argument: <plaintext>");
                process::exit(2);
            }
            let plaintext = &args[2];
            let salt = SaltString::generate(&mut OsRng);
            match Argon2::default().hash_password(plaintext.as_bytes(), &salt) {
                Ok(hash) => {
                    println!("{}", hash);
                    process::exit(0);
                }
                Err(e) => {
                    eprintln!("Hash failed: {e}");
                    process::exit(2);
                }
            }
        }
        cmd => {
            eprintln!("Unknown command: {cmd}");
            process::exit(2);
        }
    }
}
