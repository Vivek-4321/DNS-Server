const dgram = require('dgram');
const dns = require('dns');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const server = dgram.createSocket('udp4');

const DNS_PORT = 5358;
const DNS_IP = '0.0.0.0';
const DNS_HEADER_SIZE = 12;
const DNS_QUERY_NAME_OFFSET = 12;

let dnsRecords = {};
let dnsCache = {};
let config = {
    upstreamServers: ['8.8.8.8', '1.1.1.1'],
    dohServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'],
    allowedClients: ['127.0.0.1', '::1'], // localhost IPv4 and IPv6
    cacheTTL: 300 // 5 minutes
};

// DNS record types
const RecordType = {
    A: 1,
    AAAA: 28,
    CNAME: 5,
    MX: 15,
    TXT: 16
};

// Load DNS records from a JSON file
function loadDnsRecords() {
    try {
        const data = fs.readFileSync('dns_records.json', 'utf8');
        dnsRecords = JSON.parse(data);
        console.log('DNS records loaded successfully');
    } catch (err) {
        console.error('Error loading DNS records:', err);
    }
}

// Save DNS records to a JSON file
function saveDnsRecords() {
    try {
        fs.writeFileSync('dns_records.json', JSON.stringify(dnsRecords, null, 2));
        console.log('DNS records saved successfully');
    } catch (err) {
        console.error('Error saving DNS records:', err);
    }
}

// Load configuration from a JSON file
function loadConfig() {
    try {
        const data = fs.readFileSync('config.json', 'utf8');
        const loadedConfig = JSON.parse(data);
        config = { ...config, ...loadedConfig };
        console.log('Configuration loaded successfully');
    } catch (err) {
        console.error('Error loading configuration:', err);
    }
}

// Save configuration to a JSON file
function saveConfig() {
    try {
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
        console.log('Configuration saved successfully');
    } catch (err) {
        console.error('Error saving configuration:', err);
    }
}

// Add a new DNS record
function addDnsRecord(domain, type, value) {
    if (!dnsRecords[domain]) {
        dnsRecords[domain] = {};
    }
    if (!dnsRecords[domain][type]) {
        dnsRecords[domain][type] = [];
    }
    dnsRecords[domain][type].push(value);
    saveDnsRecords();
}

// Remove a DNS record
function removeDnsRecord(domain, type, value) {
    if (dnsRecords[domain] && dnsRecords[domain][type]) {
        dnsRecords[domain][type] = dnsRecords[domain][type].filter(v => v !== value);
        if (dnsRecords[domain][type].length === 0) {
            delete dnsRecords[domain][type];
        }
        if (Object.keys(dnsRecords[domain]).length === 0) {
            delete dnsRecords[domain];
        }
        saveDnsRecords();
    }
}

function parseDnsQuery(msg) {
    const query = {};
    query.id = msg.readUInt16BE(0);
    query.flags = msg.readUInt16BE(2);
    query.questions = msg.readUInt16BE(4);
    query.answerRRs = msg.readUInt16BE(6);
    query.authorityRRs = msg.readUInt16BE(8);
    query.additionalRRs = msg.readUInt16BE(10);
    query.queryName = '';

    let offset = DNS_QUERY_NAME_OFFSET;
    while (msg[offset] !== 0) {
        const length = msg[offset];
        offset++;
        query.queryName += msg.toString('utf8', offset, offset + length) + '.';
        offset += length;
    }
    query.queryName = query.queryName.slice(0, -1); // Remove trailing dot
    offset++;
    query.queryType = msg.readUInt16BE(offset);
    query.queryClass = msg.readUInt16BE(offset + 2);

    return query;
}

