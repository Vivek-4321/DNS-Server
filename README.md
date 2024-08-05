# 🌐 DNS Server

## 📚 Table of Contents
- [Introduction](#introduction)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Testing with dig](#testing-with-dig)
- [Configuration](#configuration)
- [Managing DNS Records](#managing-dns-records)
- [Logging](#logging)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🚀 Introduction

This custom DNS server is a powerful and flexible solution for managing domain name resolution. It provides features such as local DNS record management, forwarding queries to upstream servers, DNS-over-HTTPS (DoH) support, and more.

## ✨ Features

- 🏠 Local DNS record management
- 🔄 Query forwarding to upstream DNS servers
- 🔒 DNS-over-HTTPS (DoH) support
- 💾 DNS record caching
- 🔐 IP-based access control
- 📝 Request logging
- 🖥️ Command-line interface for managing records and configuration

## 📋 Requirements

- Node.js (v12.0.0 or higher)
- npm (usually comes with Node.js)

## 📥 Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/custom-dns-server.git
   ```

2. Navigate to the project directory:
   ```
   cd custom-dns-server
   ```

3. Install dependencies:
   ```
   npm install
   ```

## 🏃‍♂️ Usage

To start the DNS server:

```
node dns.js
```

The server will start listening on the default DNS port (53) on all interfaces. You may need to run the server with sudo privileges to bind to port 53.

## 🧪 Testing with dig

You can use the `dig` command to test your DNS server. Here are some examples:

1. Query an A record:
   ```
   dig @127.0.0.1 example.com A
   ```

2. Query an AAAA record:
   ```
   dig @127.0.0.1 example.com AAAA
   ```

3. Query a CNAME record:
   ```
   dig @127.0.0.1 www.example.com CNAME
   ```

4. Query an MX record:
   ```
   dig @127.0.0.1 example.com MX
   ```

5. Query a TXT record:
   ```
   dig @127.0.0.1 example.com TXT
   ```

Replace `127.0.0.1` with the IP address of your DNS server if it's running on a different machine.

## ⚙️ Configuration

The server uses a configuration file `config.json` to store settings. You can modify this file directly or use the command-line interface to update settings.

Available configuration options:
- `upstreamServers`: List of upstream DNS servers
- `dohServers`: List of DNS-over-HTTPS servers
- `allowedClients`: List of IP addresses allowed to query the server
- `cacheTTL`: Time-to-live for cached DNS records (in seconds)

## 📝 Managing DNS Records

Use the command-line interface to manage DNS records:

1. Start the CLI:
   ```
   node dns.js
   ```

2. Available commands:
   - `add`: Add a new DNS record
   - `remove`: Remove a DNS record
   - `list`: List all DNS records
   - `config`: Modify configuration settings
   - `quit`: Exit the CLI and stop the server

## 📊 Logging

The server logs all DNS requests to a file named `dns_server.log`. Each log entry includes:
- Timestamp
- Client IP address
- Queried domain name
- Query type
- Response code

## 🔧 Troubleshooting

- If the server fails to start, ensure you have the necessary permissions to bind to port 53.
- Check the console output for any error messages.
- Verify that the `config.json` and `dns_records.json` files exist and are properly formatted.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.