const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

// Ensure Nmap is in PATH (Windows)
if (process.platform === 'win32') {
  const nmapDir = 'C:\\Program Files (x86)\\Nmap';
  if (fs.existsSync(nmapDir) && !process.env.PATH.includes(nmapDir)) {
    process.env.PATH = `${process.env.PATH};${nmapDir}`;
  }
}


const PORT = 3000;

async function runFallbackScanner(target, res) {
  res.write(`[Notice] Nmap executable not found. Using fallback Node.js TCP scanner for ${target}...\n\n`);
  res.write(`PORT     STATE  SERVICE\n`);
  const ports = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 443: 'https', 3306: 'mysql', 3389: 'rdp', 8080: 'http-proxy' };
  
  for (const [port, svc] of Object.entries(ports)) {
    await new Promise(resolve => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      let status = 'filtered';
      
      socket.on('connect', () => {
        status = 'open';
        socket.destroy();
      });
      socket.on('timeout', () => {
        socket.destroy();
      });
      socket.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') status = 'closed';
        socket.destroy();
      });
      socket.on('close', () => {
        let colorCode = '';
        res.write(`${port.toString().padEnd(8)} ${status.padEnd(6)} ${svc}\n`);
        resolve();
      });
      
      socket.connect(port, target);
    });
  }
  res.write(`\nScan complete.\n`);
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.method === 'POST' && req.url === '/api/scan') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        if (!command || !command.startsWith('nmap')) {
          res.writeHead(400);
          return res.end('Invalid command');
        }

        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked'
        });

        const args = command.trim().split(/\s+/).slice(1);
        let target = args[args.length - 1];
        if (target && target.startsWith('-')) target = '127.0.0.1'; // basic fallback

        const nmap = spawn('nmap', args);
        let spawned = false;

        nmap.on('spawn', () => {
          spawned = true;
        });

        nmap.stdout.on('data', (data) => {
          res.write(data);
        });

        nmap.stderr.on('data', (data) => {
          res.write(data);
        });

        nmap.on('close', (code) => {
          if (spawned) {
            res.write(`\nProcess exited with code ${code}\n`);
            res.end();
          }
        });

        nmap.on('error', (err) => {
          if (err.code === 'ENOENT') {
            runFallbackScanner(target, res);
          } else {
            res.write(`\nError: ${err.message}\n`);
            res.end();
          }
        });
      } catch (err) {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