function buildDnsResponse(query, records) {
    const response = Buffer.alloc(512);
    let offset = 0;

    // Header
     response.writeUInt16BE(query.id, offset);
    offset += 2;
    response.writeUInt16BE(0x8180, offset); // Flags: standard query response, no error
    offset += 2;
    response.writeUInt16BE(query.questions, offset);
    offset += 2;
    response.writeUInt16BE(records.length, offset); // Answer count
    offset += 2;
    response.writeUInt16BE(0, offset); // Authority RRs
    offset += 2;
    response.writeUInt16BE(0, offset); // Additional RRs
    offset += 2;

    // Question section
    const questionParts = query.queryName.split('.');
    for (const part of questionParts) {
        response.writeUInt8(part.length, offset);
        offset++;
        response.write(part, offset, 'ascii');
        offset += part.length;
    }
    response.writeUInt8(0, offset); // Terminator
    offset++;
    response.writeUInt16BE(query.queryType, offset);
    offset += 2;
    response.writeUInt16BE(query.queryClass, offset);
    offset += 2;

    // Answer section
    for (const record of records) {
        // Name pointer
        response.writeUInt16BE(0xc00c, offset);
        offset += 2;

        // Type
        response.writeUInt16BE(record.type, offset);
        offset += 2;

        // Class (IN)
        response.writeUInt16BE(1, offset);
        offset += 2;

        // TTL (5 minutes)
        response.writeUInt32BE(300, offset);
        offset += 4;

        // Data length and data
        if (record.type === RecordType.A) {
            response.writeUInt16BE(4, offset);
            offset += 2;
            const ipParts = record.data.split('.');
            for (const part of ipParts) {
                response.writeUInt8(parseInt(part), offset);
                offset++;
            }
        } else if (record.type === RecordType.AAAA) {
            response.writeUInt16BE(16, offset);
            offset += 2;
            const ipParts = record.data.split(':');
            for (const part of ipParts) {
                response.writeUInt16BE(parseInt(part, 16), offset);
                offset += 2;
            }
        } else if (record.type === RecordType.CNAME || record.type === RecordType.MX) {
            const domainBuffer = Buffer.from(record.data);
            response.writeUInt16BE(domainBuffer.length + 2, offset);
            offset += 2;
            if (record.type === RecordType.MX) {
                response.writeUInt16BE(record.priority, offset);
                offset += 2;
            }
            response.writeUInt8(domainBuffer.length, offset);
            offset++;
            domainBuffer.copy(response, offset);
            offset += domainBuffer.length;
            response.writeUInt8(0, offset);
            offset++;
        } else if (record.type === RecordType.TXT) {
            const txtBuffer = Buffer.from(record.data);
            response.writeUInt16BE(txtBuffer.length + 1, offset);
            offset += 2;
            response.writeUInt8(txtBuffer.length, offset);
            offset++;
            txtBuffer.copy(response, offset);
            offset += txtBuffer.length;
        }
    }

    return response.slice(0, offset);
}

async function forwardQuery(query) {
    return new Promise((resolve, reject) => {
        const request = Buffer.from(query);
        const client = dgram.createSocket('udp4');
        let isClosed = false;

        const closeSocket = () => {
            if (!isClosed) {
                isClosed = true;
                client.close();
            }
        };

        client.on('error', (err) => {
            closeSocket();
            reject(err);
        });

        client.on('message', (message) => {
            closeSocket();
            resolve(message);
        });

        client.send(request, 0, request.length, 53, config.upstreamServers[0], (err) => {
            if (err) {
                closeSocket();
                reject(err);
            }
        });

        // Set a timeout
        setTimeout(() => {
            closeSocket();
            reject(new Error('DNS query timed out'));
        }, 5000);
    });
}

function dohQuery(dohServer, dnsPacket) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/dns-message',
                'Content-Length': dnsPacket.length
            }
        };

        const req = https.request(dohServer, options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(Buffer.from(data, 'binary'));
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(dnsPacket);
        req.end();
    });
}

function isAllowedClient(clientIp) {
    return config.allowedClients.includes(clientIp);
}

function logRequest(clientIp, query, response) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        clientIp,
        queryName: query.queryName,
        queryType: query.queryType,
        responseCode: response.readUInt16BE(2) & 0x000f
    };
    fs.appendFile('dns_server.log', JSON.stringify(logEntry) + '\n', (err) => {
        if (err) console.error('Error writing to log file:', err);
    });
}

