const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3000;

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

        // Basic argument parsing
        // This splits by whitespace but handles simple cases.
        // For a more robust solution in a real app, use a proper shell arg parser.
        const args = command.trim().split(/\s+/).slice(1);
        
        const nmap = spawn('nmap', args);

        nmap.stdout.on('data', (data) => {
          res.write(data);
        });

        nmap.stderr.on('data', (data) => {
          res.write(data);
        });

        nmap.on('close', (code) => {
          res.write(`\nProcess exited with code ${code}\n`);
          res.end();
        });

        nmap.on('error', (err) => {
          res.write(`\nError: ${err.message}\nMake sure nmap is installed and in your PATH.\n`);
          res.end();
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
