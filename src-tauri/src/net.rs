use reqwest::blocking::{Client, Response};
use std::{
    net::{IpAddr, ToSocketAddrs},
    time::Duration,
};
use url::Url;
fn parse_url(raw: &str) -> Result<Url, String> {
    let u = Url::parse(raw).map_err(|_| "Enter a valid HTTP or HTTPS URL")?;
    if !matches!(u.scheme(), "https" | "http") || !u.username().is_empty() || u.password().is_some()
    {
        return Err("Only public HTTP(S) URLs are allowed".into());
    }
    if u.host().is_none() {
        return Err("Missing host".into());
    }
    Ok(u)
}
fn public_addresses(u: &Url) -> Result<Vec<std::net::SocketAddr>, String> {
    let addresses = resolve(u)?;
    if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
        return Err("Local, private and reserved network addresses are blocked".into());
    }
    Ok(addresses)
}
pub fn validate(raw: &str) -> Result<Url, String> {
    let u = parse_url(raw)?;
    public_addresses(&u)?;
    Ok(u)
}
fn resolve(u: &Url) -> Result<Vec<std::net::SocketAddr>, String> {
    let port = u.port_or_known_default().ok_or("Unsupported scheme")?;
    match u.host().ok_or("Missing host")? {
        url::Host::Ipv4(ip) => Ok(vec![std::net::SocketAddr::new(ip.into(), port)]),
        url::Host::Ipv6(ip) => Ok(vec![std::net::SocketAddr::new(ip.into(), port)]),
        url::Host::Domain(host) => (host, port)
            .to_socket_addrs()
            .map(|i| i.collect())
            .map_err(|e| e.to_string()),
    }
}
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => {
            let o = a.octets();
            !(a.is_private()
                || a.is_loopback()
                || a.is_link_local()
                || a.is_multicast()
                || a.is_unspecified()
                || o[0] == 0
                || o[0] >= 240
                || o[0] == 127
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
                || (o[0] == 192 && o[1] == 0)
                || (o[0] == 198 && o[1] == 51)
                || (o[0] == 203 && o[1] == 0)
                || (o[0] == 192 && o[1] == 88 && o[2] == 99))
        }
        IpAddr::V6(a) => {
            let s = a.segments();
            s[0] & 0xe000 == 0x2000
                && s[0] != 0x2002
                && !(s[0] == 0x2001 && (s[1] == 0xdb8 || s[1] == 0))
                && a.to_ipv4_mapped().is_none()
        }
    }
}
pub fn get(
    raw: &str,
    etag: Option<&str>,
    modified: Option<&str>,
) -> Result<(Response, Url), String> {
    get_with_resolver(raw, etag, modified, public_addresses)
}
// The resolver is private; tests inject a loopback fixture server, production always validates public addresses.
fn get_with_resolver(
    raw: &str,
    etag: Option<&str>,
    modified: Option<&str>,
    resolver: impl Fn(&Url) -> Result<Vec<std::net::SocketAddr>, String>,
) -> Result<(Response, Url), String> {
    let mut u = parse_url(raw)?;
    for _ in 0..6 {
        // Pin each validated DNS answer to prevent a DNS rebinding between validation and connection.
        let host = u.host_str().ok_or("Missing host")?;
        let addresses = resolver(&u)?;
        let client = Client::builder()
            .no_proxy()
            .resolve_to_addrs(host, &addresses)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(25))
            .user_agent("Syndwell/0.1 (local RSS reader)")
            .build()
            .map_err(|e| e.to_string())?;
        let mut req = client.get(u.clone());
        if let Some(e) = etag {
            req = req.header("If-None-Match", e)
        }
        if let Some(m) = modified {
            req = req.header("If-Modified-Since", m)
        }
        let r = req.send().map_err(|e| e.to_string())?;
        if r.status().is_redirection() && r.status().as_u16() != 304 {
            let loc = r
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("Invalid redirect")?;
            u = parse_url(u.join(loc).map_err(|e| e.to_string())?.as_str())?;
            continue;
        }
        if r.status().as_u16() == 304 || r.status().is_success() {
            return Ok((r, u));
        }
        return Err(format!("Server returned {}", r.status()));
    }
    Err("Too many redirects".into())
}
pub fn body(r: Response) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    r.take(12 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("Response exceeds 12 MiB safety limit".into());
    }
    Ok(bytes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_unsafe() {
        for u in [
            "file:///etc/passwd",
            "http://127.0.0.1",
            "http://169.254.169.254",
            "http://[::1]",
            "http://10.0.0.1",
        ] {
            assert!(validate(u).is_err(), "{u}")
        }
    }
}

#[cfg(test)]
mod http_tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    fn server(response: String) -> (u16, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut bytes = vec![0; 8192];
            let n = stream.read(&mut bytes).unwrap();
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&bytes[..n]).to_string()
        });
        (port, thread)
    }
    #[test]
    fn conditional_http_and_not_modified() {
        let (port, thread) = server(
            "HTTP/1.1 304 Not Modified\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(),
        );
        let (r, _) = get_with_resolver(
            &format!("http://fixture.invalid:{port}/rss"),
            Some("\"cached\""),
            Some("Mon, 01 Jun 2026 10:00:00 GMT"),
            |_| Ok(vec![([127, 0, 0, 1], port).into()]),
        )
        .unwrap();
        assert_eq!(r.status().as_u16(), 304);
        let req = thread.join().unwrap().to_lowercase();
        assert!(req.contains("if-none-match: \"cached\""));
        assert!(req.contains("if-modified-since: mon, 01 jun 2026"));
    }
    #[test]
    fn redirect_to_internal_address_is_rejected() {
        let(port,thread)=server("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:9/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into());
        let result = get_with_resolver(
            &format!("http://fixture.invalid:{port}/rss"),
            None,
            None,
            |u| {
                if u.host_str() == Some("fixture.invalid") {
                    Ok(vec![([127, 0, 0, 1], port).into()])
                } else {
                    public_addresses(u)
                }
            },
        );
        assert!(result.err().unwrap().contains("blocked"));
        thread.join().unwrap();
    }
    #[test]
    fn fetched_rss_persists_and_reopens_offline() {
        let bytes = include_str!("../../tests/fixtures/rss.xml");
        let(port,thread)=server(format!("HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{bytes}",bytes.len()));
        let (r, _) = get_with_resolver(
            &format!("http://fixture.invalid:{port}/rss"),
            None,
            None,
            |_| Ok(vec![([127, 0, 0, 1], port).into()]),
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("network.sqlite3");
        crate::db::migrate(&path).unwrap();
        crate::db::open(&path)
            .unwrap()
            .execute(
                "INSERT INTO feeds(id,url,title) VALUES(1,'https://example.org/rss','Field Notes')",
                [],
            )
            .unwrap();
        assert_eq!(crate::feeds::store(&path, 1, &body(r).unwrap()).unwrap(), 2);
        thread.join().unwrap();
        let list = crate::dispatch(&path, "articles", serde_json::json!({})).unwrap();
        assert_eq!(list.as_array().unwrap().len(), 2);
    }
}