server.on('message', async (msg, rinfo) => {
    if (!isAllowedClient(rinfo.address)) {
        console.log(`Blocked request from unauthorized client: ${rinfo.address}`);
        return;
    }

    console.log(`Received DNS query from ${rinfo.address}:${rinfo.port}`);

    const query = parseDnsQuery(msg);
    console.log(`Query for ${query.queryName} (Type: ${query.queryType})`);

    const cacheKey = `${query.queryName}:${query.queryType}`;
    if (dnsCache[cacheKey] && dnsCache[cacheKey].expiry > Date.now()) {
        console.log(`Cache hit for ${cacheKey}`);
        // Create a new response with the correct query ID
        const cachedResponse = Buffer.from(dnsCache[cacheKey].response);
        cachedResponse.writeUInt16BE(query.id, 0);
        server.send(cachedResponse, rinfo.port, rinfo.address);
        logRequest(rinfo.address, query, cachedResponse);
        return;
    }

    try {
        let response;
        if (dnsRecords[query.queryName] && dnsRecords[query.queryName][query.queryType]) {
            const records = dnsRecords[query.queryName][query.queryType].map(data => ({ type: query.queryType, data }));
            response = buildDnsResponse(query, records);
        } else {
            console.log(`No record found for ${query.queryName}. Forwarding query...`);
            response = await forwardQuery(msg);
        }

        server.send(response, rinfo.port, rinfo.address, (err) => {
            if (err) {
                console.error('Error sending DNS response:', err);
            } else {
                console.log(`Sent DNS response to ${rinfo.address}:${rinfo.port}`);
            }
        });

        logRequest(rinfo.address, query, response);

        // Cache the response
        dnsCache[cacheKey] = {
            response,
            expiry: Date.now() + config.cacheTTL * 1000
        };
    } catch (err) {
        console.error('Error processing DNS query:', err);
    }
});

server.on('listening', () => {
    const address = server.address();
    console.log(`DNS server listening on ${address.address}:${address.port}`);
    loadDnsRecords();
    loadConfig();
});

server.on('error', (err) => {
    console.log(`Server error:\n${err.stack}`);
    server.close();
});

server.bind(DNS_PORT, DNS_IP);

// Simple command-line interface for managing DNS records and configuration
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function promptUser() {
    rl.question('Enter command (add, remove, list, config, quit): ', (command) => {
        switch (command.toLowerCase()) {
            case 'add':
                rl.question('Enter domain: ', (domain) => {
                    rl.question('Enter record type (A, AAAA, CNAME, MX, TXT): ', (type) => {
                        rl.question('Enter value: ', (value) => {
                            addDnsRecord(domain, RecordType[type], value);
                            console.log(`Added ${type} record: ${domain} -> ${value}`);
                            promptUser();
                        });
                    });
                });
                break;
            case 'remove':
                rl.question('Enter domain: ', (domain) => {
                    rl.question('Enter record type (A, AAAA, CNAME, MX, TXT): ', (type) => {
                        rl.question('Enter value to remove: ', (value) => {
                            removeDnsRecord(domain, RecordType[type], value);
                            console.log(`Removed ${type} record: ${domain} -> ${value}`);
                            promptUser();
                        });
                    });
                });
                break;
            case 'list':
                console.log('Current DNS records:');
                console.log(JSON.stringify(dnsRecords, null, 2));
                promptUser();
                break;
            case 'config':
                rl.question('Enter config option to change (upstreamServers, dohServers, allowedClients, cacheTTL): ', (option) => {
                    rl.question(`Enter new value for ${option}: `, (value) => {
                        if (option === 'upstreamServers' || option === 'dohServers' || option === 'allowedClients') {
                            config[option] = value.split(',').map(item => item.trim());
                        } else if (option === 'cacheTTL') {
                            config[option] = parseInt(value);
                        }
                        saveConfig();
                        console.log(`Updated ${option}`);
                        promptUser();
                    });
                });
                break;
            case 'quit':
                rl.close();
                server.close();
                process.exit(0);
            default:
                console.log('Invalid command');
                promptUser();
        }
    });
}

promptUser();
